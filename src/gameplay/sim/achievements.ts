import type { AchievementDef, GameData, VillageState } from './types';

export function achievementValue(state: VillageState, def: AchievementDef, hall: number): number {
  return def.stat === 'hallLevel' ? hall : state.stats[def.stat] ?? 0;
}

export interface AchievementView {
  def: AchievementDef;
  claimed: number;
  /** Next tier to work on (or null when all are claimed). */
  next: { target: number; reward: number; index: number } | null;
  value: number;
  claimable: boolean;
}

export function achievementViews(state: VillageState, hall: number, data: GameData): AchievementView[] {
  return data.achievements.map((def) => {
    const claimed = state.achievements[def.id] ?? 0;
    const value = achievementValue(state, def, hall);
    const t = def.tiers[claimed];
    const next = t ? { target: t[0], reward: t[1], index: claimed } : null;
    return { def, claimed, next, value, claimable: Boolean(next && value >= next.target) };
  });
}
