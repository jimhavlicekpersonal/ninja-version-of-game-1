import { troopUnlock } from './army';
import type { AchievementDef, GameData, VillageState } from './types';

/** An achievement's value: a counter, the Keep, or (P5-05) something read from the village. */
export function achievementValue(state: VillageState, def: AchievementDef, hall: number, data: GameData): number {
  switch (def.stat) {
    case 'hallLevel':
      return hall;
    case 'calendarDays':
      return state.calendar.cycles * 28 + state.calendar.claimed;
    case 'warriorsUnlocked':
      return Object.keys(data.troops).filter((t) => troopUnlock(state, t, data).unlocked).length;
    case 'looksOwned':
      return new Set(state.cosmetics.owned).size;
    case 'towerTypesTempered':
      return new Set(state.buildings.filter((b) => b.temper).map((b) => b.type)).size;
    default:
      return state.stats[def.stat] ?? 0;
  }
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
    const value = achievementValue(state, def, hall, data);
    const t = def.tiers[claimed];
    const next = t ? { target: t[0], reward: t[1], index: claimed } : null;
    return { def, claimed, next, value, claimable: Boolean(next && value >= next.target) };
  });
}
