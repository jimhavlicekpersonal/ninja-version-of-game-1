/**
 * Crash reports from the game to Sentry (roadmap step 17). Only when the build
 * has a DSN (VITE_SENTRY_DSN) and the player has not switched them off
 * (Settings → Send crash reports). Uncaught errors and unhandled promise
 * rejections are sent as Sentry envelopes with the build, platform and stack:
 * no player name, id, token, chat or save (see sentryEnvelope.ts). Never in
 * the testing sandbox. At most 10 reports a minute, each message once.
 */
import { buildEnvelope, envelopeEndpoint, eventId, parseDsn, ReportThrottle, type SentryDsn } from './sentryEnvelope';

export interface CrashReporterOptions {
  dsn: string | undefined;
  release: string;
  /** 'web' | 'ios' | 'android'. */
  environment: string;
  /** The player's choice, read at the moment of each report. */
  enabled(): boolean;
  tags?: Record<string, string>;
  post?(url: string, body: string): void;
  now?(): number;
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
    const body = buildEnvelope(this.dsn, { error, platform: 'javascript', release: this.o.release, environment: this.o.environment, tags: { side: 'client', ...this.o.tags, ...tags } }, eventId(random), now);
    this.sent++;
    const url = envelopeEndpoint(this.dsn, 'kagemura-web/1');
    if (this.o.post) this.o.post(url, body);
    // text/plain keeps it a simple request (no CORS preflight); keepalive lets it finish as the page closes.
    else void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => undefined);
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
