/**
 * P6-09 (PLY-07): the one way the interface names a unit by id: a warrior, then a hero, then an ability. The result
 * screen once read "Warriors used: 1 shadow_captain" because the hero is not in `data.troops`. Pass display data
 * (`displayData`), so the name comes out translated.
 */
import type { GameData } from '../../gameplay/sim/types';

export function unitName(id: string, data: Pick<GameData, 'troops' | 'battle'>): string {
  return data.troops[id]?.name ?? data.battle.heroes?.[id]?.name ?? (data.battle.abilities as Record<string, { name?: string }> | undefined)?.[id]?.name ?? id;
}
