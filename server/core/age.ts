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
 */
import { bandChangeAllowed, isAgeBand, type AgeBand } from '../../src/gameplay/sim/age';
import { PRESET_CHAT, type AgeRequest, type AgeResponse } from '../../src/backend/net/protocol';
import type { Player, Repo } from '../repo';
import { ApiError, type ServerContext } from './context';

/** The band a kept row stands for (an "under 18" from before bands counts as 13to17 here). */
export function keptBand(row: { band: AgeBand | null; under18: boolean } | null): AgeBand | null {
  if (!row) return null;
  if (row.band && !(row.band === 'adult' && row.under18)) return row.band;
  return row.under18 ? '13to17' : 'adult';
}

export async function ageBandOf(repo: Repo, playerId: string): Promise<AgeBand | null> {
  return keptBand(await repo.getAgeBand(playerId));
}

/** PUT /v1/me/age { band }: keep the stricter band; answer with the band now kept. */
export async function stateAge(ctx: ServerContext, me: Player, body: AgeRequest | undefined): Promise<AgeResponse> {
  const asked = body?.band ?? null;
  if (asked !== null && !isAgeBand(asked)) throw new ApiError(400, 'bad_request', 'band must be under13, 13to17, adult or null.');
  const row = await ctx.repo.getAgeBand(me.id);
  const before = keptBand(row);
  if (!asked) return { band: before };
  // Same or stricter only (an "under 18" from before bands never becomes adult).
  const next: AgeBand = !row || bandChangeAllowed(row.band, row.under18, asked) ? asked : before!;
  if (!row || row.band !== next) await ctx.repo.setAgeBand(me.id, next, ctx.now());
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
  if (typeof text === 'string' && PRESET_CHAT.includes(text.trim())) return;
  throw new ApiError(403, 'age_restricted', 'Players under 13 chat with the ready-made phrases only.');
}
