/**
 * Community rules acceptance on the server (state-of-the-game report, section 5 step 7, compliance C14).
 * Google Play's UGC policy: users accept the terms or user policy before they create content. The game
 * asks once (`ui/communityRules.ts`) and now tells the server (`PUT /v1/me/rules`); chat, Alliance and Gang
 * names and renames need the current `COMMUNITY_RULES_VERSION`, so the acceptance is per account and can be
 * shown, not per device.
 */
import { COMMUNITY_RULES_VERSION, type RulesRequest, type RulesResponse } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { type ServerContext } from './context';
import { fail } from './errors';

export async function acceptRules(ctx: ServerContext, me: Player, body: Partial<RulesRequest> | undefined): Promise<RulesResponse> {
  const v = Number(body?.version);
  if (!Number.isInteger(v) || v < 1 || v > COMMUNITY_RULES_VERSION) throw fail(400, 'bad_request', 'rules.unknown_version');
  if ((me.rulesVersion ?? 0) >= v) return { version: me.rulesVersion! };
  await ctx.repo.updatePlayer(me.id, { rulesVersion: v, rulesAcceptedAt: ctx.now() });
  return { version: v };
}

/** Throws `403 rules_required` unless this account accepted the current community rules. */
export function requireRules(ctx: ServerContext, me: Player): void {
  if (ctx.requireRules === false) return;
  if ((me.rulesVersion ?? 0) >= COMMUNITY_RULES_VERSION) return;
  throw fail(403, 'rules_required', 'rules.required');
}
