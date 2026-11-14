/**
 * The age band a player's kept row stands for, and the push-token sweep for an under-13 band (third verification
 * fixes 2026-11-14). A leaf module (types and `sim/age` only), so the push sender, matchmaking and shared replays
 * can read a band without importing the rest of the core (tests/architecture/cycles.test.ts).
 */
import type { AgeBand } from '../../src/gameplay/sim/age';
import type { Repo } from '../repo';

/** The band a kept row stands for (an "under 18" from before bands counts as 13to17 here). */
export function keptBand(row: { band: AgeBand | null; under18: boolean } | null): AgeBand | null {
  if (!row) return null;
  if (row.band && !(row.band === 'adult' && row.under18)) return row.band;
  return row.under18 ? '13to17' : 'adult';
}

export async function ageBandOf(repo: Repo, playerId: string): Promise<AgeBand | null> {
  return keptBand(await repo.getAgeBand(playerId));
}

/** Delete every push token of this player (an under-13 band keeps none). */
export async function dropPushTokens(repo: Repo, playerId: string): Promise<number> {
  const tokens = await repo.pushTokensOf(playerId);
  for (const t of tokens) await repo.removePushToken(t.token);
  return tokens.length;
}
