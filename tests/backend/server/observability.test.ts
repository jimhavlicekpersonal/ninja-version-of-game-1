/** Observability (roadmap step 17): Sentry envelopes, metrics, desync counting, request ids, health checks. */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { PromMetrics, ServerSentry } from '../../../server/observability';
import { MemoryRepo } from '../../../server/repo';
import { CrashReporter } from '../../../src/backend/analytics/crashReports';
import { buildEnvelope, envelopeEndpoint, parseDsn, parseStack, ReportThrottle, scrubUrl } from '../../../src/backend/analytics/sentryEnvelope';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { baseAt, noTroops } from './harness';

const DSN = 'https://abc123@o42.ingest.sentry.io/4507';

describe('Sentry envelopes without the SDK', () => {
  it('reads a DSN and builds the envelope endpoint', () => {
    const d = parseDsn(DSN)!;
    expect(d).toMatchObject({ publicKey: 'abc123', projectId: '4507', envelopeUrl: 'https://o42.ingest.sentry.io/api/4507/envelope/' });
    expect(envelopeEndpoint(d, 'kagemura-web/1')).toBe('https://o42.ingest.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7&sentry_client=kagemura-web%2F1');
    expect(parseDsn('https://sentry.example.com/path/7')).toBeNull(); // no key
    expect(parseDsn('not a dsn')).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it('parses V8 and Safari stacks oldest call first, without query strings', () => {
    const v8 = 'Error: boom\n    at inner (https://game.example/assets/main.js?v=3:10:5)\n    at outer (/srv/dist-server/main.js:20:7)\n    at node:internal/process:1:1';
    expect(parseStack(v8)).toEqual([
      { function: '?', filename: 'node:internal/process', lineno: 1, colno: 1, in_app: false },
      { function: 'outer', filename: '/srv/dist-server/main.js', lineno: 20, colno: 7, in_app: true },
      { function: 'inner', filename: 'https://game.example/assets/main.js', lineno: 10, colno: 5, in_app: true },
    ]);
    expect(parseStack('tick@https://x/app.js#frag:3:9')).toEqual([{ function: 'tick', filename: 'https://x/app.js', lineno: 3, colno: 9, in_app: true }]);
    expect(scrubUrl('/v1/defenses?since=5&token=x')).toBe('/v1/defenses');
  });

  it('puts one error event in the envelope, with tags, release and a scrubbed request', () => {
    const d = parseDsn(DSN)!;
    const lines = buildEnvelope(d, { error: new TypeError('bad'), platform: 'node', release: 'r1', environment: 'staging', tags: { route: '/v1/me' }, request: { method: 'GET', url: '/v1/me?x=1' } }, 'e'.repeat(32), Date.UTC(2026, 10, 4)).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toMatchObject({ event_id: 'e'.repeat(32), dsn: DSN });
    expect(JSON.parse(lines[1])).toEqual({ type: 'event' });
    const ev = JSON.parse(lines[2]);
    expect(ev).toMatchObject({ platform: 'node', release: 'r1', environment: 'staging', level: 'error', tags: { route: '/v1/me' }, request: { method: 'GET', url: '/v1/me' } });
    expect(ev.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'bad' });
    expect(ev.timestamp).toBe(Date.UTC(2026, 10, 4) / 1000);
  });

  it('throttles: a few reports a minute, each message once', () => {
    const t = new ReportThrottle(3, 60_000);
    expect([t.allow('a', 0), t.allow('a', 1), t.allow('b', 2), t.allow('c', 3), t.allow('d', 4)]).toEqual([true, false, true, true, false]);
    expect(t.allow('a', 60_001)).toBe(true);
  });

  it('the game reports crashes only with a DSN and while the player allows it', () => {
    const posts: string[] = [];
    let allowed = false;
    const r = new CrashReporter({ dsn: DSN, release: 'kagemura@0.1.0', environment: 'web', enabled: () => allowed, post: (_u, body) => posts.push(body), now: () => 1000 });
    const listeners: Record<string, (e: Event) => void> = {};
    r.install({ addEventListener: ((type: string, fn: (e: Event) => void) => (listeners[type] = fn)) as Window['addEventListener'] });
    listeners.error({ error: new Error('first') } as unknown as Event);
    expect(posts).toHaveLength(0); // switched off in Settings
    allowed = true;
    listeners.error({ error: new Error('second') } as unknown as Event);
    listeners.unhandledrejection({ reason: new Error('third') } as unknown as Event);
    expect(posts).toHaveLength(2);
    const ev = JSON.parse(posts[1].trim().split('\n')[2]);
    expect(ev).toMatchObject({ platform: 'javascript', release: 'kagemura@0.1.0', tags: { side: 'client', kind: 'unhandledrejection' } });
    expect(JSON.stringify(ev)).not.toMatch(/token|playerId/);
    const off = new CrashReporter({ dsn: undefined, release: 'x', environment: 'web', enabled: () => true, post: () => posts.push('x') });
    off.report(new Error('nope'));
    expect(off.configured).toBe(false);
    expect(posts).toHaveLength(2);
  });
});

describe('metrics', () => {
  it('render counters and histograms in Prometheus text format', () => {
    const m = new PromMetrics([10, 100]);
    m.count('tk_errors_total', { code: 'not_found' });
    m.count('tk_errors_total', { code: 'not_found' });
    m.count('tk_errors_total', { code: 'a"b' });
    m.observe('tk_resim_ms', 7, { kind: 'pvp' });
    m.observe('tk_resim_ms', 70, { kind: 'pvp' });
    const text = m.render();
    expect(text).toContain('# TYPE tk_errors_total counter');
    expect(text).toContain('tk_errors_total{code="not_found"} 2');
    expect(text).toContain('tk_errors_total{code="a\\"b"} 1');
    expect(text).toContain('tk_resim_ms_bucket{kind="pvp",le="10"} 1');
    expect(text).toContain('tk_resim_ms_bucket{kind="pvp",le="100"} 2');
    expect(text).toContain('tk_resim_ms_bucket{kind="pvp",le="+Inf"} 2');
    expect(text).toContain('tk_resim_ms_sum{kind="pvp"} 77');
    expect(text).toContain('# HELP tk_resim_ms Time to re-simulate one battle');
  });
});

describe('observability over HTTP', () => {
  const METRICS = 'metrics-secret-0123456789';

  async function setup(extra: Partial<Parameters<typeof buildServer>[0]> = {}) {
    let t = Date.UTC(2026, 2, 1);
    const app = buildServer({ repo: new MemoryRepo(), data, now: () => t, metricsToken: METRICS, version: 'test-1', ...extra });
    const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) => {
      const r = await app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
      return { status: r.statusCode, body: r.body && r.headers['content-type']?.toString().includes('json') ? JSON.parse(r.body) : r.body, headers: r.headers };
    };
    const register = async (name: string) => (await call('POST', Routes.players, undefined, { name })).body as { token: string };
    return { app, call, register, advance: (ms: number) => (t += ms) };
  }

  it('counts battles, re-simulation time and desyncs, and errors by code; /metrics needs its token', async () => {
    const s = await setup();
    const a = await s.register('Ann');
    await s.call('PUT', Routes.base, a.token, { base: baseAt(1, 3) });
    const m = (await s.call('GET', Routes.match, a.token)).body;
    // One warrior through the first Infiltration Point: a battle where none fights is practice and is refused
    // (balance audit 2026-11-08), and a rush along an edge only fights when an edge tile happens to be in a point.
    const { army, deployments } = noTroops(m);
    await s.call('POST', Routes.attacks, a.token, { ticket: m.ticket, seed: m.seed, army, deployments, clientHash: 'not-the-real-hash' });
    await s.call('POST', Routes.attacks, a.token, { ticket: 'nope', seed: 1, army, deployments });
    expect((await s.call('GET', '/metrics')).status).toBe(401);
    expect((await s.call('GET', '/metrics', 'wrong')).status).toBe(401);
    const text = (await s.call('GET', '/metrics', METRICS)).body as string;
    // By battle-rules version too (roadmap step 78), so a desync spike after a release shows which version.
    expect(text).toContain(`tk_battles_total{kind="pvp",rules="${SIM_RULES}"} 1`);
    expect(text).toContain(`tk_desyncs_total{kind="pvp",rules="${SIM_RULES}"} 1`);
    expect(text).toMatch(/tk_resim_ms_count\{kind="pvp"\} 1/);
    expect(text).toContain('tk_errors_total{code="not_found"} 1');
    expect(text).toContain('tk_http_requests_total{method="POST",route="/v1/attacks",status="200"} 1');
    expect(s.app.metrics.value('tk_desyncs_total', { kind: 'pvp', rules: String(SIM_RULES) })).toBe(1);
    // Without a metrics token there is no /metrics at all.
    expect((await (await setup({ metricsToken: undefined })).call('GET', '/metrics')).status).toBe(404);
  });

  it('gives every answer its own request id, echoing a well-formed one the caller sent separately (backend A33)', async () => {
    const s = await setup();
    const r = await s.call('GET', Routes.hello);
    expect(String(r.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
    const traced = await s.call('GET', Routes.hello, undefined, undefined, { 'x-request-id': 'trace-12345678' });
    expect(String(traced.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
    expect(traced.headers['x-client-request-id']).toBe('trace-12345678');
    expect((await s.call('GET', Routes.hello, undefined, undefined, { 'x-request-id': 'bad id!' })).headers['x-request-id']).not.toBe('bad id!');
  });

  it('/healthz is liveness only; /readyz checks the database and other dependencies', async () => {
    const s = await setup({ readiness: { redis: async () => 'PONG' } });
    expect((await s.call('GET', '/healthz')).body).toMatchObject({ ok: true, version: 'test-1' });
    expect((await s.call('GET', '/readyz')).body).toEqual({ ok: true, checks: { db: 'ok', redis: 'ok' } });
    const down = await setup({ readiness: { redis: async () => Promise.reject(new Error('connection refused')) } });
    const r = await down.call('GET', '/readyz');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ ok: false, checks: { db: 'ok', redis: 'down: connection refused' } });
  });

  it('sends server errors (5xx) to Sentry, never client errors', async () => {
    const posts: string[] = [];
    const sentry = new ServerSentry(parseDsn(DSN)!, 'server@test', 'test', async (_u, body) => posts.push(body));
    const repo = new MemoryRepo();
    repo.playerByTokenHash = async () => {
      throw new Error('database exploded');
    };
    const app = buildServer({ repo, data, sentry });
    const bad = await app.inject({ method: 'GET', url: Routes.me, headers: { authorization: 'Bearer x' } });
    expect(bad.statusCode).toBe(500);
    expect(JSON.parse(bad.body)).toEqual({ error: 'bad_request', message: 'Server error.', key: 'request.server_error' });
    await app.inject({ method: 'GET', url: Routes.me }); // 401: not reported
    expect(posts).toHaveLength(1);
    const ev = JSON.parse(posts[0].trim().split('\n')[2]);
    expect(ev).toMatchObject({ platform: 'node', release: 'server@test', tags: { side: 'server', route: '/v1/me' }, request: { method: 'GET', url: '/v1/me' } });
    expect(ev.exception.values[0].value).toBe('database exploded');
    expect(posts[0]).not.toContain('Bearer');
  });
});

describe('gauges and the operators notice (roadmap step 47)', () => {
  it('renders gauges read at scrape time, with help text, and skips one that fails', () => {
    const m = new PromMetrics();
    let waiting = 0;
    m.gauge('tk_db_pool_connections', () => [
      { labels: { state: 'total' }, value: 4 },
      { labels: { state: 'waiting' }, value: waiting },
    ]);
    m.gauge('tk_broken', () => {
      throw new Error('no pool');
    });
    waiting = 2;
    const text = m.render();
    expect(text).toContain('# TYPE tk_db_pool_connections gauge');
    expect(text).toContain('# HELP tk_db_pool_connections');
    expect(text).toContain('tk_db_pool_connections{state="waiting"} 2');
    expect(text).not.toContain('tk_broken');
  });

  it('every alert rule names metrics the server records', async () => {
    const { readFileSync } = await import('node:fs');
    const rules = readFileSync(new URL('../../../ops/prometheus/alerts.yml', import.meta.url), 'utf8');
    const used = new Set([...rules.matchAll(/\b(tk_[a-z_]+?)(?:_bucket|_sum|_count)?\b/g)].map((x) => x[1]));
    const { METRIC_HELP } = await import('../../../server/observability');
    for (const name of used) expect(Object.keys(METRIC_HELP), name).toContain(name);
  });

  it('tells every player the operators notice in /v1/hello', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, notice: 'Maintenance at 02:00 UTC for 20 minutes.' });
    expect((await app.inject({ method: 'GET', url: Routes.hello })).json().notice).toBe('Maintenance at 02:00 UTC for 20 minutes.');
  });
});
