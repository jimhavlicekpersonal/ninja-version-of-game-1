/**
 * Crash reports from the game to Sentry (roadmap step 17). Only when the build
 * has a DSN (VITE_SENTRY_DSN) and the player has not switched them off
 * (Settings → Send crash reports). Uncaught errors and unhandled promise
 * rejections are sent as Sentry envelopes with the build, platform and stack:
 * no player name, id, token, chat or save (see sentryEnvelope.ts). Never in
 * the testing sandbox. At most 10 reports a minute, each message once.
 */
import { buildEnvelope, buildSessionEnvelope, envelopeEndpoint, eventId, parseDsn, ReportThrottle, type SentryDsn } from './sentryEnvelope';

interface CrashReporterOptions {
  dsn: string | undefined;
  release: string;
  /** Beast Mode STB-02: the build's platform as Sentry's `dist`. */
  dist?: string;
  /** 'web' | 'ios' | 'android'. */
  environment: string;
  /** The player's choice, read at the moment of each report. */
  enabled(): boolean;
  tags?: Record<string, string>;
  /**
   * Beast Mode STB-05: what the game was doing, read at report time (scene, battle, quality, renderer, the last
   * command's type, online status). Values only, never names, ids or chat.
   */
  context?(): Record<string, string>;
  post?(url: string, body: string): void;
  now?(): number;
}

/**
 * Whether crash reports may be sent now (compliance switches 2026-11-14, C04; main.ts `enabled`): the player
 * switched them on, and the village's band is not under 13 (never for an under-13 band, in any mode).
 */
export function crashReportsAllowed(prefOn: boolean, band: string | null | undefined): boolean {
  return prefOn && band !== 'under13';
}

export class CrashReporter {
  private readonly dsn: SentryDsn | null;
  private readonly throttle = new ReportThrottle(10, 60_000);
  /** Reports handed over for sending (tests). */
  sent = 0;

  constructor(private readonly o: CrashReporterOptions) {
    this.dsn = parseDsn(o.dsn);
  }

  /** A DSN is built in: the Settings switch is worth showing. */
  get configured(): boolean {
    return this.dsn !== null;
  }

  report(error: unknown, tags: Record<string, string> = {}): void {
    if (!this.dsn || !this.o.enabled()) return;
    const now = this.o.now?.() ?? Date.now();
    const msg = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    if (!this.throttle.allow(msg, now)) return;
    const random = typeof crypto !== 'undefined' && crypto.getRandomValues ? () => crypto.getRandomValues(new Uint8Array(1))[0] / 256 : Math.random;
    let context: Record<string, string> = {};
    try {
      context = this.o.context?.() ?? {};
    } catch {
      /* a broken context never stops the report */
    }
    const body = buildEnvelope(this.dsn, { error, platform: 'javascript', release: this.o.release, ...(this.o.dist ? { dist: this.o.dist } : {}), environment: this.o.environment, tags: { side: 'client', ...this.o.tags, ...context, ...tags } }, eventId(random), now);
    this.sent++;
    if (this.session) this.session.errors++;
    this.post(body);
  }

  private post(body: string): void {
    if (!this.dsn) return;
    const url = envelopeEndpoint(this.dsn, 'kagemura-web/1');
    if (this.o.post) this.o.post(url, body);
    // text/plain keeps it a simple request (no CORS preflight); keepalive lets it finish as the page closes.
    else void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => undefined);
  }

  /** STB-05: the running session (release health), while crash reports are allowed. */
  private session: { sid: string; started: number; errors: number; sentInit: boolean } | null = null;

  /** STB-05 / OPS-08: start a session (sent only while crash reports are allowed; no user or device id). */
  startSession(): void {
    if (!this.dsn || this.session) return;
    const now = this.o.now?.() ?? Date.now();
    this.session = { sid: eventId(), started: now, errors: 0, sentInit: false };
    this.sendSession('ok');
  }

  /** STB-05: end the session: `exited` on a normal hide or close, `crashed` after a fatal error. */
  endSession(status: 'exited' | 'crashed' | 'abnormal'): void {
    if (!this.session) return;
    this.sendSession(status);
    this.session = null;
  }

  private sendSession(status: 'ok' | 'exited' | 'crashed' | 'abnormal'): void {
    if (!this.dsn || !this.session || !this.o.enabled()) return;
    const now = this.o.now?.() ?? Date.now();
    const s = this.session;
    this.post(buildSessionEnvelope(this.dsn, { sid: s.sid, init: !s.sentInit, status, started: s.started, duration: now - s.started, errors: s.errors, release: this.o.release, environment: this.o.environment }, now));
    s.sentInit = true;
  }

  /** Listen for uncaught errors and unhandled rejections on this window. */
  install(target: Pick<Window, 'addEventListener'> = window): void {
    if (!this.dsn) return;
    target.addEventListener('error', (e: Event) => {
      const ev = e as ErrorEvent;
      this.report(ev.error ?? new Error(ev.message || 'Script error'), { kind: 'error' });
    });
    target.addEventListener('unhandledrejection', (e: Event) => this.report((e as PromiseRejectionEvent).reason, { kind: 'unhandledrejection' }));
  }
}
