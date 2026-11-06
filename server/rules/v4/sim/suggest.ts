/**
 * A suggested army (design re-audit, Nov 2026): casual players who field one of each
 * family's newest warrior (no tank, mostly specialists) averaged well under one star from
 * Keep 8 on, while the raid bots' mix (blades, throwers, a guardian front line and a few
 * saboteurs) averages one to two. The Army panel offers this as "Suggested army": the newest
 * warrior the player can train in each of those roles, in the raid bots' shares
 * (`raids.botArmyMix` for the Keep, by role), filling the camps. Train it with `trainArmy`.
 */
import roster from '../data/roster.json';
import { housingCapacity, troopUnlock } from './army';
import type { GameData, VillageState } from './types';

const ROLE_OF: Record<string, string> = Object.fromEntries((roster.warriors as { role: string; tier: number; liveTroop?: string }[]).filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.role]));
const TIER_OF: Record<string, number> = Object.fromEntries((roster.warriors as { role: string; tier: number; liveTroop?: string }[]).filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.tier]));

function keepOf(state: VillageState, data: GameData): number {
  return Math.max(1, state.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
}

/** Housing share per roster role in the raid bots' mix for a Keep. */
export function suggestedShares(keep: number, data: GameData): Record<string, number> {
  const mixes = data.raids.botArmyMix;
  const mix = mixes[Math.max(1, Math.min(mixes.length, keep)) - 1];
  const out: Record<string, number> = {};
  for (const [t, share] of Object.entries(mix)) {
    const role = ROLE_OF[t];
    if (role) out[role] = (out[role] ?? 0) + share;
  }
  return out;
}

/** The suggested army for this village: counts that fill its camps, from warriors it can train now. Empty without camps. */
export function suggestedArmy(state: VillageState, data: GameData): Record<string, number> {
  const cap = housingCapacity(state, data);
  if (cap <= 0) return {};
  const shares = suggestedShares(keepOf(state, data), data);
  const picks: [string, number][] = [];
  for (const [role, share] of Object.entries(shares)) {
    let best: string | null = null;
    for (const t of Object.keys(data.troops)) {
      if (ROLE_OF[t] !== role || !troopUnlock(state, t, data).unlocked) continue;
      if (!best || (TIER_OF[t] ?? 0) > (TIER_OF[best] ?? 0)) best = t;
    }
    if (best) picks.push([best, share]);
  }
  const total = picks.reduce((a, [, v]) => a + v, 0);
  const army: Record<string, number> = {};
  let used = 0;
  for (const [t, share] of picks) {
    const n = Math.floor((cap * share) / total / data.troops[t].housing);
    if (n > 0) {
      army[t] = (army[t] ?? 0) + n;
      used += n * data.troops[t].housing;
    }
  }
  // Fill what rounding left with the smallest pick.
  const filler = picks.map(([t]) => t).sort((a, b) => data.troops[a].housing - data.troops[b].housing)[0];
  if (filler) {
    const extra = Math.floor((cap - used) / data.troops[filler].housing);
    if (extra > 0) army[filler] = (army[filler] ?? 0) + extra;
  }
  return army;
}
