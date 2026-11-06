/**
 * Observability (roadmap step 17), with no extra dependencies:
 * - `PromMetrics`: counters and histograms in Prometheus text format, served
 *   at GET /metrics (behind METRICS_TOKEN). The core records re-simulation
 *   time, battles and desyncs through the `Metrics` port; the HTTP adapter
 *   records requests, latency, errors by code and rate limits.
 * - `ServerSentry`: sends server errors (5xx, crashes) to Sentry as envelopes.
 * Logs are Fastify's structured JSON (pino), with tokens redacted and a
 * request id on every line and response (x-request-id).
 */
import { randomBytes } from 'node:crypto';
import { buildEnvelope, envelopeEndpoint, parseDsn, ReportThrottle, type SentryDsn, type SentryEventInput } from '../src/backend/analytics/sentryEnvelope';

export type Labels = Record<string, string>;

/** What the server core records (a no-op unless the server wires real metrics). */
export interface Metrics {
  count(name: string, labels?: Labels, by?: number): void;
  observe(name: string, value: number, labels?: Labels): void;
}

export const noMetrics: Metrics = { count() {}, observe() {} };

/** Every metric the server records, with its help text (Prometheus HELP lines). */
export const METRIC_HELP: Record<string, string> = {
  tk_http_requests_total: 'HTTP requests by route, method and status.',
  tk_http_request_duration_ms: 'HTTP request time in milliseconds, by route.',
  tk_errors_total: 'Error answers by protocol error code (server_error for 5xx).',
  tk_rate_limited_total: 'Requests refused by a rate limit, by rule.',
  tk_consent_rescinded_total: 'App Store parental consent withdrawals (RESCIND_CONSENT), by whether the account was found.',
  tk_stats_events_total: 'Shared play-statistics events kept (report section 5 step 5).',
  tk_battles_total: 'Battles re-simulated and settled, by kind (pvp, raid) and battle rules version.',
  tk_resim_ms: 'Time to re-simulate one battle in milliseconds, by kind.',
  tk_desyncs_total: "Battles whose client result hash differed from the server's, by kind and battle rules version.",
  tk_resim_wait_ms: 'Time a reported battle waited for a free re-simulation worker (roadmap step 57).',
  tk_resim_busy_total: 'Battle reports refused with 503 busy because the re-simulation queue was full or a worker failed.',
  tk_resim_queue: 'Battles waiting for a re-simulation worker right now.',
  tk_refused_total: 'Requests refused because of the game version, by reason (rules_unsupported, rules_changed, rules_retired, build_too_old, protocol_too_old) and battle rules version.',
  tk_village_commands_total: 'Village commands replayed, by result (ok, refused).',
  tk_village_corrections_total: 'Command batches answered with a correction (client and server disagreed).',
  tk_client_requests_total: 'Requests by game build and battle rules version (from the protocol 7 headers).',
  tk_db_pool_connections: 'Database pool connections, by state (total, idle, waiting for one).',
  tk_event_loop_delay_ms: 'Event-loop delay in milliseconds over the last scrape interval, by quantile (re-simulation blocks the loop).',
  tk_purchases_total: 'Store purchases credited, by store and environment (Production, Sandbox, Test).',
  tk_refunds_total: 'Purchases refunded or revoked, by store and reason.',
  tk_push_total: 'Server pushes, by type and result (sent, quiet, limit, off, invalid, failed).',
  tk_age_bands_total: 'Age bands stated by games (re-audit), by band kept and whether it changed.',
  tk_notices_total: 'Moderation notices sent to players, by kind (report_outcome, moderation_action, account).',
  tk_apple_revocations_total: 'Sign in with Apple token revocations, by trigger (delete, unlink, notification) and result (ok, failed, skipped).',
  tk_sessions_revoked_total: 'Device tokens signed out, by reason (unlink, others, prune).',
  tk_redis_errors_total: 'Redis calls that failed and degraded (rate limits let the request through, leaderboard read the database, locks fell back to tickets), by use.',
  tk_redis_up: 'Whether this instance can reach Redis right now (1) or is failing fast after an outage (0).',
  tk_http_compressed_total: 'Responses sent compressed, by encoding (gzip, br).',
};

const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const key = (labels: Labels = {}) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',');

export class PromMetrics implements Metrics {
  private counters = new Map<string, Map<string, number>>();
  private histograms = new Map<string, Map<string, { buckets: number[]; sum: number; count: number }>>();
  private gauges = new Map<string, () => { labels?: Labels; value: number }[]>();

  constructor(private readonly buckets = DEFAULT_BUCKETS) {}

  count(name: string, labels?: Labels, by = 1): void {
    const m = this.counters.get(name) ?? new Map<string, number>();
    this.counters.set(name, m);
    const k = key(labels);
    m.set(k, (m.get(k) ?? 0) + by);
  }

  observe(name: string, value: number, labels?: Labels): void {
    const m = this.histograms.get(name) ?? new Map();
    this.histograms.set(name, m);
    const k = key(labels);
    const h = m.get(k) ?? { buckets: this.buckets.map(() => 0), sum: 0, count: 0 };
    this.buckets.forEach((b, i) => {
      if (value <= b) h.buckets[i]++;
    });
    h.sum += value;
    h.count++;
    m.set(k, h);
  }

  /** A value read when /metrics is scraped (pool sizes, event-loop delay). */
  gauge(name: string, read: () => { labels?: Labels; value: number }[]): void {
    this.gauges.set(name, read);
  }

  /** A counter's value (tests, /healthz summaries). */
  value(name: string, labels?: Labels): number {
    return this.counters.get(name)?.get(key(labels)) ?? 0;
  }

  /** Prometheus text exposition format 0.0.4. */
  render(): string {
    const out: string[] = [];
    const help = (name: string, type: string) => {
      if (METRIC_HELP[name]) out.push(`# HELP ${name} ${METRIC_HELP[name]}`);
      out.push(`# TYPE ${name} ${type}`);
    };
    for (const [name, series] of [...this.counters].sort()) {
      help(name, 'counter');
      for (const [k, v] of series) out.push(`${name}${k ? `{${k}}` : ''} ${v}`);
    }
    for (const [name, read] of [...this.gauges].sort()) {
      let points: { labels?: Labels; value: number }[];
      try {
        points = read();
      } catch {
        continue;
      }
      help(name, 'gauge');
      for (const p of points) out.push(`${name}${p.labels ? `{${key(p.labels)}}` : ''} ${p.value}`);
    }
    for (const [name, series] of [...this.histograms].sort()) {
      help(name, 'histogram');
      for (const [k, h] of series) {
        const pre = k ? `${k},` : '';
        this.buckets.forEach((b, i) => out.push(`${name}_bucket{${pre}le="${b}"} ${h.buckets[i]}`));
        out.push(`${name}_bucket{${pre}le="+Inf"} ${h.count}`);
        out.push(`${name}_sum${k ? `{${k}}` : ''} ${h.sum}`);
        out.push(`${name}_count${k ? `{${k}}` : ''} ${h.count}`);
      }
    }
    return `${out.join('\n')}\n`;
  }
}

/** Server errors to Sentry (SENTRY_DSN). Never throws; at most 30 reports a minute, each message once a minute. */
export class ServerSentry {
  private readonly throttle = new ReportThrottle(30, 60_000);
  /** Reports handed to fetch (tests). */
  sent = 0;

  constructor(
    private readonly dsn: SentryDsn,
    private readonly release: string,
    private readonly environment: string,
    private readonly post: (url: string, body: string) => Promise<unknown> = (url, body) => fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/x-sentry-envelope' }, signal: AbortSignal.timeout(5000) }),
  ) {}

  static fromDsn(dsn: string | undefined, release: string, environment: string): ServerSentry | null {
    const d = parseDsn(dsn);
    return d ? new ServerSentry(d, release, environment) : null;
  }

  capture(error: unknown, ctx: Omit<SentryEventInput, 'error' | 'platform' | 'release' | 'environment'> = {}): void {
    const msg = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    if (!this.throttle.allow(msg, Date.now())) return;
    const body = buildEnvelope(this.dsn, { ...ctx, error, platform: 'node', release: this.release, environment: this.environment, tags: { side: 'server', ...ctx.tags } }, randomBytes(16).toString('hex'), Date.now());
    this.sent++;
    this.post(envelopeEndpoint(this.dsn, 'kagemura-server/1'), body).catch(() => undefined);
  }
}
