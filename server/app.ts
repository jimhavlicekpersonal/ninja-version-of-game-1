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
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ClientHeaders, Routes, type ErrorBody } from '../src/backend/net/protocol';
import { MIN_PROTOCOL } from './core/identity';
import type { GameData } from '../src/gameplay/sim/types';
import { ApiError, createCore, type ServerCore } from './core';
import { bodyFor, errorBody, staffError, type MessageCode } from './core/errors';
import { nodeContext, type SharedStores } from './nodeContext';
import { PromMetrics, type ServerSentry } from './observability';
import { BODY_LIMITS, DEFAULT_RATE_LIMITS, ipAllowList, ipKey, MemoryRateLimiter, type RateDecision, type RateLimiter, type RateLimits } from './rateLimit';
import type { Player, Repo } from './repo';
import { battleRoutes } from './routes/battles';
import { growthRoutes, growthStaffRoutes } from './routes/growth';
import { bearer, routeKit, type RateConfig } from './routes/kit';
import { playerRoutes } from './routes/player';
import { socialRoutes } from './routes/social';
import { staffRoutes, type StaffRoute } from './routes/staff';

export { maxHousing, validateBase, validLevels } from './core/pvp';
export { nodeContext } from './nodeContext';

export interface ServerOptions {
  repo: Repo;
  data: GameData;
  now?: () => number;
  corsOrigin?: string;
  /** Structured JSON logs (pino): true for 'info', or a level. Tokens are never logged. */
  logger?: boolean | 'debug' | 'info' | 'warn' | 'error';
  /** Where log lines go (tests); stdout by default. */
  logStream?: { write(line: string): void };
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

// HTTP tuning (quality Q20): named once, unchanged values.
/** Browsers keep to HTTPS for a year once they saw it here (step 45). */
const HSTS_MAX_AGE_S = 31_536_000;
/** Longer Idempotency-Key headers are ignored (the write runs as without one). */
const IDEMPOTENCY_KEY_MAX = 100;
/** Each GET /readyz dependency must answer within this. */
const READY_CHECK_TIMEOUT_MS = 2000;
/** Compression effort for answers: fast enough for the event loop, ~5 KB for a whole village. */
const BROTLI_QUALITY = 5;
const GZIP_LEVEL = 6;

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

/** A caller's own request id, when it looks like one (backend A33: echoed and logged, never used as ours). */
export function clientRequestId(h: unknown): string | null {
  return typeof h === 'string' && /^[\w-]{8,64}$/.test(h) ? h : null;
}

/**
 * Backend A30: a request URL as the log may keep it. Friend codes in the path and the values of query
 * parameters that hold names, codes, search text or ids are replaced, so request logs (and whatever
 * ships them) hold no player names or codes. Everything else is kept for debugging.
 */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  let path = q < 0 ? url : url.slice(0, q);
  path = path.replace(/^(\/v1\/players\/code\/)[^/?#]+/i, '$1[redacted]');
  if (q < 0) return path;
  const params = url
    .slice(q + 1)
    .split('&')
    .map((kv) => {
      const i = kv.indexOf('=');
      const k = i < 0 ? kv : kv.slice(0, i);
      return i >= 0 && /^(name|q|code|install|token|email|text)$/i.test(decodeSafe(k)) ? `${k}=[redacted]` : kv;
    });
  return `${path}?${params.join('&')}`;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Backend A13: what one write was (method, route pattern, body), so a reused key cannot answer another request. */
export function requestFingerprint(method: string, route: string, body: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(body ?? null) ?? 'null';
  } catch {
    text = String(body);
  }
  return createHash('sha256').update(`${method.toUpperCase()} ${route}\n${text}`).digest('hex').slice(0, 32);
}

/**
 * Backend A12: routes whose answer holds the whole village (~290 KB). Their idempotent answer is kept
 * without the village file, and a replay reads the village again (it may be newer by then; the game
 * adopts whatever the server holds), so a day of remembered answers never keeps copies of the village.
 */
const VILLAGE_ANSWER_ROUTES = new Set([`POST ${Routes.village}`, `POST ${Routes.villageImport}`]);

/**
 * Backend A12/A16 (2026-11-14 verification fix): answers that carry a bearer token (rotation, sign-in,
 * registration) are never kept as idempotent answers, so no raw token sits in idempotency_keys. A retry of
 * such a request runs again (a rotation is confirmed only by the new token's first use, so a second
 * rotation is harmless). Any answer with a top-level `token` string is skipped too, whatever the route.
 */
const TOKEN_ANSWER_ROUTES = new Set([`POST ${Routes.sessionsRotate}`, `POST ${Routes.sessions}`, `POST ${Routes.players}`]);
export function holdsToken(route: string, body: unknown): boolean {
  return TOKEN_ANSWER_ROUTES.has(route) || (Boolean(body) && typeof body === 'object' && typeof (body as { token?: unknown }).token === 'string');
}

/**
 * TRUST_PROXY as Fastify takes it. A hop count becomes a function that trusts that many proxies in front
 * of the server (backend A31): Fastify 5.12 treats a plain number as "trust nobody" (fail closed), which
 * silently put every player behind one load balancer on the balancer's own address, so all of them
 * shared one IP rate-limit bucket. Addresses/CIDRs and booleans pass through.
 */
export function trustProxyOption(tp: boolean | number | string | undefined): boolean | string | ((addr: string, hop: number) => boolean) {
  if (typeof tp === 'number') {
    const hops = Math.max(0, Math.floor(tp));
    return (_addr: string, hop: number) => hop < hops;
  }
  return tp ?? false;
}

export function buildServer(opts: ServerOptions): FastifyInstance & { core: ServerCore; metrics: PromMetrics } {
  const now = opts.now ?? (() => Date.now());
  const metrics = opts.metrics ?? new PromMetrics();
  const level = opts.logger === true ? 'info' : opts.logger || null;
  // Small bodies by default; base uploads and battle reports raise it per route.
  // (trustProxy is cast only to keep Fastify's overloads on the HTTP/1 server type; any of its forms works.)
  const fastify = Fastify({
    logger: level
      ? {
          level,
          ...(opts.logStream ? { stream: opts.logStream } : {}),
          redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
          // Backend A30: names, friend codes and search text never reach the request log (or a log shipper).
          serializers: { req: (req: { method?: string; url?: string; hostname?: string; ip?: string; socket?: { remotePort?: number } }) => ({ method: req.method, url: redactUrl(req.url ?? ''), host: req.hostname, remoteAddress: req.ip, remotePort: req.socket?.remotePort }) },
        }
      : false,
    bodyLimit: BODY_LIMITS.default,
    trustProxy: trustProxyOption(opts.trustProxy) as boolean,
    // Backend A33: the server always makes its own request id (a client cannot forge or collide log lines);
    // a caller's own x-request-id is echoed back as x-client-request-id and logged beside it.
    genReqId: () => randomUUID(),
    // Request schemas (server/routes/schema.ts) check types without changing them: no coercion, so a
    // "5" stays a string and is refused where the protocol says number; extra fields are kept.
    ajv: { customOptions: { coerceTypes: false } },
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
    reply.header('Access-Control-Expose-Headers', 'retry-after, x-request-id, x-client-request-id');
    reply.header('x-request-id', req.id);
    const clientId = clientRequestId(req.headers['x-request-id']);
    if (clientId) {
      reply.header('x-client-request-id', clientId);
      req.log = req.log.child({ clientReqId: clientId });
    }
    // Over HTTPS (directly, or X-Forwarded-Proto from a trusted proxy): browsers keep to HTTPS (step 45).
    if (req.protocol === 'https') reply.header('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_S}`);
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
      const body = bodyFor('version_mismatch', 'version.too_old');
      return reply.code(426).send(body);
    }
    const build = req.headers[ClientHeaders.clientBuild];
    if (typeof build === 'string') metrics.count('tk_client_requests_total', { build: build.slice(0, 40), rules: String(req.headers[ClientHeaders.simRules] ?? '?').slice(0, 8) });
  });

  // Idempotent writes (protocol 7): the same Idempotency-Key from the same caller gets the first answer back.
  const idemScope = (req: FastifyRequest) => {
    const key = req.headers[ClientHeaders.idempotencyKey];
    const token = bearer(req);
    if (req.method === 'GET' || req.method === 'OPTIONS' || typeof key !== 'string' || !token || key.length > IDEMPOTENCY_KEY_MAX) return null;
    return { scope: createHash('sha256').update(token).digest('hex').slice(0, 32), key };
  };
  /** Players whose token a hook already verified (the route reuses it). */
  const verified = new WeakMap<FastifyRequest, Player>();
  /** The request fingerprint of an idempotent write (backend A13), made once its body is parsed. */
  const fingerprints = new WeakMap<FastifyRequest, string>();
  const routeKey = (req: FastifyRequest) => `${req.method} ${req.routeOptions?.url ?? req.url.split('?')[0]}`;
  app.addHook('onSend', async (req, reply, payload) => {
    const id = idemScope(req);
    if (!id || !verified.has(req) || reply.getHeader('idempotent-replay') || reply.statusCode >= 300) return payload;
    let body: unknown;
    try {
      body = typeof payload === 'string' && payload ? JSON.parse(payload) : null;
    } catch {
      return payload;
    }
    if (holdsToken(routeKey(req), body)) return payload;
    // Backend A12: the village itself is never kept with the answer; a replay reads it again.
    if (VILLAGE_ANSWER_ROUTES.has(routeKey(req)) && body && typeof body === 'object' && 'file' in body) {
      const { file: _file, ...rest } = body as Record<string, unknown>;
      body = { ...rest, $refetch: 'village' };
    }
    await opts.repo.putIdempotent(id.scope, id.key, reply.statusCode, body, now(), fingerprints.get(req) ?? null);
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
  const tooMany = (reply: FastifyReply, d: RateDecision, what: MessageCode, rule: keyof RateLimits) => {
    metrics.count('tk_rate_limited_total', { rule });
    metrics.count('tk_errors_total', { code: 'rate_limited' });
    const secs = Math.max(1, Math.ceil(d.retryAfterMs / 1000));
    reply.header('Retry-After', String(secs));
    const body = bodyFor('rate_limited', what, { seconds: secs });
    return reply.code(429).send(body);
  };
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS' || req.url === '/healthz' || req.url === '/readyz' || req.url === '/metrics') return;
    const t = now();
    // IPv6 by /64 (one subscriber's block); IPv4 as it is (rateLimit.ts: why the IP limits are loose).
    const ip = `ip:${ipKey(req.ip)}`;
    let d = await limiter.hit('ip', ip, t);
    if (!d.ok) return tooMany(reply, d, 'rate.network', 'ip');
    const token = bearer(req);
    // Backend A7: per-player limits count per player, not per token (a linked account can mint a token
    // per sign-in). The token is checked here, once (the route reuses the player); a token that is not a
    // player's (junk, a staff token, a suspended account) is counted by its hash, never in the clear.
    let who = token ? `t:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : ip;
    if (token && req.url.startsWith('/v1/') && req.url !== Routes.hello && req.url !== Routes.balance) {
      try {
        const me = await core.authenticate(token);
        verified.set(req, me);
        who = `p:${me.id}`;
      } catch {
        // the route answers 401 / 403 itself
      }
    }
    if (token) {
      d = await limiter.hit('player', who, t);
      if (!d.ok) return tooMany(reply, d, 'rate.player', 'player');
    }
    const rules = (req.routeOptions?.config as RateConfig | undefined)?.rate;
    for (const rule of rules === undefined ? [] : Array.isArray(rules) ? rules : [rules]) {
      d = await limiter.hit(rule, rule === 'register' || rule === 'deletionRequest' || rule === 'villageImport' || rule === 'stats' || rule === 'nonce' || rule === 'complaint' ? ip : who, t);
      if (!d.ok) return tooMany(reply, d, rule === 'battle' ? 'rate.battle' : rule === 'lookup' || rule === 'lookupDay' ? 'rate.lookup' : 'rate.other', rule);
    }
  });

  // ADMIN_ALLOW_IPS: the staff tool and API answer only these addresses (everyone else sees nothing there).
  const adminAllowed = opts.adminAllowIps?.length ? ipAllowList(opts.adminAllowIps) : null;
  if (adminAllowed) {
    app.addHook('onRequest', async (req, reply) => {
      if ((req.url === '/admin' || req.url.startsWith('/admin/') || req.url.startsWith('/admin?')) && !adminAllowed(req.ip)) {
        metrics.count('tk_errors_total', { code: 'admin_ip_refused' });
        return reply.code(404).send(bodyFor('not_found', 'request.not_found'));
      }
    });
  }

  // Idempotent writes, looked up only after the rate limits and the token check (re-audit): junk tokens
  // never reach the idempotency table, and a banned or deleted player's token gets no stored answer back.
  // A preHandler (backend A13): the body is parsed by now, so the answer is replayed only to the same
  // method, route and body; the same key with anything else is refused (422 idempotency_mismatch).
  app.addHook('preHandler', async (req, reply) => {
    const id = idemScope(req);
    if (!id) return;
    let me = verified.get(req);
    if (!me) {
      try {
        me = await core.authenticate(bearer(req));
        verified.set(req, me);
      } catch {
        return; // the route answers 401 / 403 itself
      }
    }
    const fingerprint = requestFingerprint(req.method, req.routeOptions?.url ?? req.url.split('?')[0]!, req.body);
    fingerprints.set(req, fingerprint);
    const seen = await opts.repo.getIdempotent(id.scope, id.key);
    if (!seen) return;
    if (seen.fingerprint && seen.fingerprint !== fingerprint) {
      metrics.count('tk_errors_total', { code: 'idempotency_mismatch' });
      const err = bodyFor('idempotency_mismatch', 'request.idempotency_mismatch');
      return reply.code(422).send(err);
    }
    reply.header('idempotent-replay', 'true');
    let replay = seen.body;
    if (replay && typeof replay === 'object' && (replay as Record<string, unknown>).$refetch === 'village') {
      const { $refetch: _r, ...rest } = replay as Record<string, unknown>;
      try {
        replay = { ...(await core.getVillage(me)), ...rest };
      } catch (e) {
        if (e instanceof ApiError) return reply.code(e.status).send(errorBody(e));
        throw e;
      }
    }
    return reply.code(seen.status).send(replay ?? undefined);
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
        ? await brotliAsync(payload, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: size } })
        : await gzipAsync(payload, { level: GZIP_LEVEL });
    reply.header('content-encoding', enc);
    reply.removeHeader('content-length');
    metrics.count('tk_http_compressed_total', { encoding: enc });
    return out;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      metrics.count('tk_errors_total', { code: err.code });
      req.log.info({ code: err.code, status: err.status }, err.message);
      const body = errorBody(err);
      return reply.code(err.status).send(body);
    }
    // A request its route's schema refuses (quality Q19): the field and a message code the game can show.
    const validation = (err as FastifyError).validation;
    if (validation) {
      metrics.count('tk_errors_total', { code: 'bad_request' });
      const first = validation[0] as { instancePath?: string; params?: { missingProperty?: unknown } } | undefined;
      const missing = typeof first?.params?.missingProperty === 'string' ? `/${first.params.missingProperty}` : '';
      const field = `${(err as FastifyError).validationContext ?? 'body'}${first?.instancePath ?? ''}${missing}`.slice(0, 80);
      req.log.info({ field }, 'request refused by schema');
      // Code `detail` (the game shows its own translated "something went wrong" for it): no new catalog
      // text, since every language would need it; the English names the field for support.
      return reply.code(400).send(bodyFor('bad_request', 'detail', { detail: `Request field ${field} has the wrong type or is missing.` }));
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    metrics.count('tk_errors_total', { code: status >= 500 ? 'server_error' : 'bad_request' });
    if (status >= 500) {
      req.log.error(err);
      opts.sentry?.capture(err, { tags: { route: req.routeOptions?.url ?? 'unmatched' }, request: { method: req.method, url: req.url } });
    }
    // Malformed JSON, oversized bodies and the like; details only for client errors.
    // Malformed requests keep Fastify's English and no code (the game shows its own fallback).
    const body: ErrorBody = status >= 500 ? bodyFor('bad_request', 'request.server_error') : { error: 'bad_request', message: (err as Error).message };
    return reply.code(status).send(body);
  });

  const kit = routeKit(app, core, verified);

  // Liveness: the process answers (no dependencies, so a database outage never restarts every instance).
  app.get('/healthz', async () => ({ ok: true, version: opts.version ?? 'dev', uptimeS: Math.floor((Date.now() - started) / 1000) }));
  // Readiness: the database (and Redis, …) answer within 2 s each; 503 otherwise.
  app.get('/readyz', async (_req, reply) => {
    const checks: Record<string, () => Promise<unknown>> = { db: () => opts.repo.ping(), ...opts.readiness };
    const out: Record<string, string> = {};
    let ok = true;
    for (const [name, check] of Object.entries(checks)) {
      try {
        await Promise.race([check(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), READY_CHECK_TIMEOUT_MS).unref())]);
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
    // Backend A31: the same address check for whoever holds the metrics token (a monitoring probe).
    app.get('/metrics/ip', async (req, reply) => {
      if (!sameSecret(bearer(req), want)) return reply.code(401).send({ error: 'unauthorized', message: 'Metrics token required.' });
      return ipEcho(req);
    });
  }
  /** Backend A31: the caller's address as the rate limits see it, and the proxy chain it came through. */
  const ipEcho = (req: FastifyRequest) => ({
    ip: req.ip,
    rateKey: ipKey(req.ip),
    ips: req.ips ?? [req.ip],
    forwardedFor: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : null,
    socket: req.socket.remoteAddress ?? null,
    protocol: req.protocol,
    trustProxy: opts.trustProxy ?? false,
  });
  app.get(Routes.balance, async () => core.balance());
  app.get(Routes.hello, async () => ({ ...core.hello(), ...(opts.environment ? { environment: opts.environment } : {}), ...(opts.notice ? { notice: opts.notice } : {}) }));

  // The game's routes, by area (server/routes/): each names its request schemas and rate rules.
  playerRoutes(kit);
  battleRoutes(kit);
  socialRoutes(kit);
  growthRoutes(kit); // growth batch 2026-11-14: referrals, shared replays

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
    // Checked before the body is validated, so a caller without a staff token learns nothing about the API.
    const staffGuard = async (req: FastifyRequest, reply: FastifyReply) => {
      const got = createHash('sha256').update(bearer(req) ?? '').digest();
      let who: { name: string; named: boolean } | null = null;
      // Every token is compared (no early exit), each in constant time.
      for (const w of wants) if (timingSafeEqual(got, w.hash) && !who) who = w;
      if (!who) {
        // Backend A28: every failed staff token is counted (alert StaffAuthFailures) and limited per address.
        metrics.count('tk_staff_auth_failures_total', { reason: bearer(req) ? 'wrong_token' : 'no_token' });
        req.log.warn({ route: req.routeOptions?.url }, 'staff token refused');
        const d = await limiter.hit('staffAuth', `ip:${ipKey(req.ip)}`, now());
        if (!d.ok) return tooMany(reply, d, 'rate.staff', 'staffAuth');
        throw staffError(401, 'unauthorized', 'Staff token required.');
      }
      staffBy.set(req, who);
    };
    // The admin tool (roadmap step 48) names the actor in the staff log.
    const actor = (req: FastifyRequest) => {
      const who = staffBy.get(req);
      return who?.named ? who.name : String(req.headers['x-staff-name'] ?? 'staff').slice(0, 40);
    };
    const staff: StaffRoute = (method, url, spec, h) => kit.open(method, url, { ...spec, preValidation: staffGuard }, async (input) => h(actor(input.req), input));
    staffRoutes(staff, core, ({ req }) => ipEcho(req));
    growthStaffRoutes(app, staff, core); // growth batch 2026-11-14: local days, funnel, /admin/stats
    app.get('/admin', async (_req, reply) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', ADMIN_PAGE_CSP).header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex').send(adminPage()));
    app.get('/admin/app.js', async (_req, reply) => reply.type('text/javascript; charset=utf-8').header('Cache-Control', 'no-store').send(adminScript()));
  }

  return app;
}
