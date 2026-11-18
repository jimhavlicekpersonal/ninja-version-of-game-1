/** Forest obstacles scattered around a new village; clearing them gives free Moonstones. */
import { buildingDef } from './data';
import { canPlace } from './grid';
import { createRng, int, mixSeed, pick } from './rng';
import type { GameData, VillageState } from './types';

/** Place obstacles on free tiles away from the centre. Mutates. */
export function scatterObstacles(state: VillageState, data: GameData): void {
  const cfg = data.economy.obstacles;
  const rng = createRng(mixSeed(state.seed, 0x0b57ac1e));
  const map = data.economy.mapSize;
  const c = map / 2;
  let placed = 0;
  for (let attempt = 0; attempt < cfg.count * 40 && placed < cfg.count; attempt++) {
    const type = pick(rng, cfg.kinds);
    const size = buildingDef(data, type).size;
    const x = int(rng, 1, map - size - 1);
    const y = int(rng, 1, map - size - 1);
    if (Math.max(Math.abs(x + size / 2 - c), Math.abs(y + size / 2 - c)) < cfg.keepClearRadius) continue;
    if (!canPlace(state, data, type, x, y).ok) continue;
    state.buildings.push({ id: `b${state.nextId++}`, type, level: 1, x, y, upgrade: null, collector: null });
    placed++;
  }
}
