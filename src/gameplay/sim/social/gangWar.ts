/**
 * Gang War army budgets (roadmap steps 65 and 67), shared by the game and the
 * server. A relay's strikes on one base share `relayHousingShare` full armies
 * (social.json `gangWar`): a full opener leaves half an army for the next
 * strike. "A full army" is the whole force a Keep allows: full Army Camps
 * plus a full Lodge of donated warriors. Pure.
 */
import { maxHousingAtHall } from '../army';
import { levelDef } from '../data';
import type { BattleSetup } from '../battle/types';
import type { GameData } from '../types';

/** Most donated warriors (housing) the largest Lodge a Keep allows holds. */
export function maxLodgeAt(hall: number, data: GameData): number {
  const levels = data.hall.levels;
  const lim = levels[Math.max(1, Math.min(levels.length, hall)) - 1]?.limits.grove_lodge;
  if (!lim) return 0;
  return levelDef(data, 'grove_lodge', lim.maxLevel)?.reinforcement ?? 0;
}

/** The whole force a Keep allows: full Army Camps plus a full Lodge. */
export function fullForceHousing(hall: number, data: GameData): number {
  return maxHousingAtHall(hall, data) + maxLodgeAt(hall, data);
}

/** Housing of a battle army (`army` already counts the Lodge's warriors). */
export function armyHousing(army: Record<string, number>, data: GameData): number {
  let n = 0;
  for (const [t, c] of Object.entries(army)) n += (data.troops[t]?.housing ?? 0) * Math.max(0, c);
  return n;
}

/** The share of a full army this army is (what a relay strike spends from its budget). */
export function armyShare(army: Record<string, number>, hall: number, data: GameData): number {
  return armyHousing(army, data) / Math.max(1, fullForceHousing(hall, data));
}

/**
 * The army a relay strike may bring: this loadout cut down to `share` of a
 * full army. Every warrior type keeps its proportion (rounded down), then the
 * space left is filled with the biggest warriors that still fit, so the
 * strike is as strong as its budget allows. Lodge warriors are cut with the
 * same factor and stay a subset of the army. Deterministic.
 */
export function relayLoadout<T extends Pick<BattleSetup, 'army' | 'levels' | 'reinforcements'>>(loadout: T, share: number, hall: number, data: GameData): T {
  const budget = Math.floor(Math.max(0, Math.min(1, share)) * fullForceHousing(hall, data) + 1e-9);
  const total = armyHousing(loadout.army, data);
  if (total <= budget) return loadout;
  const f = budget / Math.max(1, total);
  const types = Object.keys(loadout.army).sort();
  const army: Record<string, number> = {};
  const lodge: Record<string, { count: number; level: number }> = {};
  let used = 0;
  for (const t of types) {
    const n = Math.floor((loadout.army[t] ?? 0) * f);
    if (n <= 0) continue;
    army[t] = n;
    used += (data.troops[t]?.housing ?? 0) * n;
  }
  // Fill the space left, biggest warriors first.
  const bySize = types.slice().sort((a, b) => (data.troops[b]?.housing ?? 0) - (data.troops[a]?.housing ?? 0) || (a < b ? -1 : 1));
  for (const t of bySize) {
    const h = data.troops[t]?.housing ?? 0;
    while (h > 0 && (army[t] ?? 0) < (loadout.army[t] ?? 0) && used + h <= budget) {
      army[t] = (army[t] ?? 0) + 1;
      used += h;
    }
  }
  // Donated warriors first in each type (they would be deployed first anyway).
  for (const [t, r] of Object.entries(loadout.reinforcements ?? {})) {
    const n = Math.min(r.count, army[t] ?? 0);
    if (n > 0) lodge[t] = { count: n, level: r.level };
  }
  const out = { ...loadout, army };
  if (loadout.reinforcements) out.reinforcements = lodge;
  return out;
}
