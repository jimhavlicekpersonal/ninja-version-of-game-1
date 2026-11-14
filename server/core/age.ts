/**
 * Age bands on the server (re-audit: minors online; src/gameplay/sim/age.ts).
 * The game asks a neutral age screen (or the store's age signal) before it
 * first goes online and sends the band (PUT /v1/me/age). The server keeps the
 * strictest band it heard (`player_age.band`, migration 0024), like the older
 * under-18 answer: only stricter changes are taken; staff clear it after a
 * support check (admin `reset-age`).
 *
 * What the server enforces:
 * - under13: chat only from the fixed phrases (PRESET_CHAT), never findable by
 *   name or in platform-friend lists, no chosen name (a generated one stays).
 * - 13to17: when first stated, "who can find me" becomes friends of friends and
 *   "show when I was online" goes off (the player may change both later).
 * Self-declared: protections, not age verification.
 *
 * Third verification fixes 2026-11-14: when the band becomes under 13 (any `UNDER13_MODE`), the player's push
 * tokens are deleted (one registered before is not kept); when it becomes a minor band, shared replays of the
 * player's base go; in `offline` mode an under-13 player also leaves their Alliance and Gang (the notice does
 * not name them) and is taken out of the leaderboard and matchmaking (`pvp.ts` skips them).
 */
import { bandChangeAllowed, isAgeBand, type AgeBand } from '../../src/gameplay/sim/age';
import { presetChatId, type AgeRequest, type AgeResponse } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { ageBandOf, dropPushTokens, keptBand } from './ageBand';
import { type ServerContext } from './context';
import { fail } from './errors';

export { ageBandOf, keptBand } from './ageBand';

/**
 * What leaving the Alliance and the Gang takes (`groves.leaveGrove`, `squads.leave`), passed in by `core/index.ts`
 * so this module does not import them (they read the band from here: an import cycle otherwise).
 */
export interface BandEffects {
  leaveMemberships(ctx: ServerContext, me: Player): Promise<void>;
}

/** What a newly stated stricter band takes away at once (see the header). */
async function onStricterBand(ctx: ServerContext, me: Player, next: AgeBand, effects?: BandEffects): Promise<void> {
  if (next === 'adult') return;
  await ctx.repo.deleteSharedReplaysOfDefender(me.id);
  if (next !== 'under13') return;
  await dropPushTokens(ctx.repo, me.id);
  if (ctx.policy.under13Mode !== 'offline') return;
  await effects?.leaveMemberships(ctx, me);
  await ctx.board.remove(me.id);
}

/** PUT /v1/me/age { band }: keep the stricter band; answer with the band now kept. */
export async function stateAge(ctx: ServerContext, me: Player, body: Partial<AgeRequest> | undefined, effects?: BandEffects): Promise<AgeResponse> {
  const asked = body?.band ?? null;
  if (asked !== null && !isAgeBand(asked)) throw fail(400, 'bad_request', 'age.bad_band');
  const row = await ctx.repo.getAgeBand(me.id);
  const before = keptBand(row);
  if (!asked) return { band: before };
  // Same or stricter only (an "under 18" from before bands never becomes adult).
  const next: AgeBand = !row || bandChangeAllowed(row.band, row.under18, asked) ? asked : before!;
  if (!row || row.band !== next) await ctx.repo.setAgeBand(me.id, next, ctx.now());
  // Every statement of a minor band re-applies what it takes away (idempotent), so a token or membership added
  // through an older path in between is caught too.
  await onStricterBand(ctx, me, next, effects);
  // Compliance switches 2026-11-14 (UNDER13_MODE=offline): the band is kept (only ever stricter), then refused.
  if (next === 'under13' && ctx.policy.under13Mode === 'offline') {
    if (row?.band !== 'under13') await ctx.repo.updatePlayer(me.id, { findable: 'nobody', showOnline: false });
    throw fail(403, 'age_restricted', 'age.under13_offline');
  }
  // First time a minor band is stated: private defaults (a later explicit choice is kept).
  const wasMinor = row?.band === 'under13' || row?.band === '13to17';
  if (next === 'under13' && row?.band !== 'under13') await ctx.repo.updatePlayer(me.id, { findable: 'nobody', showOnline: false });
  else if (next === '13to17' && !wasMinor) await ctx.repo.updatePlayer(me.id, { findable: (me.findable ?? 'everyone') === 'everyone' ? 'friends_of_friends' : me.findable, showOnline: false });
  ctx.metrics.count('tk_age_bands_total', { band: next, changed: String(before !== next) });
  return { band: next };
}

/** Under 13: only the fixed phrases; refused with a clear code otherwise. */
export async function checkChatAllowed(ctx: ServerContext, me: Player, text: unknown): Promise<void> {
  if ((await ageBandOf(ctx.repo, me.id)) !== 'under13') return;
  if (typeof text === 'string' && presetChatId(text) >= 0) return;
  throw fail(403, 'age_restricted', 'age.under13_chat');
}
