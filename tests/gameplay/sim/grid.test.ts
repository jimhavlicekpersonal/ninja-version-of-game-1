import { describe, expect, it } from 'vitest';
import { canPlace, findFreeSpot, footprint, rectsOverlap } from '../../../src/gameplay/sim/grid';
import { data, newGame, must, find } from './helpers';

describe('grid placement', () => {
  it('detects overlapping rectangles', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
  });

  it('rejects out-of-bounds placement', () => {
    const { state } = newGame();
    expect(canPlace(state, data, 'acorn_orchard', -1, 0).ok).toBe(false);
    expect(canPlace(state, data, 'acorn_orchard', 38, 0).ok).toBe(false); // 3x3 at 38 spills past 40
    expect(canPlace(state, data, 'acorn_orchard', 37, 37).ok).toBe(true);
  });

  it('rejects placement on top of another building', () => {
    const { state } = newGame();
    const hall = find(state, 'elder_toadstool')[0];
    expect(canPlace(state, data, 'acorn_orchard', hall.x + 1, hall.y + 1).ok).toBe(false);
    expect(canPlace(state, data, 'acorn_orchard', hall.x, hall.y - 3).ok).toBe(true);
  });

  it('a building can be moved to overlap its own old footprint', () => {
    const { state, clock } = newGame();
    const hall = find(state, 'elder_toadstool')[0];
    expect(canPlace(state, data, 'elder_toadstool', hall.x + 1, hall.y, hall.id).ok).toBe(true);
    const moved = must(state, { type: 'move', id: hall.id, x: hall.x + 1, y: hall.y }, clock.now());
    expect(find(moved, 'elder_toadstool')[0].x).toBe(hall.x + 1);
  });

  it('moving onto another building is rejected', () => {
    const { state } = newGame();
    const [lodgeA] = find(state, 'beaver_lodge');
    const hall = find(state, 'elder_toadstool')[0];
    expect(canPlace(state, data, 'beaver_lodge', hall.x, hall.y, lodgeA.id).ok).toBe(false);
  });

  it('footprint matches building size', () => {
    const { state } = newGame();
    const hall = find(state, 'elder_toadstool')[0];
    expect(footprint(hall, data)).toEqual({ x: hall.x, y: hall.y, w: 4, h: 4 });
  });

  it('findFreeSpot picks a free spot in front of the hall with a gap', () => {
    const { state } = newGame();
    const hall = find(state, 'elder_toadstool')[0];
    const spot = findFreeSpot(state, data, 'acorn_orchard', hall.x, hall.y)!;
    expect(canPlace(state, data, 'acorn_orchard', spot.x, spot.y).ok).toBe(true);
    // Not hidden behind the hall (smaller x + y is further up-screen).
    expect(spot.x + spot.y).toBeGreaterThanOrEqual(hall.x + hall.y); // beside or in front, never behind
    for (const b of state.buildings) {
      const f = footprint(b, data);
      expect(rectsOverlap({ x: spot.x - 1, y: spot.y - 1, w: 5, h: 5 }, f)).toBe(false);
    }
  });

  it('findFreeSpot returns null when the map is full', () => {
    const { state } = newGame();
    const tiny = { ...data, economy: { ...data.economy, mapSize: 22 } };
    // Hall at 18,18 4x4 on a 22-tile map, plus lodges; fill everything with a fake huge layout.
    const crowded = { ...state, buildings: [] as typeof state.buildings };
    for (let y = 0; y + 4 <= 22; y += 4) for (let x = 0; x + 4 <= 22; x += 4) crowded.buildings.push({ id: `h${x}-${y}`, type: 'elder_toadstool', level: 1, x, y, upgrade: null, collector: null });
    // The remaining strips are 2 tiles wide: no room for a 3x3.
    expect(findFreeSpot(crowded, tiny, 'acorn_orchard', 10, 10)).toBeNull();
  });
});
