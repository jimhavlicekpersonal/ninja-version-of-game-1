/**
 * HTTP routes of the compliance switches (2026-11-14; docs/PROTOCOL.md "Compliance switches"), registered
 * from server/app.ts with one line (`registerComplianceRoutes`) like growthRoutes.ts. Rules live in
 * server/core/compliance.ts; this file maps requests and adds the `UNDER13_MODE=offline` guard: a
 * preHandler that refuses an under-13 player's requests except account deletion (it runs only in that mode,
 * so other servers pay nothing for it).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ComplianceRoutes } from '../src/backend/net/compliance';
import { allowedWhileUnder13Offline } from './core/compliance';
import type { ServerCore } from './core';
import type { RateLimits } from './rateLimit';
import type { Player } from './repo';

type Handler = (me: Player, req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
type Route = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface ComplianceHelpers {
  core: ServerCore;
  authed(h: Handler): Route;
  rate(r: keyof RateLimits): { config: { rate?: keyof RateLimits | (keyof RateLimits)[] } };
}

export function registerComplianceRoutes(app: FastifyInstance, h: ComplianceHelpers): void {
  const c = h.core.compliance;
  app.get(ComplianceRoutes.compliance, h.authed(async (me) => c.view(me)));
  app.put(ComplianceRoutes.terms, h.rate('moderation'), h.authed(async (me, req) => c.acceptTerms(me, req.body as never)));
  app.put(ComplianceRoutes.consumptionConsent, h.rate('moderation'), h.authed(async (me, req) => c.setConsumptionConsent(me, req.body as never)));
  if (c.under13Mode() === 'offline') {
    app.addHook('preHandler', async (req) => {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ') || !req.url.startsWith('/v1/') || allowedWhileUnder13Offline(req.method, req.url)) return;
      const me = await h.core.authenticate(auth.slice(7)).catch(() => null);
      if (me) await c.checkUnder13Online(me);
    });
  }
}
