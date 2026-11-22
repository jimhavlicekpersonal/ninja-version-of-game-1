import { buildingDef } from './data';
import type { Building, BuildingType, GameData, VillageState } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PlaceCheck = { ok: true } | { ok: false; reason: 'OUT_OF_BOUNDS' | 'OVERLAP' };

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function footprint(b: Pick<Building, 'type' | 'x' | 'y'>, data: GameData): Rect {
  const size = buildingDef(data, b.type).size;
  return { x: b.x, y: b.y, w: size, h: size };
}

/** Can a building of `type` sit with its top-left tile at (x, y)? `ignoreId` lets a building move onto its own old spot. */
export function canPlace(
  state: VillageState,
  data: GameData,
  type: BuildingType,
  x: number,
  y: number,
  ignoreId?: string,
): PlaceCheck {
  const size = buildingDef(data, type).size;
  const map = data.economy.mapSize;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + size > map || y + size > map) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }
  const rect = { x, y, w: size, h: size };
  for (const b of state.buildings) {
    if (b.id === ignoreId) continue;
    if (rectsOverlap(rect, footprint(b, data))) return { ok: false, reason: 'OVERLAP' };
  }
  return { ok: true };
}

/** True if a size x size building at (x, y) keeps `gap` empty tiles from every other building. */
function hasGap(state: VillageState, data: GameData, size: number, x: number, y: number, gap: number, ignoreId?: string): boolean {
  if (gap <= 0) return true;
  const grown = { x: x - gap, y: y - gap, w: size + gap * 2, h: size + gap * 2 };
  return state.buildings.every((b) => b.id === ignoreId || !rectsOverlap(grown, footprint(b, data)));
}

/**
 * Find a free spot near (nearX, nearY) for a new building. Prefers spots that
 * leave a one-tile gap around other buildings, and spots in front of (below)
 * the search point so the new building is not hidden behind taller ones.
 */
export function findFreeSpot(
  state: VillageState,
  data: GameData,
  type: BuildingType,
  nearX: number,
  nearY: number,
): { x: number; y: number } | null {
  const map = data.economy.mapSize;
  const size = buildingDef(data, type).size;
  const cx = Math.round(nearX);
  const cy = Math.round(nearY);
  // Spots up-screen of the search point (dx + dy < 0) can hide behind taller buildings,
  // so they count as a few tiles further away.
  const BEHIND_PENALTY = 4;
  for (const gap of [1, 0]) {
    let best: { x: number; y: number; score: number } | null = null;
    for (let r = 0; r < map + BEHIND_PENALTY; r++) {
      if (best && r > best.score) break; // no later ring can beat it
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          const score = r + (dx + dy < 0 ? BEHIND_PENALTY : 0) + Math.abs(dx - dy) * 0.01;
          if (best && score >= best.score) continue;
          if (canPlace(state, data, type, x, y).ok && hasGap(state, data, size, x, y, gap)) best = { x, y, score };
        }
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}
