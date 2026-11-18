/**
 * The Keep's level (internal type id `hall`, docs/rebuild/ID_MAP.md). Kept apart from village.ts so
 * small rule modules (heroes.ts) can read it without importing village.ts back (quality 22: no import
 * cycles in src). village.ts re-exports it.
 */
import { hallType } from './data';
import type { GameData, VillageState } from './types';

export function hallLevel(state: VillageState, data: GameData): number {
  const type = hallType(data);
  const hall = state.buildings.find((b) => b.type === type);
  return Math.max(1, hall?.level ?? 1);
}
