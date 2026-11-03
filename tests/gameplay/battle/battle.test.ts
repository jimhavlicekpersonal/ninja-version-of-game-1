import { describe, expect, it } from 'vitest';
import { canDeploy, createBattle, deploy, result, runBattle, step } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent, totalLoot } from '../../../src/gameplay/sim/battle/basegen';
import { findPath, HEDGE, BLOCKED } from '../../../src/gameplay/sim/battle/pathfind';
import type { BaseLayout, BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { createRng, int, next } from '../../../src/gameplay/sim/rng';

const tiny = (buildings: BaseLayout['buildings']): BaseLayout => ({ name: 'Test', hallLevel: 1, buildings });

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 5 }, () => next(a));
    expect(Array.from({ length: 5 }, () => next(b))).toEqual(xs);
    expect(next(createRng(43))).not.toBe(xs[0]);
    const r = createRng(1);
    for (let i = 0; i < 100; i++) {
      const v = int(r, 3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('pathfinding', () => {
  const grid = (size: number) => ({ size, cells: new Uint8Array(size * size) });

  it('walks around buildings', () => {
    const g = grid(10);
    for (let y = 0; y < 8; y++) g.cells[y * 10 + 5] = BLOCKED;
    const path = findPath(g, 1.5, 1.5, { x: 8, y: 1, w: 1, h: 1 }, 0.6, 10, false)!;
    expect(path).not.toBeNull();
    for (const i of path) expect(g.cells[i]).not.toBe(BLOCKED);
    expect(path.some((i) => Math.floor(i / 10) >= 8)).toBe(true); // went below the wall
  });

  it('breaks through hedges only when going around is much longer', () => {
    const g = grid(20);
    for (let y = 0; y < 20; y++) g.cells[y * 20 + 10] = HEDGE; // full hedge line
    const path = findPath(g, 2.5, 10.5, { x: 15, y: 10, w: 1, h: 1 }, 0.6, 10, false)!;
    expect(path.some((i) => g.cells[i] === HEDGE)).toBe(true);
    // With a gap close by, it walks through the gap instead.
    g.cells[11 * 20 + 10] = 0;
    const p2 = findPath(g, 2.5, 10.5, { x: 15, y: 10, w: 1, h: 1 }, 0.6, 10, false)!;
    expect(p2.some((i) => g.cells[i] === HEDGE)).toBe(false);
  });
});

describe('battle simulation', () => {
  const base = tiny([
    { id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18, loot: { acorns: 300, dew: 300 } },
    { id: 's', type: 'acorn_silo', level: 1, x: 12, y: 18, loot: { acorns: 600 } },
  ]);

  it('cannot deploy on or next to buildings', () => {
    const sim = createBattle({ seed: 1, base, army: { hedgehog_roller: 5 } }, data);
    expect(canDeploy(sim, 'hedgehog_roller', 19, 19)).toBe(false);
    expect(canDeploy(sim, 'hedgehog_roller', 22, 19)).toBe(false); // 1 tile margin
    expect(canDeploy(sim, 'hedgehog_roller', 25, 19)).toBe(true);
    expect(canDeploy(sim, 'frog_lobber', 25, 19)).toBe(false); // not in the army
  });

  it('troops destroy an undefended base for 3 stars and all its loot', () => {
    const setup: BattleSetup = { seed: 7, base, army: { hedgehog_roller: 20 } };
    const deps: Deployment[] = Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 + (i % 3) }));
    const { result: r } = runBattle(setup, deps, data);
    expect(r.destruction).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.hallDestroyed).toBe(true);
    expect(r.loot).toEqual({ acorns: 900, dew: 300 });
    expect(r.endReason).toBe('destroyed');
  });

  it('loot scales with destruction: destroying only the silo gives only its loot', () => {
    const setup: BattleSetup = { seed: 7, base, army: { hedgehog_roller: 3 } };
    const deps = [0, 1, 2].map((i) => ({ tick: i, troop: 'hedgehog_roller', x: 8, y: 19 }));
    const { result: r } = runBattle(setup, deps, data, 400);
    expect(r.loot.acorns).toBe(600);
    expect(r.loot.dew ?? 0).toBe(0);
    expect(r.destruction).toBe(50);
    expect(r.stars).toBe(1);
  });

  it('a 3-minute timer ends the battle', () => {
    const setup: BattleSetup = { seed: 1, base, army: { hedgehog_roller: 1 } };
    const { result: r } = runBattle(setup, [], data);
    expect(r.ticks).toBe(180 * 10);
    expect(r.endReason).toBe('time');
    expect(r.stars).toBe(0);
  });

  it('defenses kill weak troops; ground-only cannons ignore flyers', () => {
    const defended = tiny([
      { id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 },
      { id: 'c', type: 'acorn_cannon', level: 7, x: 23, y: 18 },
    ]);
    const ground = runBattle({ seed: 3, base: defended, army: { hedgehog_roller: 3 } }, [0, 1, 2].map((i) => ({ tick: i, troop: 'hedgehog_roller', x: 29, y: 19 })), data);
    expect(ground.sim.troops.every((t) => t.dead)).toBe(true);
    const air = runBattle({ seed: 3, base: defended, army: { owl_bomber: 1 } }, [{ tick: 0, troop: 'owl_bomber', x: 29, y: 19 }], data);
    expect(air.sim.troops[0].dead).toBe(false);
    expect(air.result.hallDestroyed || air.sim.buildings[1].destroyed).toBe(true);
  });

  it('mole diggers ignore hedges that stop other troops', () => {
    const walled = tiny([
      { id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, type: 'bramble_hedge', level: 6, x: 16 + i, y: 16 })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, type: 'bramble_hedge', level: 6, x: 16 + i, y: 23 })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, type: 'bramble_hedge', level: 6, x: 16, y: 17 + i })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, type: 'bramble_hedge', level: 6, x: 23, y: 17 + i })),
    ]);
    const mole = runBattle({ seed: 5, base: walled, army: { mole_digger: 1 } }, [{ tick: 0, troop: 'mole_digger', x: 20, y: 10 }], data, 300);
    const hog = runBattle({ seed: 5, base: walled, army: { hedgehog_roller: 1 } }, [{ tick: 0, troop: 'hedgehog_roller', x: 20, y: 10 }], data, 300);
    const hedgesBroken = (r: typeof mole) => r.sim.buildings.filter((b) => b.kind === 'hedge' && b.hp < b.maxHp).length;
    expect(hedgesBroken(mole)).toBe(0);
    expect(mole.sim.buildings[0].hp).toBeLessThan(mole.sim.buildings[0].maxHp);
    expect(hedgesBroken(hog)).toBeGreaterThan(0);
  });

  it('replays identically from seed + deployments', () => {
    const opp = generateOpponent(12345, 4, data);
    const army = { hedgehog_roller: 20, frog_lobber: 10, beetle_brute: 2, owl_bomber: 2 };
    const setup: BattleSetup = { seed: 999, base: opp, army };
    // Live play: deploy as we go, recording each deployment with its tick.
    const live = createBattle(setup, data);
    const recorded: Deployment[] = [];
    const plan: Deployment[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ tick: i * 3, troop: 'hedgehog_roller', x: 2 + (i % 5), y: 2 })),
      ...Array.from({ length: 10 }, (_, i) => ({ tick: 40 + i * 4, troop: 'frog_lobber', x: 2, y: 3 + i })),
      { tick: 30, troop: 'beetle_brute', x: 37, y: 37 },
      { tick: 31, troop: 'beetle_brute', x: 37, y: 36 },
      { tick: 90, troop: 'owl_bomber', x: 37, y: 2 },
      { tick: 95, troop: 'owl_bomber', x: 36, y: 2 },
    ];
    while (!live.ended) {
      const now = plan.filter((d) => d.tick === live.tick);
      for (const d of now) if (deploy(live, d)) recorded.push(d);
      step(live);
    }
    const liveResult = result(live);
    const replay1 = runBattle(setup, recorded, data).result;
    const replay2 = runBattle(structuredClone(setup), structuredClone(recorded), data).result;
    expect(replay1).toEqual(liveResult);
    expect(replay2.hash).toBe(liveResult.hash);
    expect(liveResult.destruction).toBeGreaterThan(0);
  });
});

describe('generated opponents', () => {
  it('are deterministic, valid and carry loot within the hall range', () => {
    for (const hl of [1, 3, 6]) {
      const a = generateOpponent(777 + hl, hl, data);
      const b = generateOpponent(777 + hl, hl, data);
      expect(a).toEqual(b);
      expect(a.buildings[0].type).toBe('elder_toadstool');
      // No overlaps, all on the map.
      const occ = new Set<string>();
      for (const bb of a.buildings) {
        const s = data.buildings[bb.type].size;
        for (let y = bb.y; y < bb.y + s; y++) for (let x = bb.x; x < bb.x + s; x++) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(40);
          const k = `${x},${y}`;
          expect(occ.has(k)).toBe(false);
          occ.add(k);
        }
      }
      const loot = totalLoot(a);
      const range = data.battle.generatedLootByHall[hl - 1];
      for (const r of ['acorns', 'dew'] as const) {
        expect(loot[r]!).toBeGreaterThanOrEqual(range.min);
        expect(loot[r]!).toBeLessThanOrEqual(range.max);
      }
    }
    expect(generateOpponent(1, 3, data)).not.toEqual(generateOpponent(2, 3, data));
  });

  it('higher hall bases have defenses', () => {
    const b = generateOpponent(5, 4, data);
    expect(b.buildings.some((x) => x.type === 'acorn_cannon')).toBe(true);
    expect(b.buildings.some((x) => x.type === 'bramble_hedge')).toBe(true);
  });
});

describe('battle fingerprint', () => {
  // Postgres jsonb returns object keys reordered (shorter first, then bytewise). The server
  // simulates on that copy, the client on the original, and both must agree.
  const jsonbOrder = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(jsonbOrder)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, jsonbOrder(x)]))
        : v;

  it('does not depend on the key order of the stored base', { timeout: 60_000 }, () => {
    // Seeds 1-40 include bases whose old fingerprint changed after a jsonb round trip.
    for (let s = 1; s < 40; s++) {
      for (const hall of [1, 2, 3]) {
        const base = generateOpponent(s * 31, hall, data, { levelBias: 0.5 });
        const deps = Array.from({ length: 25 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i }));
        for (const infiltration of [undefined, true]) {
          const a = runBattle({ seed: 1234, base, army: { hedgehog_roller: 25 }, infiltration }, deps, data).result;
          const b = runBattle({ seed: 1234, base: jsonbOrder(structuredClone(base)) as typeof base, army: { hedgehog_roller: 25 }, infiltration }, deps, data).result;
          expect(b.hash, `seed ${s} hall ${hall}`).toBe(a.hash);
        }
      }
    }
  });
});
