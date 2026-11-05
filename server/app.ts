/**
 * HTTP adapter: puts the server core (server/core/) behind the protocol in
 * src/net/protocol.ts. All rules live in the core; this file only reads
 * requests, checks the bearer token, applies rate and size limits, and turns
 * errors into protocol errors.
 */
import { ADMIN_PAGE_CSP, adminPage, adminScript } from './adminPage';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ClientHeaders, Routes, type ErrorBody, type MyGroveResponse } from '../src/backend/net/protocol';
import { MIN_PROTOCOL } from './core/identity';
import type { GameData } from '../src/gameplay/sim/types';
import { DELETION_PAGE_CSP, deletionPage } from './accountPage';
import { ApiError, createCore, type ServerCore } from './core';
import { nodeContext, type SharedStores } from './nodeContext';
import { PromMetrics, type ServerSentry } from './observability';
import { BODY_LIMITS, DEFAULT_RATE_LIMITS, ipAllowList, ipKey, MemoryRateLimiter, type RateDecision, type RateLimiter, type RateLimits } from './rateLimit';
import type { Player, Repo } from './repo';
import type { ClientInfo } from './rules/registry';

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
   * Legacy shared staff token for the admin API (/admin/v1/…: deletion
   * requests, the moderation queue). At least 24 characters. Its actor is
   * whatever `x-staff-name` says (default "staff"). Without it and without
   * `adminTokens` the admin API does not exist (404).
   */
  adminToken?: string;
  /**
   * Per-staff tokens (ADMIN_TOKENS "name:token,…", config.ts
   * `parseAdminTokens`): name → token, each at least 24 characters. The staff
   * log names whoever's token it was; `x-staff-name` is ignored for them.
   */
  adminTokens?: Record<string, string>;
  /** ADMIN_ALLOW_IPS: only these addresses or CIDR ranges reach /admin… (everyone else gets 404). */
  adminAllowIps?: string[];
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
  /** DEPLOY_ENV (step 42): told to the game in /v1/hello so a test server says so. */
  environment?: string;
  /** SERVER_NOTICE (step 47): a message for every player in /v1/hello (maintenance, an incident). */
  notice?: string;
}

const sameSecret = (got: string | undefined, want: Buffer) => timingSafeEqual(createHash('sha256').update(got ?? '').digest(), want);

/** Answers smaller than this are sent as they are (compression would not pay for its headers). */
export const COMPRESS_MIN_BYTES = 1024;

/** br, else gzip, as an Accept-Encoding header allows (q=0 refuses one); null for neither. */
export function pickEncoding(header: string | string[] | undefined): 'br' | 'gzip' | null {
  const q = new Map<string, number>();
  for (const part of String(header ?? '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const qp = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    q.set(name, qp ? Number(qp.slice(2)) || 0 : 1);
  }
  const ok = (e: string) => (q.has(e) ? q.get(e)! : (q.get('*') ?? 0)) > 0;
  return ok('br') ? 'br' : ok('gzip') ? 'gzip' : null;
}

/** Route option: which extra rate rule the route counts against. */
type RateConfig = { rate?: keyof RateLimits | (keyof RateLimits)[] };

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
  // The same limiter serves the routes and the core's own limits (battle commands per minute).
  const limiter = opts.rateLimiter ?? new MemoryRateLimiter({ ...DEFAULT_RATE_LIMITS, ...opts.rateLimits });
  const ctx = nodeContext(opts.repo, opts.data, now, opts.random, {
    ...opts.shared,
    limiter,
    metrics,
    log: (lvl, msg, fields) => fastify.log[lvl](fields ?? {}, msg),
  });
  const core: ServerCore = createCore(ctx);
  const app = Object.assign(fastify, { core, metrics });
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
    reply.header('Access-Control-Allow-Headers', `authorization, content-type, ${Object.values(ClientHeaders).join(', ')}`);
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Max-Age', '86400');
    reply.header('Access-Control-Expose-Headers', 'retry-after, x-request-id');
    reply.header('x-request-id', req.id);
    // Over HTTPS (directly, or X-Forwarded-Proto from a trusted proxy): browsers keep to HTTPS (step 45).
    if (req.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // Protocol 7: a game older than MIN_PROTOCOL is told to update (hello stays open, so it can learn why).
  // Requests without the header (tools, webhooks, the deletion page) are served as before.
  app.addHook('onRequest', async (req, reply) => {
    const v = req.headers[ClientHeaders.protocol];
    const tooOldBuild = typeof req.headers[ClientHeaders.clientBuild] === 'string' && core.ctx.rules.buildTooOld(req.headers[ClientHeaders.clientBuild] as string);
    if (v !== undefined && req.url.startsWith('/v1/') && req.url !== Routes.hello && (Number(v) < MIN_PROTOCOL || tooOldBuild)) {
      metrics.count('tk_errors_total', { code: 'version_mismatch' });
      metrics.count('tk_refused_total', { reason: tooOldBuild ? 'build_too_old' : 'protocol_too_old', rules: String(req.headers[ClientHeaders.simRules] ?? '?').slice(0, 8) });
      const body: ErrorBody = { error: 'version_mismatch', message: 'This version of Kagemura is too old for the server. Update the game to keep playing online.' };
      return reply.code(426).send(body);
    }
    const build = req.headers[ClientHeaders.clientBuild];
    if (typeof build === 'string') metrics.count('tk_client_requests_total', { build: build.slice(0, 40), rules: String(req.headers[ClientHeaders.simRules] ?? '?').slice(0, 8) });
  });

  // Idempotent writes (protocol 7): the same Idempotency-Key from the same caller gets the first answer back.
  const idemScope = (req: FastifyRequest) => {
    const key = req.headers[ClientHeaders.idempotencyKey];
    const token = bearer(req);
    if (req.method === 'GET' || req.method === 'OPTIONS' || typeof key !== 'string' || !token || key.length > 100) return null;
    return { scope: createHash('sha256').update(token).digest('hex').slice(0, 32), key };
  };
  /** Players whose token the idempotency check already verified (the route reuses it). */
  const verified = new WeakMap<FastifyRequest, Player>();
  app.addHook('onSend', async (req, reply, payload) => {
    const id = idemScope(req);
    if (!id || !verified.has(req) || reply.getHeader('idempotent-replay') || reply.statusCode >= 300) return payload;
    let body: unknown = null;
    try {
      body = typeof payload === 'string' && payload ? JSON.parse(payload) : null;
    } catch {
      return payload;
    }
    await opts.repo.putIdempotent(id.scope, id.key, reply.statusCode, body, now());
    return payload;
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
    // IPv6 by /64 (one subscriber's block); IPv4 as it is (rateLimit.ts: why the IP limits are loose).
    const ip = `ip:${ipKey(req.ip)}`;
    let d = await limiter.hit('ip', ip, t);
    if (!d.ok) return tooMany(reply, d, 'Too many requests from your network.', 'ip');
    const token = bearer(req);
    // Keyed by a hash, so tokens never sit in the limiter (or a shared Redis) in the clear.
    const who = token ? `t:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : ip;
    if (token) {
      d = await limiter.hit('player', who, t);
      if (!d.ok) return tooMany(reply, d, 'Too many requests.', 'player');
    }
    const rules = (req.routeOptions?.config as RateConfig | undefined)?.rate;
    for (const rule of rules === undefined ? [] : Array.isArray(rules) ? rules : [rules]) {
      d = await limiter.hit(rule, rule === 'register' || rule === 'deletionRequest' ? ip : who, t);
      if (!d.ok) return tooMany(reply, d, rule === 'battle' ? 'Too many battle reports at once.' : rule === 'lookup' || rule === 'lookupDay' ? 'Too many player searches. Try again later.' : 'Slow down a little.', rule);
    }
  });

  // ADMIN_ALLOW_IPS: the staff tool and API answer only these addresses (everyone else sees nothing there).
  const adminAllowed = opts.adminAllowIps?.length ? ipAllowList(opts.adminAllowIps) : null;
  if (adminAllowed) {
    app.addHook('onRequest', async (req, reply) => {
      if ((req.url === '/admin' || req.url.startsWith('/admin/') || req.url.startsWith('/admin?')) && !adminAllowed(req.ip)) {
        metrics.count('tk_errors_total', { code: 'admin_ip_refused' });
        return reply.code(404).send({ error: 'not_found', message: 'Not found.' } satisfies ErrorBody);
      }
    });
  }

  // Idempotent writes, looked up only after the rate limits and the token check (re-audit): junk tokens
  // never reach the idempotency table, and a banned or deleted player's token gets no stored answer back.
  app.addHook('onRequest', async (req, reply) => {
    const id = idemScope(req);
    if (!id) return;
    try {
      verified.set(req, await core.authenticate(bearer(req)));
    } catch {
      return; // the route answers 401 / 403 itself
    }
    const seen = await opts.repo.getIdempotent(id.scope, id.key);
    if (!seen) return;
    reply.header('idempotent-replay', 'true');
    return reply.code(seen.status).send(seen.body ?? undefined);
  });

  // Compression (re-audit): a village file is ~290 KB and ~5 KB gzipped, and many players are on slow,
  // metered networks. Text answers over 1 KB, br or gzip as the caller accepts (browsers and the
  // WebViews decode it themselves). Registered after the idempotency hook, which reads the plain text.
  const gzipAsync = promisify(gzip);
  const brotliAsync = promisify(brotliCompress);
  app.addHook('onSend', async (req, reply, payload) => {
    if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) return payload;
    if (req.method === 'HEAD' || reply.getHeader('content-encoding')) return payload;
    const size = Buffer.byteLength(payload);
    if (size < COMPRESS_MIN_BYTES || !/json|text|javascript/.test(String(reply.getHeader('content-type') ?? ''))) return payload;
    const vary = String(reply.getHeader('vary') ?? '');
    if (!/accept-encoding/i.test(vary)) reply.header('vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
    const enc = pickEncoding(req.headers['accept-encoding']);
    if (!enc) return payload;
    const out =
      enc === 'br'
        ? await brotliAsync(payload, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: size } })
        : await gzipAsync(payload, { level: 6 });
    reply.header('content-encoding', enc);
    reply.removeHeader('content-length');
    metrics.count('tk_http_compressed_total', { encoding: enc });
    return out;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      metrics.count('tk_errors_total', { code: err.code });
      req.log.info({ code: err.code, status: err.status }, err.message);
      const body: ErrorBody = { error: err.code, message: err.message, ...(err.suggestions?.length ? { suggestions: err.suggestions } : {}) };
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
    const me = verified.get(req) ?? (await core.authenticate(bearer(req)));
    const out = await h(me, req, reply);
    if (out === undefined) return reply.code(204).send();
    return out;
  };
  const body = <T>(req: FastifyRequest) => (req.body ?? {}) as Partial<T> & Record<string, unknown>;
  /** What the request's headers say about the game (rules version, data version, build): roadmap step 72. */
  const client = (req: FastifyRequest): ClientInfo => {
    const h = (k: string) => (typeof req.headers[k] === 'string' ? (req.headers[k] as string).slice(0, 60) : undefined);
    const rules = h(ClientHeaders.simRules);
    return { rules: rules !== undefined && /^\d+$/.test(rules) ? Number(rules) : undefined, dataVersion: h(ClientHeaders.dataVersion), build: h(ClientHeaders.clientBuild) };
  };
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
  app.get(Routes.balance, async () => core.balance());
  app.get(Routes.hello, async () => ({ ...core.hello(), ...(opts.environment ? { environment: opts.environment } : {}), ...(opts.notice ? { notice: opts.notice } : {}) }));

  // Identity
  const rate = (r: keyof RateLimits): { config: RateConfig } => ({ config: { rate: r } });
  app.post(Routes.players, rate('register'), async (req, reply) => reply.code(201).send(await core.register(body<{ name: string }>(req).name)));
  app.get(Routes.me, authed(async (me) => core.me(me)));
  app.put(Routes.me, authed(async (me, req) => core.rename(me, body<{ name: string }>(req).name)));
  app.delete(Routes.me, authed(async (me) => core.deleteAccount(me)));

  // Friends and names (roadmap step 59). Lookups and requests are rate limited per minute and per day.
  const lookupRate = { config: { rate: ['lookup', 'lookupDay'] as (keyof RateLimits)[] } };
  app.get(Routes.friends, authed(async (me) => core.friends(me)));
  app.put(Routes.privacy, authed(async (me, req) => core.setPrivacy(me, req.body as never)));
  app.get(Routes.playerLookup, lookupRate, authed(async (me, req) => core.lookupPlayer(me, (req.query as { name?: string }).name)));
  app.get('/v1/players/code/:code', lookupRate, authed(async (me, req) => core.playerByCode(me, (req.params as { code: string }).code)));
  app.post(Routes.friendRequests, lookupRate, authed(async (me, req) => core.friendRequest(me, req.body as never)));
  app.post('/v1/friends/requests/:id', authed(async (me, req) => core.answerFriendRequest(me, (req.params as { id: string }).id, body<{ accept: boolean }>(req).accept)));
  app.delete('/v1/friends/requests/:id', authed(async (me, req) => core.cancelFriendRequest(me, (req.params as { id: string }).id)));
  app.post(Routes.platformFriends, { ...lookupRate, bodyLimit: 32 * 1024 }, authed(async (me, req) => core.platformFriends(me, req.body as never)));
  app.delete('/v1/friends/:id', authed(async (me, req) => core.unfriend(me, (req.params as { id: string }).id)));

  // Linked sign-ins = cloud save (step 24)
  app.get(Routes.links, authed(async (me) => core.links(me)));
  app.post(Routes.links, rate('moderation'), authed(async (me, req) => core.link(me, req.body as never)));
  app.delete('/v1/links/:provider', authed(async (me, req) => core.unlink(me, param(req, 'provider'))));
  app.post(Routes.sessions, rate('register'), async (req) => core.signIn(req.body as never));
  // Re-audit: account protections (age bands, notices, deletion codes, signing out other devices, Apple notifications).
  app.put(Routes.meAge, rate('moderation'), authed(async (me, req) => core.stateAge(me, req.body as never)));
  app.post(Routes.deletionCode, rate('moderation'), authed(async (me) => core.deletionCode(me)));
  app.get(Routes.notices, authed(async (me) => core.notices(me)));
  app.post(Routes.noticesRead, authed(async (me, req) => core.markNoticesRead(me, body<{ ids: string[] }>(req).ids)));
  app.post(Routes.sessionsRevokeOthers, rate('moderation'), authed(async (me) => core.revokeOtherSessions(me)));
  app.post(Routes.appleSignInNotifications, { bodyLimit: BODY_LIMITS.base }, async (req) => {
    await core.appleSignInNotification(req.body as never);
    return { ok: true };
  });

  // Server-owned village (roadmap Phase 2)
  app.get(Routes.village, authed(async (me) => core.getVillage(me)));
  app.post(Routes.village, authed(async (me) => core.startVillage(me)));
  app.post(Routes.villageImport, { bodyLimit: BODY_LIMITS.battle * 4 }, authed(async (me, req) => core.importVillage(me, req.body as never)));
  app.post(Routes.villageCommands, { ...rate('commands'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.villageCommands(me, req.body as never)));
  app.get(Routes.villageLedger, authed(async (me, req) => core.ledger(me, query(req).limit)));

  // Purchases (roadmap Phase 4): ask, redeem once, history; store notifications carry their own signatures.
  app.post(Routes.purchaseIntent, rate('purchase'), authed(async (me, req) => core.purchaseIntent(me, req.body as never)));
  app.post(Routes.purchaseIntentRelease, rate('purchase'), authed(async (me, req) => core.releaseIntent(me, req.body as never)));
  app.post(Routes.purchases, { ...rate('purchase'), bodyLimit: BODY_LIMITS.base }, authed(async (me, req) => core.redeem(me, req.body as never)));
  app.get(Routes.purchases, rate('purchase'), authed(async (me) => core.purchaseHistory(me)));
  app.post(Routes.appleNotifications, { bodyLimit: BODY_LIMITS.base }, async (req) => {
    await core.appleNotification(req.body as never);
    return { ok: true };
  });
  app.post(Routes.googleNotifications, { bodyLimit: BODY_LIMITS.base }, async (req, reply) => {
    await core.googleNotification(req.headers.authorization, req.body);
    return reply.code(204).send();
  });

  // Server push (step 40): this device's token and choices.
  app.put(Routes.pushTokens, rate('moderation'), authed(async (me, req) => core.putPushToken(me, req.body as never)));
  app.delete(Routes.pushTokens, authed(async (me, req) => core.deletePushToken(me, query(req).token)));

  // Reports and blocks
  app.post(Routes.reports, rate('moderation'), authed(async (me, req, reply) => reply.code(201).send(await core.report(me, req.body as never))));
  app.get(Routes.blocks, authed(async (me) => core.blocks(me)));
  app.post(Routes.blocks, rate('moderation'), authed(async (me, req) => core.block(me, body<{ playerId: string }>(req).playerId)));
  app.delete('/v1/blocks/:id', authed(async (me, req) => core.unblock(me, param(req, 'id'))));

  // Account deletion without the game: the web page and its requests (no token).
  app.get(Routes.deletionPage, async (_req, reply) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', DELETION_PAGE_CSP).header('Cache-Control', 'no-store').send(deletionPage()));
  app.post(Routes.deletionRequests, rate('deletionRequest'), async (req, reply) => reply.code(202).send(await core.requestDeletion(req.body as never)));

  // PvP
  app.put(Routes.base, { bodyLimit: BODY_LIMITS.base }, authed(async (me, req) => core.uploadBase(me, req.body as never, client(req))));
  app.get(Routes.match, rate('match'), authed(async (me, req) => core.match(me, client(req))));
  app.post(Routes.attacks, { ...rate('battle'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.attack(me, req.body as never)));
  app.post(Routes.attackStart, rate('battle'), authed(async (me, req) => core.startAttack(me, req.body as never)));
  app.post(Routes.attackVoid, rate('battle'), authed(async (me, req) => core.voidAttack(me, req.body as never)));
  app.get(Routes.defenses, authed(async (me, req) => core.defenses(me, Number(query(req).since ?? 0))));
  app.get(Routes.leaderboard, authed(async (me, req) => core.leaderboard(me, Number(query(req).limit ?? 50))));
  app.get(Routes.powerLeaderboard, authed(async (me, req) => core.powerLeaderboard(me, Number(query(req).limit ?? 50))));

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

  // Friendly Duels (step 62): re-simulated like attacks, so they count against the battle limit.
  app.post(Routes.duelTicket, rate('match'), authed(async (me, req) => core.duelTicket(me, req.body as never, client(req))));
  app.post(Routes.duels, { ...rate('battle'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.reportDuel(me, req.body as never)));
  app.get(Routes.duels, authed(async (me, req) => core.duels(me, query(req).since)));
  app.put(Routes.duelLayout, { bodyLimit: BODY_LIMITS.base }, authed(async (me, req) => core.setDuelLayout(me, req.body as never, client(req))));
  app.post(Routes.duelChallenges, rate('moderation'), authed(async (me, req) => core.challenge(me, body<{ friendId: string }>(req).friendId)));
  app.get(Routes.duelChallenges, authed(async (me) => core.challenges(me)));

  // Gangs (step 63)
  app.get(Routes.squad, authed(async (me) => core.squad(me)));
  app.post(Routes.squad, rate('moderation'), authed(async (me, req) => core.createSquad(me, body<{ name: string }>(req).name)));
  app.post(Routes.squadInvites, rate('moderation'), authed(async (me, req) => core.squadInvite(me, body<{ friendId: string }>(req).friendId)));
  app.post('/v1/squad/invites/:id', authed(async (me, req) => core.answerSquadInvite(me, param(req, 'id'), body<{ accept: boolean }>(req).accept)));
  app.post(Routes.squadLeave, authed(async (me) => core.leaveSquad(me)));
  app.post(Routes.squadLeader, authed(async (me, req) => core.squadLeader(me, body<{ playerId: string }>(req).playerId)));
  app.get(Routes.squadChat, authed(async (me, req) => core.squadChat(me, query(req).after)));
  app.post(Routes.squadChat, authed(async (me, req, reply) => reply.code(201).send(await core.postSquadChat(me, body<{ text: string }>(req).text))));
  app.get(Routes.squadRequests, authed(async (me) => core.squadRequests(me)));
  app.post(Routes.squadRequests, authed(async (me, req, reply) => reply.code(201).send(await core.squadRequestTroops(me, body<{ capacity: number }>(req).capacity))));
  app.post('/v1/squad/requests/:id/donate', authed(async (me, req) => core.squadDonate(me, param(req, 'id'), req.body as never)));

  // Gang Wars (steps 65-66)
  app.get(Routes.squadWar, authed(async (me) => core.gangWar(me)));
  app.post(Routes.squadWarQueue, rate('match'), authed(async (me) => core.gangWarQueue(me)));
  app.delete(Routes.squadWarQueue, authed(async (me) => core.gangWarCancel(me)));
  app.post(Routes.squadWarBase, rate('moderation'), authed(async (me) => core.gangWarBase(me)));
  app.post(Routes.squadWarTicket, rate('match'), authed(async (me, req) => core.gangWarTicket(me, req.body as never, client(req))));
  app.post(Routes.squadWarAttacks, { ...rate('battle'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.gangWarAttack(me, req.body as never)));
  app.post(Routes.squadWarClaim, authed(async (me, req) => core.gangWarClaim(me, body<{ warId: string }>(req).warId)));

  // Grove Raid
  app.get(Routes.groveRaid, authed(async (me) => core.raid(me)));
  app.post(Routes.groveRaidTicket, rate('match'), authed(async (me, req) => core.raidTicket(me, body<{ target: number }>(req).target, client(req))));
  app.post(Routes.groveRaidAttacks, { ...rate('battle'), bodyLimit: BODY_LIMITS.battle }, authed(async (me, req) => core.raidAttack(me, req.body as never)));
  app.post(Routes.groveRaidClaim, authed(async (me, req) => core.claimRaid(me, body<{ week: number }>(req).week)));

  // Staff API: only with strong tokens, compared in constant time. Per-staff tokens (ADMIN_TOKENS) name
  // their holder in the staff log; the legacy shared ADMIN_TOKEN takes the name from x-staff-name.
  // ADMIN_ALLOW_IPS keeps /admin… to the office or VPN addresses.
  const staffTokens = [
    ...Object.entries(opts.adminTokens ?? {}).map(([name, token]) => ({ name, token, named: true })),
    ...(opts.adminToken !== undefined ? [{ name: 'staff', token: opts.adminToken, named: false }] : []),
  ];
  if (staffTokens.length) {
    for (const t of staffTokens) if (t.token.length < 24) throw new Error(t.named ? `ADMIN_TOKENS: the token for "${t.name}" must be at least 24 characters.` : 'ADMIN_TOKEN must be at least 24 characters.');
    const wants = staffTokens.map((t) => ({ name: t.name, named: t.named, hash: createHash('sha256').update(t.token).digest() }));
    const staffBy = new WeakMap<FastifyRequest, { name: string; named: boolean }>();
    const staff = <T>(h: (req: FastifyRequest) => Promise<T>) => async (req: FastifyRequest) => {
      const got = createHash('sha256').update(bearer(req) ?? '').digest();
      let who: { name: string; named: boolean } | null = null;
      // Every token is compared (no early exit), each in constant time.
      for (const w of wants) if (timingSafeEqual(got, w.hash) && !who) who = w;
      if (!who) throw new ApiError(401, 'unauthorized', 'Staff token required.');
      staffBy.set(req, who);
      return h(req);
    };
    app.get('/admin/v1/deletion-requests', staff(async (req) => core.admin.deletionQueue(query(req).status === 'all' ? 'all' : 'open')));
    app.post('/admin/v1/deletion-requests/:id', staff(async (req) => core.admin.resolveDeletion(param(req, 'id'), body<{ action: string }>(req).action, body<{ note: string }>(req).note)));
    app.get('/admin/v1/reports', staff(async (req) => core.admin.reportQueue(query(req).status === 'all' ? 'all' : 'open')));
    app.post('/admin/v1/reports/:id', staff(async (req) => core.admin.resolveReport(param(req, 'id'), req.body as never)));
    // The admin tool (roadmap step 48): player lookup, give/take, suspend, rating reset, staff log.
    const actor = (req: FastifyRequest) => {
      const who = staffBy.get(req);
      return who?.named ? who.name : String(req.headers['x-staff-name'] ?? 'staff').slice(0, 40);
    };
    app.get('/admin/v1/players', staff(async (req) => core.admin.search(query(req).q)));
    app.get('/admin/v1/players/:id', staff(async (req) => core.admin.player(param(req, 'id'))));
    app.post('/admin/v1/players/:id/adjust', staff(async (req) => core.admin.adjust(actor(req), param(req, 'id'), req.body as never)));
    app.post('/admin/v1/players/:id/ban', staff(async (req) => core.admin.ban(actor(req), param(req, 'id'), req.body as never)));
    app.post('/admin/v1/players/:id/reset-rating', staff(async (req) => core.admin.resetRating(actor(req), param(req, 'id'), req.body as never)));
    app.post('/admin/v1/players/:id/reset-age', staff(async (req) => core.admin.resetAge(actor(req), param(req, 'id'), req.body as never)));
    app.get('/admin/v1/actions', staff(async () => core.admin.actions()));
    app.get('/admin', async (_req, reply) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', ADMIN_PAGE_CSP).header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex').send(adminPage()));
    app.get('/admin/app.js', async (_req, reply) => reply.type('text/javascript; charset=utf-8').header('Cache-Control', 'no-store').send(adminScript()));
  }

  return app;
}
