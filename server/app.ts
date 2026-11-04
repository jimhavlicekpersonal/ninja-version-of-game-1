/**
 * HTTP adapter: puts the server core (server/core/) behind the protocol in
 * src/net/protocol.ts. All rules live in the core; this file only reads
 * requests, checks the bearer token, applies rate and size limits, and turns
 * errors into protocol errors.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { Routes, type ErrorBody, type MyGroveResponse } from '../src/backend/net/protocol';
import type { GameData } from '../src/gameplay/sim/types';
import { DELETION_PAGE_CSP, deletionPage } from './accountPage';
import { ApiError, createCore, type ServerCore } from './core';
import { nodeContext, type SharedStores } from './nodeContext';
import { PromMetrics, type ServerSentry } from './observability';
import { BODY_LIMITS, DEFAULT_RATE_LIMITS, MemoryRateLimiter, type RateDecision, type RateLimiter, type RateLimits } from './rateLimit';
import type { Player, Repo } from './repo';

export { maxHousing, validateBase, validLevels } from './core/pvp';
export { nodeContext } from './nodeContext';

export interface ServerOptions {
  repo: Repo;
  data: GameData;
  now?: () => number;
  corsOrigin?: string;
  /** Structured JSON logs (pino): true for 'info', or a level. Tokens are never logged. */
  logger?: boolean | 'debug' | 'info' | 'warn' | 'error';
  /** Override for tests (deterministic opponent picks). */
  random?: () => number;
  /** Rate limits; any rule left out keeps its default (DEFAULT_RATE_LIMITS). */
  rateLimits?: Partial<RateLimits>;
  /** A shared limiter (e.g. Redis, roadmap step 16); defaults to one in this process's memory. */
  rateLimiter?: RateLimiter;
  /** Shared leaderboard and match locks (Redis, roadmap step 16); defaults to the database. */
  shared?: SharedStores;
  /**
   * Behind a load balancer or proxy, take the caller's IP address from
   * X-Forwarded-For (Fastify's trustProxy: true, a hop count, or addresses).
   * Leave it off when clients connect directly, or anyone could pick their IP.
   */
  trustProxy?: boolean | number | string;
  /**
   * Staff token for the admin API (/admin/v1/…: deletion requests, the
   * moderation queue). At least 24 characters; without it the admin API does
   * not exist (404).
   */
  adminToken?: string;
  /** Metrics (always collected); served at GET /metrics only with `metricsToken`. */
  metrics?: PromMetrics;
  /** Bearer token for GET /metrics (Prometheus or a Grafana agent). Without it /metrics is 404. */
  metricsToken?: string;
  /** Error reports for 5xx answers (SENTRY_DSN). */
  sentry?: ServerSentry | null;
  /** Build shown by /healthz (and Sentry). */
  version?: string;
  /** Dependencies GET /readyz checks (the database is always checked). */
  readiness?: Record<string, () => Promise<unknown>>;
}

const sameSecret = (got: string | undefined, want: Buffer) => timingSafeEqual(createHash('sha256').update(got ?? '').digest(), want);

/** Route option: which extra rate rule the route counts against. */
type RateConfig = { rate?: keyof RateLimits };

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : undefined;
}

export function buildServer(opts: ServerOptions): FastifyInstance & { core: ServerCore; metrics: PromMetrics } {
  const now = opts.now ?? (() => Date.now());
  const metrics = opts.metrics ?? new PromMetrics();
  const level = opts.logger === true ? 'info' : opts.logger || null;
  // Small bodies by default; base uploads and battle reports raise it per route.
  // (trustProxy is cast only to keep Fastify's overloads on the HTTP/1 server type; any of its forms works.)
  const fastify = Fastify({
    logger: level ? { level, redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' } } : false,
    bodyLimit: BODY_LIMITS.default,
    trustProxy: (opts.trustProxy ?? false) as boolean,
    // A request id on every log line and answer; a caller's own x-request-id is kept when it looks like one.
    genReqId: (req) => {
      const h = req.headers['x-request-id'];
      return typeof h === 'string' && /^[\w-]{8,64}$/.test(h) ? h : randomUUID();
    },
  });
  const ctx = nodeContext(opts.repo, opts.data, now, opts.random, {
    ...opts.shared,
    metrics,
    log: (lvl, msg, fields) => fastify.log[lvl](fields ?? {}, msg),
  });
  const core: ServerCore = createCore(ctx);
  const app = Object.assign(fastify, { core, metrics });
  const limiter = opts.rateLimiter ?? new MemoryRateLimiter({ ...DEFAULT_RATE_LIMITS, ...opts.rateLimits });
  const started = Date.now();

  // CORS without an extra dependency. corsOrigin: '*' (default; fine because
  // auth is a bearer token, not a cookie) or a comma-separated list of origins.
  const allowed = (opts.corsOrigin ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (allowed.includes('*')) reply.header('Access-Control-Allow-Origin', '*');
    else if (origin && allowed.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Headers', 'authorization, content-type');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Max-Age', '86400');
    reply.header('Access-Control-Expose-Headers', 'retry-after, x-request-id');
    reply.header('x-request-id', req.id);
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // Requests and their time, by route (the route pattern, never ids from the path).
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'unmatched';
    metrics.count('tk_http_requests_total', { route, method: req.method, status: String(reply.statusCode) });
    metrics.observe('tk_http_request_duration_ms', reply.elapsedTime, { route });
  });

  // Rate limits: every caller by IP address, every player by token, and the
  // costly routes (new players, matches, battle reports, reports) on their own.
  const tooMany = (reply: FastifyReply, d: RateDecision, what: string, rule: keyof RateLimits) => {
    metrics.count('tk_rate_limited_total', { rule });
    metrics.count('tk_errors_total', { code: 'rate_limited' });
    const secs = Math.max(1, Math.ceil(d.retryAfterMs / 1000));
    reply.header('Retry-After', String(secs));
    const body: ErrorBody = { error: 'rate_limited', message: `${what} Try again in ${secs} second${secs === 1 ? '' : 's'}.` };
    return reply.code(429).send(body);
  };
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS' || req.url === '/healthz' || req.url === '/readyz' || req.url === '/metrics') return;
    const t = now();
    const ip = `ip:${req.ip}`;
    let d = await limiter.hit('ip', ip, t);
    if (!d.ok) return tooMany(reply, d, 'Too many requests from your network.', 'ip');
    const token = bearer(req);
    // Keyed by a hash, so tokens never sit in the limiter (or a shared Redis) in the clear.
    const who = token ? `t:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : ip;
    if (token) {
      d = await limiter.hit('player', who, t);
      if (!d.ok) return tooMany(reply, d, 'Too many requests.', 'player');
    }
    const rule = (req.routeOptions?.config as RateConfig | undefined)?.rate;
    if (rule) {
      d = await limiter.hit(rule, rule === 'register' || rule === 'deletionRequest' ? ip : who, t);
      if (!d.ok) return tooMany(reply, d, rule === 'battle' ? 'Too many battle reports at once.' : 'Slow down a little.', rule);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      metrics.count('tk_errors_total', { code: err.code });
      req.log.info({ code: err.code, status: err.status }, err.message);
      const body: ErrorBody = { error: err.code, message: err.message };
      return reply.code(err.status).send(body);
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    metrics.count('tk_errors_total', { code: status >= 500 ? 'server_error' : 'bad_request' });
    if (status >= 500) {
      req.log.error(err);
      opts.sentry?.capture(err, { tags: { route: req.routeOptions?.url ?? 'unmatched' }, request: { method: req.method, url: req.url } });
    }
    // Malformed JSON, oversized bodies and the like; details only for client errors.
    const body: ErrorBody = { error: 'bad_request', message: status >= 500 ? 'Server error.' : (err as Error).message };
    return reply.code(status).send(body);
  });

  type Handler = (me: Player, req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  /** A route that needs a registered player. Undefined results become 204. */
  const authed = (h: Handler) => async (req: FastifyRequest, reply: FastifyReply) => {
    const me = await core.authenticate(bearer(req));
    const out = await h(me, req, reply);
    if (out === undefined) return reply.code(204).send();
    return out;
  };
  const body = <T>(req: FastifyRequest) => (req.body ?? {}) as Partial<T> & Record<string, unknown>;
  const query = (req: FastifyRequest) => (req.query ?? {}) as Record<string, string | undefined>;
  const param = (req: FastifyRequest, k: string) => String((req.params as Record<string, string>)[k] ?? '');

  // Liveness: the process answers (no dependencies, so a database outage never restarts every instance).
  app.get('/healthz', async () => ({ ok: true, version: opts.version ?? 'dev', uptimeS: Math.floor((Date.now() - started) / 1000) }));
  // Readiness: the database (and Redis, …) answer within 2 s each; 503 otherwise.
  app.get('/readyz', async (_req, reply) => {
    const checks: Record<string, () => Promise<unknown>> = { db: () => opts.repo.ping(), ...opts.readiness };
    const out: Record<string, string> = {};
    let ok = true;
    for (const [name, check] of Object.entries(checks)) {
      try {
        await Promise.race([check(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000).unref())]);
        out[name] = 'ok';
      } catch (e) {
        ok = false;
        out[name] = `down: ${(e as Error).message}`;
      }
    }
    return reply.code(ok ? 200 : 503).send({ ok, checks: out });
  });
  // Prometheus metrics, only with a token (they describe the traffic).
  if (opts.metricsToken) {
    const want = createHash('sha256').update(opts.metricsToken).digest();
    app.get('/metrics', async (req, reply) => {
      if (!sameSecret(bearer(req), want)) return reply.code(401).send({ error: 'unauthorized', message: 'Metrics token required.' });
      return reply.type('text/plain; version=0.0.4').send(metrics.render());
    });
  }
  app.get(Routes.hello, async () => core.hello());

  // Identity
  const rate = (r: keyof RateLimits): { config: RateConfig } => ({ config: { rate: r } });
  app.post(Routes.players, rate('register'), async (req, reply) => reply.code(201).send(await core.register(body<{ name: string }>(req).name)));
  app.get(Routes.me, authed(async (me) => core.me(me)));
  app.put(Routes.me, authed(async (me, req) => core.rename(me, body<{ name: string }>(req).name)));
  app.delete(Routes.me, authed(async (me) => core.deleteAccount(me)));

  // Linked sign-ins = cloud save (step 24)
  app.get(Routes.links, authed(async (me) => core.links(me)));
  app.post(Routes.links, rate('moderation'), authed(async (me, req) => core.link(me, req.body as never)));
  app.delete('/v1/links/:provider', authed(async (me, req) => core.unlink(me, param(req, 'provider'))));
  app.post(Routes.sessions, rate('register'), async (req) => core.signIn(req.body as never));

  // Server-owned village (roadmap Phase 2)
  app.get(Routes.village, authed(async (me) => core.getVillage(me)));
  app.post(Routes.village, authed(async (me) => core.startVillage(me)));
  app.post(Routes.villageImport, { bodyLimit: BODY_LIMITS.battle * 4 }, authed(async (me, req) => core.importVillage(me, req.body as never)));
  app.post(Routes.villageCommands, { ...rate('commands'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.villageCommands(me, req.body as never)));
  app.get(Routes.villageLedger, authed(async (me, req) => core.ledger(me, query(req).limit)));

  // Reports and blocks
  app.post(Routes.reports, rate('moderation'), authed(async (me, req, reply) => reply.code(201).send(await core.report(me, req.body as never))));
  app.get(Routes.blocks, authed(async (me) => core.blocks(me)));
  app.post(Routes.blocks, rate('moderation'), authed(async (me, req) => core.block(me, body<{ playerId: string }>(req).playerId)));
  app.delete('/v1/blocks/:id', authed(async (me, req) => core.unblock(me, param(req, 'id'))));

  // Account deletion without the game: the web page and its requests (no token).
  app.get(Routes.deletionPage, async (_req, reply) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', DELETION_PAGE_CSP).header('Cache-Control', 'no-store').send(deletionPage()));
  app.post(Routes.deletionRequests, rate('deletionRequest'), async (req, reply) => reply.code(202).send(await core.requestDeletion(req.body as never)));

  // PvP
  app.put(Routes.base, { bodyLimit: BODY_LIMITS.base }, authed(async (me, req) => core.uploadBase(me, req.body as never)));
  app.get(Routes.match, rate('match'), authed(async (me) => core.match(me)));
  app.post(Routes.attacks, { ...rate('battle'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.attack(me, req.body as never)));
  app.get(Routes.defenses, authed(async (me, req) => core.defenses(me, Number(query(req).since ?? 0))));
  app.get(Routes.leaderboard, authed(async (me, req) => core.leaderboard(me, Number(query(req).limit ?? 50))));

  // Groves
  app.get(Routes.groves, authed(async (me, req) => core.listGroves(me, query(req).q ?? '')));
  app.post(Routes.groves, authed(async (me, req, reply) => reply.code(201).send(await core.createGrove(me, body<{ name: string }>(req).name))));
  app.post('/v1/groves/:id/join', authed(async (me, req) => core.joinGrove(me, param(req, 'id'))));
  app.get(Routes.grove, authed(async (me): Promise<MyGroveResponse> => ({ grove: await core.myGrove(me) })));
  app.post(Routes.groveLeave, authed(async (me) => core.leaveGrove(me)));
  app.get(Routes.groveChat, authed(async (me, req) => core.chat(me, query(req).after)));
  app.post(Routes.groveChat, authed(async (me, req, reply) => reply.code(201).send(await core.postChat(me, body<{ text: string }>(req).text))));
  app.get(Routes.groveRequests, authed(async (me) => core.requests(me)));
  app.post(Routes.groveRequests, authed(async (me, req, reply) => reply.code(201).send(await core.requestTroops(me, body<{ capacity: number }>(req).capacity))));
  app.post('/v1/grove/requests/:id/donate', authed(async (me, req) => core.donate(me, param(req, 'id'), req.body as never)));
  app.get(Routes.groveInbox, authed(async (me) => core.inbox(me)));
  app.post(Routes.groveInboxAck, authed(async (me, req) => core.ackInbox(me, body<{ ids: string[] }>(req).ids)));

  // Grove Raid
  app.get(Routes.groveRaid, authed(async (me) => core.raid(me)));
  app.post(Routes.groveRaidTicket, rate('match'), authed(async (me, req) => core.raidTicket(me, body<{ target: number }>(req).target)));
  app.post(Routes.groveRaidAttacks, { ...rate('battle'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.raidAttack(me, req.body as never)));
  app.post(Routes.groveRaidClaim, authed(async (me, req) => core.claimRaid(me, body<{ week: number }>(req).week)));

  // Staff API: only with a strong ADMIN_TOKEN, compared in constant time.
  if (opts.adminToken !== undefined) {
    if (opts.adminToken.length < 24) throw new Error('ADMIN_TOKEN must be at least 24 characters.');
    const want = createHash('sha256').update(opts.adminToken).digest();
    const staff = <T>(h: (req: FastifyRequest) => Promise<T>) => async (req: FastifyRequest) => {
      if (!sameSecret(bearer(req), want)) throw new ApiError(401, 'unauthorized', 'Staff token required.');
      return h(req);
    };
    app.get('/admin/v1/deletion-requests', staff(async (req) => core.admin.deletionQueue(query(req).status === 'all' ? 'all' : 'open')));
    app.post('/admin/v1/deletion-requests/:id', staff(async (req) => core.admin.resolveDeletion(param(req, 'id'), body<{ action: string }>(req).action, body<{ note: string }>(req).note)));
    app.get('/admin/v1/reports', staff(async (req) => core.admin.reportQueue(query(req).status === 'all' ? 'all' : 'open')));
    app.post('/admin/v1/reports/:id', staff(async (req) => core.admin.resolveReport(param(req, 'id'), req.body as never)));
  }

  return app;
}
