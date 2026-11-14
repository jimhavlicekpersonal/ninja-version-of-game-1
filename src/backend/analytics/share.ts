/**
 * Sharing play statistics (state-of-the-game report, section 5 step 5, growth 1).
 *
 * The game's own event log stays on the device (`events.ts`). When an adult player says yes
 * (the question is never asked under 18 or with an unknown age), the shareable part of it goes
 * to the server under a random statistics id: only the events and fields of `STATS_EVENTS`, no
 * token, no player id. What the device recorded before the yes goes too (the question says so),
 * so the tutorial funnel includes the first minutes of play. Saying no later deletes what this id
 * sent (retried until the server confirms) and the next yes starts a new id. A stricter age band
 * later (another device, a parent) switches sharing off the same way.
 *
 * Batches go every `FLUSH_MS` while the game is open and when it is hidden; nothing is kept on
 * disk, so a few events can be lost when the app is killed (statistics, not a ledger).
 */
import { cleanStatsEvent, STATS_MAX_BATCH, type StatsBatch, type StatsEvent } from '../net/stats';
import type { KeyValue } from '../net/connection';
import type { AnalyticsEvent } from './events';

type StatsChoice = 'unasked' | 'on' | 'off';

const CHOICE = 'tk.stats.choice';
const INSTALL = 'tk.stats.install';
const FORGET = 'tk.stats.forget';
/** How often a batch goes while playing. */
const FLUSH_MS = 5 * 60_000;
/** Events held while the server can't be reached (the oldest go first). */
const MAX_QUEUE = 2000;
/** Events recorded before the yes that are shared with it. */
const BACKLOG = 1000;

export interface StatsTransport {
  send(batch: StatsBatch, opts?: { keepalive?: boolean }): Promise<void>;
  forget(install: string): Promise<void>;
}

/** POST/DELETE `${baseUrl}/v1/stats`, with no token and no player headers. */
export function httpStatsTransport(baseUrl: string, fetchFn: typeof fetch = (...a) => fetch(...a)): StatsTransport {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/stats`;
  const ok = async (r: Promise<Response>) => {
    const res = await r;
    if (!res.ok) throw new Error(`statistics: server answered ${res.status}`);
  };
  return {
    send: (batch, opts) => ok(fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch), keepalive: opts?.keepalive === true, credentials: 'omit' })),
    forget: (install) => ok(fetchFn(`${url}?install=${encodeURIComponent(install)}`, { method: 'DELETE', credentials: 'omit' })),
  };
}

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // The LAN dev server is plain HTTP (no randomUUID): a v4-shaped id from getRandomValues or Math.random.
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

interface StatsSharingOptions {
  kv: KeyValue;
  /** Null: this build has no server (nothing is ever asked or sent). */
  transport: StatsTransport | null;
  /** Game build, e.g. "0.1.0+android". */
  build: string;
  /** The village's age band; only 'adult' may share. */
  ageBand(): string | null;
  /** The experiment arm this session plays ("experiment:arm"), if any. */
  arm?(): string | undefined;
  /** The server lists `stats` in /v1/hello (unknown yet: false). */
  serverReady?(): boolean;
  /** What the device recorded so far, most recent first (`Analytics.recent`). */
  backlog?(limit: number): Promise<AnalyticsEvent[]>;
  newId?(): string;
}

export class StatsSharing {
  private queue: StatsEvent[] = [];
  private sending = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') void this.flush({ keepalive: true });
  };

  constructor(private readonly o: StatsSharingOptions) {}

  /** The statistics id kept on this device (null unless sharing is on): experiment arms are picked by it. */
  static installIdIn(kv: KeyValue): string | null {
    return kv.get(CHOICE) === 'on' ? kv.get(INSTALL) : null;
  }

  get choice(): StatsChoice {
    const v = this.o.kv.get(CHOICE);
    return v === 'on' || v === 'off' ? v : 'unasked';
  }

  /** May this player be asked, or switch it on, at all (a server that takes statistics, an adult)? */
  get available(): boolean {
    return Boolean(this.o.transport) && this.o.ageBand() === 'adult' && (this.o.serverReady?.() ?? true);
  }

  /** Ask once: an adult, a server that takes statistics, and no answer yet. */
  get shouldAsk(): boolean {
    return this.available && this.choice === 'unasked';
  }

  get on(): boolean {
    return this.choice === 'on' && this.o.ageBand() === 'adult';
  }

  /** `Analytics.onLog`: queue the shareable part of an event while sharing is on. */
  hear(e: AnalyticsEvent): void {
    if (!this.on) return;
    const clean = cleanStatsEvent(e);
    if (!clean) return;
    this.queue.push(clean);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  /** The player's answer (the question, or the Settings switch). */
  async set(on: boolean): Promise<void> {
    if (on) {
      if (!this.available) return;
      const fresh = this.choice !== 'on' || !this.o.kv.get(INSTALL);
      if (fresh) this.o.kv.set(INSTALL, (this.o.newId ?? uuid)());
      this.o.kv.set(CHOICE, 'on');
      if (fresh && this.o.backlog) {
        // What the device recorded before the yes (oldest first), then anything heard since.
        const past = (await this.o.backlog(BACKLOG).catch(() => [] as AnalyticsEvent[])).reverse();
        const cleaned = past.map((e) => cleanStatsEvent(e)).filter((e): e is StatsEvent => e !== null);
        this.queue = [...cleaned, ...this.queue].slice(-MAX_QUEUE);
      }
      void this.flush();
      return;
    }
    const install = this.o.kv.get(INSTALL);
    this.o.kv.set(CHOICE, 'off');
    this.o.kv.set(INSTALL, null);
    this.queue = [];
    if (install) {
      this.o.kv.set(FORGET, install);
      await this.forgetPending();
    }
  }

  /** Send what is queued (in batches); keeps it for the next round if the server can't be reached. */
  async flush(opts?: { keepalive?: boolean }): Promise<void> {
    if (this.choice === 'on' && this.o.ageBand() !== null && this.o.ageBand() !== 'adult') {
      // The village is now known to be under 18: stop and delete what was sent.
      await this.set(false);
      return;
    }
    await this.forgetPending();
    const install = this.o.kv.get(INSTALL);
    if (!this.on || !install || !this.o.transport || this.sending || !this.queue.length) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const events = this.queue.slice(0, opts?.keepalive ? 50 : STATS_MAX_BATCH);
        const arm = this.o.arm?.();
        await this.o.transport.send({ install, build: this.o.build, ...(arm ? { arm } : {}), events }, opts);
        this.queue.splice(0, events.length);
      }
    } catch {
      /* offline or refused: the queue waits for the next round */
    } finally {
      this.sending = false;
    }
  }

  private async forgetPending(): Promise<void> {
    const id = this.o.kv.get(FORGET);
    if (!id || !this.o.transport) return;
    try {
      await this.o.transport.forget(id);
      this.o.kv.set(FORGET, null);
    } catch {
      /* retried on the next round and the next start */
    }
  }

  /** Flush every FLUSH_MS and when the game is hidden. */
  start(): void {
    if (this.timer || !this.o.transport) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHide);
    void this.flush();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHide);
  }

  /** Queued events (tests). */
  get pending(): number {
    return this.queue.length;
  }
}
