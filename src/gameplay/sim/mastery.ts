/**
 * Warrior Mastery (fresh-slate review B4; content batch 2026-11-14), behind `data.features.mastery`, which the
 * shipped data leaves off. The model is PROGRESSION_MODEL.md's: a warrior type earns
 * `housing used x (1 + 2 x stars)` EXP per attack (`battleMasteryXp`); mastery level M needs
 * `50 x (1.35^M - 1) / 0.35` EXP in total (`masteryXpTotal`), and gives `0.30 x (1 - 0.92^M)` more HP and damage
 * (`masteryBonus`, never past +30%). EXP is kept in `VillageState.mastery` (save v23, empty until the feature is
 * on). The bonus reaches a battle only through `BattleSetup.mastery`, which `battleLoadout` fills only while the
 * feature is on, so a live battle never carries it (no rules change). Donated warriors and the hero earn none.
 */
import { battleMasteryXp, masteryBonus, masteryLevelFor } from './progression';
import type { GameData, VillageState } from './types';
import type { BattleResult, BattleSetup } from './battle/types';

export function masteryOn(data: GameData): boolean {
  return data.features?.mastery === true;
}

/** Mastery level of a warrior type (0 = none yet). */
export function masteryLevelOf(state: VillageState, troop: string): number {
  return masteryLevelFor(state.mastery?.[troop] ?? 0);
}

/** The HP/damage bonus each mastered warrior type brings into battle (rounded to 1/10000 so records stay short). */
export function masteryBonuses(state: VillageState, data: GameData): Record<string, number> {
  const out: Record<string, number> = {};
  if (!masteryOn(data)) return out;
  for (const t of Object.keys(state.mastery ?? {})) {
    if (!data.troops[t]) continue;
    const bonus = Math.round(masteryBonus(masteryLevelOf(state, t)) * 10000) / 10000;
    if (bonus > 0) out[t] = bonus;
  }
  return out;
}

/** Add an attack's mastery EXP (own warriors only); returns what each type gained. Mutates. No-op while off. */
export function awardMastery(state: VillageState, result: Pick<BattleResult, 'used' | 'stars'>, setup: Pick<BattleSetup, 'hero' | 'reinforcements'>, data: GameData): Record<string, number> {
  const gained: Record<string, number> = {};
  if (!masteryOn(data)) return gained;
  for (const [t, n] of Object.entries(result.used)) {
    const def = data.troops[t];
    if (!def || t === setup.hero?.id) continue;
    const own = n - Math.min(n, setup.reinforcements?.[t]?.count ?? 0);
    if (own <= 0) continue;
    const xp = battleMasteryXp(def.housing * own, result.stars);
    (state.mastery ??= {})[t] = (state.mastery[t] ?? 0) + xp;
    gained[t] = xp;
  }
  return gained;
}

/** Whether a setup's mastery matches the village (never more than it has earned, and only while the feature is on). */
export function masteryMatches(state: VillageState, setup: Pick<BattleSetup, 'mastery'>, data: GameData): boolean {
  if (!setup.mastery) return true;
  if (!masteryOn(data)) return false;
  const have = masteryBonuses(state, data);
  return Object.entries(setup.mastery).every(([t, b]) => Number.isFinite(b) && b >= 0 && b <= (have[t] ?? 0));
}
