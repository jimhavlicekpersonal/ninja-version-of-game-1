/**
 * Defense review 2026-11-17: a layout must leave attackers a way in (sim/entryRoom.ts). The reviewer packed a
 * village so that no tile could be deployed on; every raid then brought no warrior and was paid as a hold.
 */
import { describe, expect, it } from 'vitest';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { raidVillage, villageToBase } from '../../../src/gameplay/sim/defense';
import { leavesEntryRoom, openApproaches } from '../../../src/gameplay/sim/entryRoom';
import { canPlace } from '../../../src/gameplay/sim/grid';
import { createRng } from '../../../src/gameplay/sim/rng';
import { trialBase } from '../../../src/gameplay/sim/trials';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';
import { importProblem } from '../../../server/core/villageImport';

const T0 = Date.UTC(2026, 10, 17, 12);
const WALL = 'bramble_hedge';

/** The reviewer's packer: every building this Keep allows (level 1) and its walls, one tile apart, over the whole map. */
function packed(keep: number): VillageState | null {
  const map = data.economy.mapSize;
  const limits = data.hall.levels[keep - 1].limits;
  const s = createNewVillage(T0, data);
  s.buildings = [];
  let id = 1;
  const pool: { type: string; size: number; level: number }[] = [{ type: 'elder_toadstool', size: data.buildings.elder_toadstool.size, level: keep }];
  for (const [type, lim] of Object.entries(limits)) {
    const def = data.buildings[type];
    if (!def || def.category === 'decor' || def.category === 'obstacle' || def.category === 'trap' || def.category === 'hedge') continue;
    for (let i = 0; i < lim.count; i++) pool.push({ type, size: def.size, level: 1 });
  }
  pool.sort((a, b) => b.size - a.size);
  let walls = limits[WALL]?.count ?? 0;
  const covered = new Uint8Array(map * map);
  const put = (type: string, level: number, x: number, y: number): boolean => {
    if (!canPlace(s, data, type, x, y).ok) return false;
    const def = data.buildings[type];
    s.buildings.push({ id: `b${id++}`, type, level, x, y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: T0 } : null });
    for (let yy = Math.max(0, y - 1); yy < Math.min(map, y + def.size + 1); yy++) for (let xx = Math.max(0, x - 1); xx < Math.min(map, x + def.size + 1); xx++) covered[yy * map + xx] = 1;
    return true;
  };
  for (let y = 0; y < map; y++) {
    for (let x = 0; x < map; x++) {
      if (covered[y * map + x]) continue;
      let done = false;
      for (let i = 0; i < pool.length && !done; i++) {
        const p = pool[i];
        const px = Math.min(x + 1, map - p.size);
        const py = Math.min(y + 1, map - p.size);
        if (px - 1 > x || py - 1 > y) continue;
        if (put(p.type, p.level, px, py)) {
          pool.splice(i, 1);
          done = true;
        }
      }
      if (!done && walls > 0 && put(WALL, 1, Math.min(x + 1, map - 1), Math.min(y + 1, map - 1))) {
        walls--;
        done = true;
      }
      if (!done) return null;
    }
  }
  s.nextId = id;
  s.shieldUntil = 0;
  s.stats.defensesFaced = 99;
  s.trophies = 0;
  return s;
}

describe('a layout must leave attackers a way in', () => {
  it('the hole: a Keep 9 village packed one tile apart has no tile to deploy on, and a raid brings no warrior', () => {
    const s = packed(9)!;
    expect(s).not.toBeNull();
    expect(openApproaches(s.buildings, data)).toBe(0);
    expect(leavesEntryRoom(s.buildings, data)).toBe(false);
    const probe = createBattle({ seed: 1, base: villageToBase(s, T0, data), army: { hedgehog_roller: 10 }, infiltration: true }, data);
    expect(probe.entry?.points ?? []).toHaveLength(0);
    // Such a raid was paid as a hold and raised honor. It is no defense: nothing moves.
    const cap = { ...s.resources };
    const out = raidVillage(s, T0, createRng(5), data);
    expect(Object.values(out.record.result.used).reduce((a, b) => a + b, 0)).toBe(0);
    expect(out.record.banked).toBeUndefined();
    expect(out.record.trophies).toBe(0);
    expect(s.trophies).toBe(0);
    expect(s.stats.defensesWon ?? 0).toBe(0);
    expect(s.resources).toEqual(cap);
  });

  it('such a village cannot move to the server', () => {
    expect(importProblem(packed(9)!, T0, data)).toMatch(/no way in/);
  });

  it('place and move refuse the building that would close the village, and nothing before it', () => {
    let s = createNewVillage(T0, data);
    s.buildings = s.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 15 } : b)).filter((b) => data.buildings[b.type].category !== 'obstacle');
    s.resources = { ...s.resources, acorns: 10_000_000, dew: 10_000_000 };
    expect(openApproaches(s.buildings, data)).toBe(8);
    const map = data.economy.mapSize;
    // Nine walls three tiles apart close one corner: every tile within reach of that approach is beside a wall.
    const corner = (cx: number, cy: number) => [1, 4, 7].flatMap((dx) => [1, 4, 7].map((dy) => [cx === 0 ? dx : map - 1 - dx, cy === 0 ? dy : map - 1 - dy] as [number, number]));
    const placeWall = (x: number, y: number) => applyCommand(s, { type: 'place', buildingType: WALL, x, y }, T0, data);
    for (const [x, y] of [...corner(0, 0), ...corner(1, 0)]) {
      const r = placeWall(x, y);
      expect(r.ok, `${x},${y}`).toBe(true);
      if (r.ok) s = r.state;
    }
    // Two corners closed: six approaches are still open, which is what the rule asks for.
    expect(openApproaches(s.buildings, data)).toBe(6);
    // A third corner: walls go down until one would close it. That one is refused, and only that one.
    let closing: [number, number] | null = null;
    for (const [x, y] of corner(0, 1)) {
      const r = placeWall(x, y);
      if (r.ok) s = r.state;
      else {
        expect(r.code).toBe('INVALID_PLACEMENT');
        closing = [x, y];
        break;
      }
    }
    expect(closing).not.toBeNull();
    expect(openApproaches(s.buildings, data)).toBe(6);
    const [lx, ly] = closing!;
    expect(canPlace(s, data, WALL, lx, ly).ok).toBe(true);
    // Moving a wall there is the same change.
    const spare = placeWall(20, 2);
    expect(spare.ok).toBe(true);
    if (spare.ok) s = spare.state;
    const moved = applyCommand(s, { type: 'move', id: s.buildings[s.buildings.length - 1].id, x: lx, y: ly }, T0, data);
    expect(moved.ok).toBe(false);
    // A decoration does not stand on the battlefield, so it may go there.
    expect(applyCommand(s, { type: 'place', buildingType: 'flower_bed', x: lx, y: ly }, T0, data).ok).toBe(true);
  });

  it('a village that was already closed is not frozen: its buildings can still be moved', () => {
    const s = packed(9)!;
    const wall = s.buildings.find((b) => b.type === WALL)!;
    const others = s.buildings.filter((b) => b.id !== wall.id);
    const open = { ...s, buildings: others };
    // Find any free tile for it.
    const map = data.economy.mapSize;
    let moved = false;
    for (let y = 0; y < map && !moved; y++) for (let x = 0; x < map && !moved; x++) {
      if ((x !== wall.x || y !== wall.y) && canPlace(open, data, WALL, x, y).ok) moved = applyCommand(s, { type: 'move', id: wall.id, x, y }, T0, data).ok;
    }
    expect(moved).toBe(true);
  });

  it('every base the game generates leaves all eight approaches open', () => {
    for (let keep = 1; keep <= data.hall.levels.length; keep++) {
      for (const seed of [1, 7, 1234, 99991]) {
        for (const bias of [0, 0.5, 1]) expect(openApproaches(generateOpponent(seed, keep, data, { levelBias: bias }).buildings, data), `Keep ${keep} seed ${seed}`).toBe(8);
      }
    }
    for (const tier of [1, 10, 40, 120]) expect(openApproaches(trialBase(tier, data, 0).buildings, data)).toBe(8);
    expect(openApproaches(createNewVillage(T0, data).buildings, data)).toBe(8);
  });
});
