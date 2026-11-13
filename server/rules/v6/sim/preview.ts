import type { BuildingType, GameData } from './types';

export interface UnlockItem {
  type: BuildingType;
  /** new: first one becomes available; more: you can build extra; levelCap: higher max level. */
  kind: 'new' | 'more' | 'levelCap';
  from: number;
  to: number;
}

/** What upgrading the Elder Toadstool from `level` to `level + 1` unlocks. */
export function hallUnlocks(level: number, data: GameData): UnlockItem[] {
  const cur = data.hall.levels[level - 1];
  const next = data.hall.levels[level];
  if (!cur || !next) return [];
  const items: UnlockItem[] = [];
  for (const [type, lim] of Object.entries(next.limits)) {
    const was = cur.limits[type] ?? { count: 0, maxLevel: 0 };
    if (was.count === 0 && lim.count > 0) {
      items.push({ type, kind: 'new', from: 0, to: lim.count });
      continue;
    }
    if (lim.count > was.count) items.push({ type, kind: 'more', from: was.count, to: lim.count });
    if (lim.maxLevel > was.maxLevel) items.push({ type, kind: 'levelCap', from: was.maxLevel, to: lim.maxLevel });
  }
  return items;
}

/** The higher troop research cap the next Elder Toadstool level brings, if any. */
export function troopCapUnlock(level: number, data: GameData): { from: number; to: number } | null {
  const cur = data.hall.levels[level - 1];
  const next = data.hall.levels[level];
  if (!cur || !next || next.troopLevelCap <= cur.troopLevelCap) return null;
  return { from: cur.troopLevelCap, to: next.troopLevelCap };
}
