/**
 * How the route modules register routes (quality Q19): each route names its schemas (schema.ts) and rate
 * rules once, and its handler gets the body, query and path parameters with the types those schemas check.
 * The casts from Fastify's untyped request to those types live only here, after Fastify has validated the
 * request against the same schemas (an invalid one never reaches a handler: server/app.ts answers 400
 * `bad_request` with message code `detail` naming the field).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ClientHeaders } from '../../src/backend/net/protocol';
import type { ServerCore } from '../core';
import type { RateLimits } from '../rateLimit';
import type { Player } from '../repo';
import type { ClientInfo } from '../rules/registry';
import type { BodySchema, Schema } from './schema';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
/** Route option: which extra rate rule the route counts against (read by the rate-limit hook in app.ts). */
export type RateConfig = { rate?: keyof RateLimits | (keyof RateLimits)[] };

export interface RouteSpec<B, Q, P> {
  body?: BodySchema<B>;
  query?: Schema<Q>;
  params?: Schema<P>;
  rate?: keyof RateLimits | (keyof RateLimits)[];
  bodyLimit?: number;
  /** 'warn': no request log line (statistics and complaints hold an IP address or contact). */
  logLevel?: 'warn';
  /** Runs before the request is validated (the staff token check). */
  preValidation?: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
}

export interface RouteInput<B, Q, P> {
  body: B;
  query: Q;
  params: P;
  req: FastifyRequest;
  reply: FastifyReply;
}

type Empty = Record<never, never>;

export function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : undefined;
}

/** What the request's headers say about the game (rules version, data version, build): roadmap step 72. */
export function client(req: FastifyRequest): ClientInfo {
  const h = (k: string) => (typeof req.headers[k] === 'string' ? (req.headers[k] as string).slice(0, 60) : undefined);
  const rules = h(ClientHeaders.simRules);
  const protocol = h(ClientHeaders.protocol);
  return { protocol: protocol !== undefined && /^\d+$/.test(protocol) ? Number(protocol) : undefined, rules: rules !== undefined && /^\d+$/.test(rules) ? Number(rules) : undefined, dataVersion: h(ClientHeaders.dataVersion), build: h(ClientHeaders.clientBuild) };
}

export type Route = <B = undefined, Q = Empty, P = Empty>(method: Method, url: string, spec: RouteSpec<B, Q, P>, handler: (input: RouteInput<B, Q, P>) => Promise<unknown>) => void;
export type PlayerRoute = <B = undefined, Q = Empty, P = Empty>(method: Method, url: string, spec: RouteSpec<B, Q, P>, handler: (me: Player, input: RouteInput<B, Q, P>) => Promise<unknown>) => void;

export interface RouteKit {
  app: FastifyInstance;
  core: ServerCore;
  /** A route anyone may call (no token). */
  open: Route;
  /** A route that needs a registered player (401/403 otherwise). An undefined result becomes 204. */
  player: PlayerRoute;
}

/** `verified`: players whose token the rate-limit hook already checked (the route reuses them). */
export function routeKit(app: FastifyInstance, core: ServerCore, verified: WeakMap<FastifyRequest, Player>): RouteKit {
  const register = <B, Q, P>(method: Method, url: string, spec: RouteSpec<B, Q, P>, handler: (req: FastifyRequest, reply: FastifyReply, input: RouteInput<B, Q, P>) => Promise<unknown>) => {
    const schema = {
      ...(spec.body ? { body: spec.body } : {}),
      ...(spec.query ? { querystring: spec.query } : {}),
      ...(spec.params ? { params: spec.params } : {}),
    };
    app.route({
      method,
      url,
      ...(Object.keys(schema).length ? { schema } : {}),
      ...(spec.rate !== undefined ? { config: { rate: spec.rate } satisfies RateConfig } : {}),
      ...(spec.bodyLimit !== undefined ? { bodyLimit: spec.bodyLimit } : {}),
      ...(spec.logLevel ? { logLevel: spec.logLevel } : {}),
      ...(spec.preValidation ? { preValidation: spec.preValidation } : {}),
      // Validated against the schemas above before this runs.
      handler: (req, reply) => handler(req, reply, { body: req.body as B, query: (req.query ?? {}) as Q, params: (req.params ?? {}) as P, req, reply }),
    });
  };
  return {
    app,
    core,
    open: (method, url, spec, h) => register(method, url, spec, (_req, _reply, input) => h(input)),
    player: (method, url, spec, h) =>
      register(method, url, spec, async (req, reply, input) => {
        const me = verified.get(req) ?? (await core.authenticate(bearer(req)));
        const out = await h(me, input);
        if (out === undefined) return reply.code(204).send();
        return out;
      }),
  };
}
