/**
 * HTTP adapter: puts the server core (server/core/) behind the protocol in
 * src/net/protocol.ts. All rules live in the core; this file only reads
 * requests, checks the bearer token, applies rate and size limits, and turns
 * errors into protocol errors.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { Routes, type ErrorBody, type MyGroveResponse } from '../src/backend/net/protocol';
import type { GameData } from '../src/gameplay/sim/types';
import { DELETION_PAGE_CSP, deletionPage } from './accountPage';
import { ApiError, createCore, type ServerCore } from './core';
import { nodeContext } from './nodeContext';
import { BODY_LIMITS, DEFAULT_RATE_LIMITS, MemoryRateLimiter, type RateDecision, type RateLimiter, type RateLimits } from './rateLimit';
import type { Player, Repo } from './repo';

export { maxHousing, validateBase, validLevels } from './core/pvp';
export { nodeContext } from './nodeContext';

export interface ServerOptions {
  repo: Repo;
  data: GameData;
  now?: () => number;
  corsOrigin?: string;
  logger?: boolean;
  /** Override for tests (deterministic opponent picks). */
  random?: () => number;
  /** Rate limits; any rule left out keeps its default (DEFAULT_RATE_LIMITS). */
  rateLimits?: Partial<RateLimits>;
  /** A shared limiter (e.g. Redis, roadmap step 16); defaults to one in this process's memory. */
  rateLimiter?: RateLimiter;
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
}

/** Route option: which extra rate rule the route counts against. */
type RateConfig = { rate?: keyof RateLimits };

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : undefined;
}

export function buildServer(opts: ServerOptions): FastifyInstance & { core: ServerCore } {
  const now = opts.now ?? (() => Date.now());
  const core: ServerCore = createCore(nodeContext(opts.repo, opts.data, now, opts.random));
  // Small bodies by default; base uploads and battle reports raise it per route.
  // (trustProxy is cast only to keep Fastify's overloads on the HTTP/1 server type; any of its forms works.)
  const app = Object.assign(Fastify({ logger: opts.logger ?? false, bodyLimit: BODY_LIMITS.default, trustProxy: (opts.trustProxy ?? false) as boolean }), { core });
  const limiter = opts.rateLimiter ?? new MemoryRateLimiter({ ...DEFAULT_RATE_LIMITS, ...opts.rateLimits });

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
    reply.header('Access-Control-Expose-Headers', 'retry-after');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // Rate limits: every caller by IP address, every player by token, and the
  // costly routes (new players, matches, battle reports, reports) on their own.
  const tooMany = (reply: FastifyReply, d: RateDecision, what: string) => {
    const secs = Math.max(1, Math.ceil(d.retryAfterMs / 1000));
    reply.header('Retry-After', String(secs));
    const body: ErrorBody = { error: 'rate_limited', message: `${what} Try again in ${secs} second${secs === 1 ? '' : 's'}.` };
    return reply.code(429).send(body);
  };
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS' || req.url === '/healthz') return;
    const t = now();
    const ip = `ip:${req.ip}`;
    let d = await limiter.hit('ip', ip, t);
    if (!d.ok) return tooMany(reply, d, 'Too many requests from your network.');
    const token = bearer(req);
    // Keyed by a hash, so tokens never sit in the limiter (or a shared Redis) in the clear.
    const who = token ? `t:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : ip;
    if (token) {
      d = await limiter.hit('player', who, t);
      if (!d.ok) return tooMany(reply, d, 'Too many requests.');
    }
    const rule = (req.routeOptions?.config as RateConfig | undefined)?.rate;
    if (rule) {
      d = await limiter.hit(rule, rule === 'register' || rule === 'deletionRequest' ? ip : who, t);
      if (!d.ok) return tooMany(reply, d, rule === 'battle' ? 'Too many battle reports at once.' : 'Slow down a little.');
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) {
      const body: ErrorBody = { error: err.code, message: err.message };
      return reply.code(err.status).send(body);
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
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

  app.get('/healthz', async () => ({ ok: true }));
  app.get(Routes.hello, async () => core.hello());

  // Identity
  const rate = (r: keyof RateLimits): { config: RateConfig } => ({ config: { rate: r } });
  app.post(Routes.players, rate('register'), async (req, reply) => reply.code(201).send(await core.register(body<{ name: string }>(req).name)));
  app.get(Routes.me, authed(async (me) => core.me(me)));
  app.put(Routes.me, authed(async (me, req) => core.rename(me, body<{ name: string }>(req).name)));
  app.delete(Routes.me, authed(async (me) => core.deleteAccount(me)));

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
      const got = createHash('sha256').update(bearer(req) ?? '').digest();
      if (!timingSafeEqual(got, want)) throw new ApiError(401, 'unauthorized', 'Staff token required.');
      return h(req);
    };
    app.get('/admin/v1/deletion-requests', staff(async (req) => core.admin.deletionQueue(query(req).status === 'all' ? 'all' : 'open')));
    app.post('/admin/v1/deletion-requests/:id', staff(async (req) => core.admin.resolveDeletion(param(req, 'id'), body<{ action: string }>(req).action, body<{ note: string }>(req).note)));
  }

  return app;
}
