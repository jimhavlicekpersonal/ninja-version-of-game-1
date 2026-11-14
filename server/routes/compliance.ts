/**
 * Routes of the compliance switches (2026-11-14; docs/PROTOCOL.md "Compliance switches"): the terms of service
 * record, the Apple consumption consent and the record of both. Rules live in server/core/compliance.ts; this
 * file maps requests, with schemas like every route (routes/schema.ts).
 *
 * `UNDER13_MODE=offline` adds a preHandler that refuses an under-13 player's requests except account deletion,
 * the hello and this record (`allowedWhileUnder13Offline`). It is registered only in that mode, before the
 * other route modules (app.ts), so other servers pay nothing for it.
 */
import { ComplianceRoutes, type ConsumptionConsentRequest, type TermsRequest } from '../../src/backend/net/compliance';
import { allowedWhileUnder13Offline } from '../core/compliance';
import { bearer, type RouteKit } from './kit';
import { body, boolean, fields, string } from './schema';

export function complianceRoutes({ app, player, core }: RouteKit): void {
  const c = core.compliance;
  if (c.under13Mode() === 'offline') {
    app.addHook('preHandler', async (req) => {
      const token = bearer(req);
      if (!token || !req.url.startsWith('/v1/') || allowedWhileUnder13Offline(req.method, req.url)) return;
      const me = await core.authenticate(token).catch(() => null);
      if (me) await c.checkUnder13Online(me);
    });
  }
  player('GET', ComplianceRoutes.compliance, {}, async (me) => c.view(me));
  player('PUT', ComplianceRoutes.terms, { body: body(fields<TermsRequest>()({ version: string({ maxLength: 10 }) })), rate: 'moderation' }, async (me, { body }) => c.acceptTerms(me, body));
  player('PUT', ComplianceRoutes.consumptionConsent, { body: body(fields<ConsumptionConsentRequest>()({ consent: boolean() })), rate: 'moderation' }, async (me, { body }) => c.setConsumptionConsent(me, body));
}
