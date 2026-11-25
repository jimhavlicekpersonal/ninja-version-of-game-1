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
  return armyFromShares(state, suggestedShares(keepOf(state, data), data), data);
}

/**
 * Prebuilt strategies (2026-11-25): named mixes beside the suggested army, by roster role and housing share. Each is
 * built from the newest warrior the player can train in each role, like the suggested army; a role with no warrior
 * unlocked drops out and its share goes to the others. A strategy is offered only once its lead role (the first one)
 * is unlocked. These are composition hints, not combat numbers: they change no battle rule.
 */
export interface Strategy {
  id: string;
  /** Housing share per roster role; the first role leads (the strategy needs it). */
  shares: Record<string, number>;
}

export const STRATEGIES: readonly Strategy[] = [
  { id: 'bladeRush', shares: { blade: 0.6, guardian: 0.25, mystic: 0.15 } },
  { id: 'steelRain', shares: { thrower: 0.55, guardian: 0.35, mystic: 0.1 } },
  { id: 'jamStrike', shares: { saboteur: 0.25, blade: 0.45, thrower: 0.3 } },
  { id: 'wallBreakers', shares: { siege: 0.35, guardian: 0.35, blade: 0.3 } },
  { id: 'tunnelStrike', shares: { infiltrator: 0.5, blade: 0.3, siege: 0.2 } },
  { id: 'skyRaid', shares: { sky: 0.6, saboteur: 0.2, mystic: 0.2 } },
  { id: 'beastPack', shares: { beast: 0.55, guardian: 0.25, mystic: 0.2 } },
  { id: 'shadowAmbush', shares: { shadow: 0.5, infiltrator: 0.25, blade: 0.25 } },
];

/** The strategies this village can field now, with their armies; none repeats the suggested army or another strategy. */
export function availableStrategies(state: VillageState, data: GameData): { id: string; army: Record<string, number> }[] {
  if (housingCapacity(state, data) <= 0) return [];
  const seen = new Set([JSON.stringify(sorted(suggestedArmy(state, data)))]);
  const out: { id: string; army: Record<string, number> }[] = [];
  for (const st of STRATEGIES) {
    const lead = Object.keys(st.shares)[0];
    if (!newestInRole(state, lead, data)) continue;
    const army = armyFromShares(state, st.shares, data);
    const key = JSON.stringify(sorted(army));
    if (!Object.keys(army).length || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: st.id, army });
  }
  return out;
}

function sorted(army: Record<string, number>): [string, number][] {
  return Object.entries(army).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The newest warrior the village can train in a role, or null. */
function newestInRole(state: VillageState, role: string, data: GameData): string | null {
  let best: string | null = null;
  for (const t of Object.keys(data.troops)) {
    if (ROLE_OF[t] !== role || !troopUnlock(state, t, data).unlocked) continue;
    if (!best || (TIER_OF[t] ?? 0) > (TIER_OF[best] ?? 0)) best = t;
  }
  return best;
}

/** Counts that fill the camps in these role shares, from the newest trainable warrior per role. */
function armyFromShares(state: VillageState, shares: Record<string, number>, data: GameData): Record<string, number> {
  const cap = housingCapacity(state, data);
  if (cap <= 0) return {};
  const picks: [string, number][] = [];
  for (const [role, share] of Object.entries(shares)) {
    const best = newestInRole(state, role, data);
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
