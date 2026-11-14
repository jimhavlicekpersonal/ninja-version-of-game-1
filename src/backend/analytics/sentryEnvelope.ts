/**
 * Error reports in Sentry's envelope format (roadmap step 17), without the
 * Sentry SDK: the game and the server only need "send this exception". Pure
 * (no fetch, no globals), shared by the browser reporter
 * (analytics/crashReports.ts) and the server (server/observability.ts).
 *
 * Privacy: reports carry the error message (URL query strings and email-like
 * text scrubbed, see scrubText), the stack (file names without query
 * strings), the build, the platform and a few tags. The game never attaches a
 * player name, id, token, chat text or save, but an error message can quote
 * whatever text the code was handling, so this is not a guarantee.
 */

export interface SentryDsn {
  publicKey: string;
  projectId: string;
  /** https://<host>/api/<project>/envelope/ */
  envelopeUrl: string;
  dsn: string;
}

/** https://<publicKey>@<host>[/<path>]/<projectId>, or null when it is not a DSN. */
export function parseDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn) return null;
  let u: URL;
  try {
    u = new URL(dsn);
  } catch {
    return null;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const projectId = parts.pop();
  if (!u.username || !projectId || !/^\d+$/.test(projectId) || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  const path = parts.length ? `/${parts.join('/')}` : '';
  return { publicKey: u.username, projectId, envelopeUrl: `${u.protocol}//${u.host}${path}/api/${projectId}/envelope/`, dsn };
}

interface StackFrame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}

/** Drop query strings and fragments (they can carry tokens or player data). */
export function scrubUrl(u: string): string {
  return u.replace(/[?#].*$/, '');
}

/**
 * Frames from a V8 ("    at fn (file:1:2)"), Firefox or Safari ("fn@file:1:2")
 * stack, oldest call first as Sentry expects.
 */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    let m = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) m = /^(.*?)@(.+?):(\d+):(\d+)$/.exec(line);
    if (!m) continue;
    const filename = scrubUrl(m[2]);
    frames.push({ function: m[1] || '?', filename, lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|^node:|^internal\//.test(filename) });
  }
  return frames.reverse();
}

export interface SentryEventInput {
  error: unknown;
  platform: 'node' | 'javascript';
  release: string;
  environment: string;
  level?: 'fatal' | 'error' | 'warning';
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  /** Method and path only (scrubbed of query strings). */
  request?: { method?: string; url?: string };
}

/** A 32-hex event id from any random source (crypto when available). */
export function eventId(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(random() * 16).toString(16);
  return s;
}

/**
 * Best-effort scrub of an error message: query strings and fragments of URLs in it (they can carry tokens) and
 * anything shaped like an email address. It cannot recognise every piece of player data a message might quote.
 */
export function scrubText(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, '$1').replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, '[email]');
}

function exceptionOf(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) return { type: error.name || 'Error', value: scrubText(error.message).slice(0, 1000), stack: error.stack };
  return { type: 'Error', value: scrubText(String(error)).slice(0, 1000) };
}

/** One envelope (newline-delimited JSON) holding one error event. */
export function buildEnvelope(dsn: SentryDsn, input: SentryEventInput, id: string, nowMs: number): string {
  const ex = exceptionOf(input.error);
  const event = {
    event_id: id,
    timestamp: nowMs / 1000,
    platform: input.platform,
    level: input.level ?? 'error',
    release: input.release,
    environment: input.environment,
    tags: input.tags ?? {},
    extra: input.extra ?? {},
    ...(input.request ? { request: { method: input.request.method, url: input.request.url ? scrubUrl(input.request.url) : undefined } } : {}),
    exception: { values: [{ type: ex.type, value: ex.value, stacktrace: { frames: parseStack(ex.stack) } }] },
  };
  const header = { event_id: id, sent_at: new Date(nowMs).toISOString(), dsn: dsn.dsn };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
}

/** Where to POST: the key goes in the query string, so a browser sends a simple (no preflight) request. */
export function envelopeEndpoint(dsn: SentryDsn, client: string): string {
  return `${dsn.envelopeUrl}?sentry_key=${encodeURIComponent(dsn.publicKey)}&sentry_version=7&sentry_client=${encodeURIComponent(client)}`;
}

/** At most `max` reports per `windowMs`, and the same message only once per window. */
export class ReportThrottle {
  private sent: number[] = [];
  private seen = new Map<string, number>();
  constructor(
    private readonly max = 10,
    private readonly windowMs = 60_000,
  ) {}
  allow(key: string, now: number): boolean {
    this.sent = this.sent.filter((t) => now - t < this.windowMs);
    const last = this.seen.get(key);
    if (this.sent.length >= this.max || (last !== undefined && now - last < this.windowMs)) return false;
    this.sent.push(now);
    this.seen.set(key, now);
    if (this.seen.size > 200) for (const [k, t] of this.seen) if (now - t >= this.windowMs) this.seen.delete(k);
    return true;
  }
}
