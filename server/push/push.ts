import { notificationText } from '../localization';
/**
 * Server-sent push (roadmap step 40): "your village was raided", "warriors
 * arrived", "the Alliance War has started". Each device registers its token
 * with the types it switched on and its time zone; the same rules as the
 * game's own reminders apply (`planNotifications`): only types switched on,
 * nothing in quiet hours (a push that would land in them is dropped: the
 * game shows the raid when it opens), and at most `maxPerDay` a local day.
 *
 * Transports, node only: APNs over HTTP/2 with a token key (.p8, ES256 JWT),
 * and FCM HTTP v1 with a service account. Tokens APNs or FCM call invalid are
 * removed.
 *
 * Configuration (server env): APNS_KEY (the .p8 text), APNS_KEY_ID,
 * APNS_TEAM_ID, APNS_TOPIC (the bundle id), APNS_SANDBOX=1 for development
 * builds (staging); FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_JSON (or the
 * GOOGLE_SERVICE_ACCOUNT_JSON key when it has the Firebase role).
 */
import { connect, type ClientHttp2Session } from 'node:http2';
import { createSign } from 'node:crypto';
import { inQuietHours, localDay } from '../../src/gameplay/sim/reminders';
import type { GameData } from '../../src/gameplay/sim/types';
import type { Metrics } from '../observability';
import { ServiceAccountAuth, type Fetch, type ServiceAccount } from '../payments/google';
import type { Repo } from '../repo';

export interface PushMessage {
  /** A notifications.json type id ('raided', 'donations', 'groveRaid'). */
  type: string;
  title: string;
  body: string;
}

export type SendResult = 'sent' | 'invalid' | 'failed';
export type PushOutcome = SendResult | 'off' | 'quiet' | 'limit';

export interface PushTransport {
  readonly platforms: ('ios' | 'android')[];
  send(platform: 'ios' | 'android', token: string, m: PushMessage): Promise<SendResult>;
}

export interface Pusher {
  /** True when at least one transport is set up (listed as the `push` feature). */
  readonly enabled: boolean;
  /** Fire and forget: never slows or fails the request that caused it. */
  notify(playerId: string, m: PushMessage): void;
}

export const noPush: Pusher = { enabled: false, notify() {} };

type Log = (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void;

export class ServerPush implements Pusher {
  readonly enabled = true;
  /** Deliveries still running (tests wait for them). */
  readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly o: { repo: Repo; data: GameData; transport: PushTransport; now: () => number; metrics?: Metrics; log?: Log },
  ) {}

  notify(playerId: string, m: PushMessage): void {
    const p = this.deliver(playerId, m).catch((e: Error) => this.o.log?.('warn', 'push failed', { error: e.message }));
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  /** Send to each of the player's devices, by its own choices. */
  async deliver(playerId: string, m: PushMessage): Promise<PushOutcome[]> {
    const now = this.o.now();
    const out: PushOutcome[] = [];
    for (const t of await this.o.repo.pushTokensOf(playerId)) {
      let r: PushOutcome;
      const day = localDay(now, t.tzOffsetMinutes);
      if (!t.types.includes(m.type)) r = 'off';
      else if (!this.o.transport.platforms.includes(t.platform)) r = 'failed';
      else if (inQuietHours(now, t.tzOffsetMinutes, this.o.data)) r = 'quiet';
      else if ((t.day === day ? t.sent : 0) >= this.o.data.notifications.maxPerDay) r = 'limit';
      else {
        r = await this.o.transport.send(t.platform, t.token, { ...m, title: notificationText(m.title, t.locale), body: notificationText(m.body, t.locale) });
        if (r === 'sent') await this.o.repo.countPush(t.token, day);
        if (r === 'invalid') await this.o.repo.removePushToken(t.token);
      }
      this.o.metrics?.count('tk_push_total', { type: m.type, result: r });
      out.push(r);
    }
    return out;
  }
}

const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

/** Apple Push Notification service over HTTP/2 with a token-based key. */
export class ApnsTransport implements PushTransport {
  readonly platforms = ['ios' as const];
  private jwt: { token: string; at: number } | null = null;
  private session: ClientHttp2Session | null = null;

  constructor(private readonly o: { key: string; keyId: string; teamId: string; topic: string; sandbox?: boolean; now: () => number }) {}

  private bearer(): string {
    // Apple wants a new token at most every 20 minutes and at least every hour.
    if (this.jwt && this.o.now() - this.jwt.at < 50 * 60_000) return this.jwt.token;
    const unsigned = `${enc({ alg: 'ES256', kid: this.o.keyId })}.${enc({ iss: this.o.teamId, iat: Math.floor(this.o.now() / 1000) })}`;
    const sig = createSign('sha256').update(unsigned).sign({ key: this.o.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    this.jwt = { token: `${unsigned}.${sig}`, at: this.o.now() };
    return this.jwt.token;
  }

  private client(): ClientHttp2Session {
    if (!this.session || this.session.closed || this.session.destroyed) {
      this.session = connect(this.o.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
      this.session.on('error', () => (this.session = null));
      this.session.unref();
    }
    return this.session;
  }

  send(_platform: 'ios' | 'android', token: string, m: PushMessage): Promise<SendResult> {
    return new Promise((resolve) => {
      let req;
      try {
        req = this.client().request({
          ':method': 'POST',
          ':path': `/3/device/${encodeURIComponent(token)}`,
          authorization: `bearer ${this.bearer()}`,
          'apns-topic': this.o.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        });
      } catch {
        resolve('failed');
        return;
      }
      let status = 0;
      let body = '';
      req.setTimeout(10_000, () => req.close());
      req.on('response', (h) => (status = Number(h[':status'])));
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('error', () => resolve('failed'));
      req.on('close', () => {
        if (status === 200) resolve('sent');
        else if (status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(body))) resolve('invalid');
        else resolve('failed');
      });
      req.end(JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default' }, type: m.type }));
    });
  }
}

/** Firebase Cloud Messaging HTTP v1. */
export class FcmTransport implements PushTransport {
  readonly platforms = ['android' as const];
  private readonly auth: ServiceAccountAuth;

  constructor(private readonly o: { projectId: string; account: ServiceAccount; fetch: Fetch; now: () => number }) {
    this.auth = new ServiceAccountAuth(o.account, 'https://www.googleapis.com/auth/firebase.messaging', o.fetch, o.now);
  }

  async send(_platform: 'ios' | 'android', token: string, m: PushMessage): Promise<SendResult> {
    try {
      const res = await this.o.fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.o.projectId)}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await this.auth.token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title: m.title, body: m.body }, data: { type: m.type }, android: { priority: 'high' } } }),
      });
      if (res.ok) return 'sent';
      const text = await res.text();
      return res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text) ? 'invalid' : 'failed';
    } catch {
      return 'failed';
    }
  }
}

/** Both platforms behind one transport. */
export function combineTransports(list: PushTransport[]): PushTransport {
  return {
    platforms: list.flatMap((t) => t.platforms),
    async send(platform, token, m) {
      const t = list.find((x) => x.platforms.includes(platform));
      return t ? t.send(platform, token, m) : 'failed';
    },
  };
}

/** The configured transports from the server's environment, or null when push is not set up. */
export function pushTransportFromEnv(env: Record<string, string | undefined>, fetch: Fetch, now: () => number): PushTransport | null {
  const list: PushTransport[] = [];
  if (env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_TOPIC) {
    list.push(new ApnsTransport({ key: env.APNS_KEY.replace(/\\n/g, '\n'), keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, topic: env.APNS_TOPIC, sandbox: env.APNS_SANDBOX === '1', now }));
  }
  const fcmKey = env.FCM_SERVICE_ACCOUNT_JSON ?? env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (env.FCM_PROJECT_ID && fcmKey) list.push(new FcmTransport({ projectId: env.FCM_PROJECT_ID, account: JSON.parse(fcmKey) as ServiceAccount, fetch, now }));
  return list.length ? combineTransports(list) : null;
}
