/**
 * Gameplay audit fixes for battle AI and generated bases:
 * F11 generated Repair Cranes / Incense Burners cover defenses,
 * F12 wall-breakers break only the wall in the way and artillery shells defenses,
 * F13 healers do not stall behind walls,
 * F20 the taught smoke tactic (smoke over your warriors) actually protects them.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, deploy, deploymentsByTick, inSmoke, step, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { defensesCovered, generateOpponent, LAYOUTS } from '../../../src/gameplay/sim/battle/basegen';
import type { BaseBuilding, BaseLayout } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { createRng } from '../../../src/gameplay/sim/rng';

const hall: BaseBuilding = { id: 'h', type: 'elder_toadstool', level: 15, x: 30, y: 30 };

describe('F11: generated support counters cover defenses', () => {
  it('every generated Repair Crane and Incense Burner covers at least one defense (all layouts, Keeps 6-15)', () => {
    let placed = 0;
    for (let keep = 6; keep <= 15; keep++) {
      for (const layout of [undefined, ...LAYOUTS]) {
        for (let i = 0; i < 4; i++) {
          const base = generateOpponent(5000 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
          for (const b of base.buildings.filter((x) => x.type === 'clockwork_repairer' || x.type === 'bitter_incense_burner')) {
            placed++;
            const others = base.buildings.filter((x) => x !== b);
            expect(defensesCovered(data, others, b.type, b.x, b.y), `${b.type} keep ${keep} ${layout?.id ?? 'random'} #${i}`).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
    expect(placed).toBeGreaterThan(100);
  });
});

/** A troop deployed at the edge, then moved to an exact spot. */
function put(s: BattleSim, troop: string, x: number, y: number): number {
  expect(deploy(s, { troop, x: 1, y: 1, tick: s.tick })).toBe(true);
  const t = s.troops[s.troops.length - 1];
  t.x = t.px = x;
  t.y = t.py = y;
  return t.id;
}

describe('F12: siege targets useful objectives', () => {
  it('a Ram Crew ignores a wall that is not in its way and goes for the defense', () => {
    const walls: BaseBuilding[] = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, type: 'bramble_hedge', level: 5, x: 5 + i, y: 30 }));
    const base: BaseLayout = { name: 'x', hallLevel: 15, buildings: [hall, { id: 'cannon', type: 'acorn_cannon', level: 1, x: 12, y: 12 }, ...walls] };
    const s = createBattle({ seed: 1, base, army: { ram_crew: 1 }, levels: {} }, data);
    const ti = put(s, 'ram_crew', 10, 20);
    step(s);
    expect(s.buildings[s.troops[ti].target].type).toBe('acorn_cannon');
  });

  it('a Ram Crew breaks the wall that closes off the defense, then hits the defense', () => {
    const ring: BaseBuilding[] = [];
    for (let i = 10; i <= 16; i++) ring.push({ id: `t${i}`, type: 'bramble_hedge', level: 5, x: i, y: 10 }, { id: `b${i}`, type: 'bramble_hedge', level: 5, x: i, y: 16 });
    for (let y = 11; y < 16; y++) ring.push({ id: `l${y}`, type: 'bramble_hedge', level: 5, x: 10, y }, { id: `r${y}`, type: 'bramble_hedge', level: 5, x: 16, y });
    const base: BaseLayout = { name: 'x', hallLevel: 15, buildings: [hall, { id: 'cannon', type: 'acorn_cannon', level: 1, x: 12, y: 12 }, ...ring] };
    const s = createBattle({ seed: 1, base, army: { ram_crew: 1 }, levels: {} }, data);
    const ti = put(s, 'ram_crew', 13, 4);
    step(s);
    expect(s.buildings[s.troops[ti].target].kind).toBe('hedge');
  });

  it('the Siege Bombardier fires on defenses and leaves walls that are not in its way alone', () => {
    expect(data.troops.siege_bombardier.prefers).toBe('defense');
    // A wall line far off to the side, a defense in front: the old rule spent its fire on the walls.
    const walls: BaseBuilding[] = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, type: 'bramble_hedge', level: 5, x: 2 + i, y: 30 }));
    const base: BaseLayout = { name: 'x', hallLevel: 15, buildings: [hall, { id: 'cannon', type: 'acorn_cannon', level: 1, x: 20, y: 12 }, ...walls] };
    const s = createBattle({ seed: 1, base, army: { siege_bombardier: 3 }, levels: {} }, data);
    for (let i = 0; i < 3; i++) put(s, 'siege_bombardier', 21, 22);
    let wallHits = 0;
    let cannonHits = 0;
    for (let i = 0; i < 300 && !s.ended; i++) {
      step(s);
      for (const e of s.events) if (e.k === 'buildingHit') {
        if (s.buildings[e.building].kind === 'hedge') wallHits++;
        if (s.buildings[e.building].id === 'cannon') cannonHits++;
      }
    }
    expect(cannonHits).toBeGreaterThan(0);
    expect(wallHits).toBe(0);
  });
});

describe('F13: healers do not stall behind walls', () => {
  it('a Herbalist outside a closed wall ring reaches its ally or breaks in', () => {
    const wall: BaseBuilding[] = [];
    for (let i = 10; i <= 20; i++) wall.push({ id: `top${i}`, type: 'bramble_hedge', level: 13, x: i, y: 10 }, { id: `bottom${i}`, type: 'bramble_hedge', level: 13, x: i, y: 20 });
    for (let y = 11; y < 20; y++) wall.push({ id: `left${y}`, type: 'bramble_hedge', level: 13, x: 10, y }, { id: `right${y}`, type: 'bramble_hedge', level: 13, x: 20, y });
    const s = createBattle({ seed: 1, base: { name: 'x', hallLevel: 15, buildings: [hall, ...wall] }, army: { herbalist: 1, mole_digger: 1 } }, data);
    const healer = put(s, 'herbalist', 8, 15);
    const ally = put(s, 'mole_digger', 15, 15);
    for (let i = 0; i < 300; i++) {
      // Hold the wall-bypassing ally inside the ring.
      s.troops[ally].x = 15;
      s.troops[ally].y = 15;
      s.troops[ally].cooldown = 99999;
      step(s);
    }
    const wallDamage = s.buildings.filter((b) => b.kind === 'hedge').reduce((n, b) => n + b.maxHp - b.hp, 0);
    const h = s.troops[healer];
    const reached = Math.hypot(h.x - 15, h.y - 15) <= (data.troops.herbalist.kit?.radius ?? 3);
    expect(wallDamage > 0 || reached).toBe(true);
    expect(h.x).toBeGreaterThan(9.2); // it did not stay parked at the wall
  });
});

describe('F20: the taught smoke tactic protects warriors', () => {
  it('smoke thrown over Shinobi as they reach the tower shelters them; smoke thrown first does not', () => {
    for (let i = 0; i < 6; i++) {
      const base = generateOpponent(1000 + i * 7919, 1, data);
      const tower = base.buildings.find((x) => data.buildings[x.type].category === 'defense')!;
      const size = data.buildings[tower.type].size;
      const range = data.buildings[tower.type].combat!.range;
      const run = (smokeFirst: boolean) => {
        const setup = { seed: 42, base, army: { hedgehog_roller: 20 }, levels: { hedgehog_roller: 1 }, infiltration: true };
        const s = createBattle(setup, data);
        const deps = botDeployments(s.deployable, s.grid.size, setup.army, createRng(13), data, setup.levels, s.entry);
        if (smokeFirst) deps.unshift({ troop: 'smoke_bomb', tick: 0, x: tower.x + Math.floor(size / 2), y: tower.y + Math.floor(size / 2) });
        const byTick = deploymentsByTick(deps);
        let thrown = smokeFirst;
        let sheltered = 0;
        const cx = tower.x + size / 2;
        const cy = tower.y + size / 2;
        while (!s.ended) {
          const now = [...(byTick.get(s.tick) ?? [])];
          if (!thrown) {
            // As taught: when the first warrior walks into the tower's range, smoke it.
            const first = s.troops.find((t) => !t.dead && Math.hypot(t.x - cx, t.y - cy) <= range);
            if (first) {
              now.push({ troop: 'smoke_bomb', tick: s.tick, x: first.x, y: first.y });
              thrown = true;
            }
          }
          step(s, now);
          const b = s.buildings.find((x) => x.id === tower.id)!;
          for (const t of s.troops) if (!t.dead && !b.destroyed && inSmoke(s, t.x, t.y) && Math.hypot(t.x - cx, t.y - cy) <= range) sheltered++;
        }
        return sheltered;
      };
      expect(run(true), `smoke first, seed ${i}`).toBe(0);
      expect(run(false), `smoke on warriors, seed ${i}`).toBeGreaterThan(0);
    }
  });

  it('the tutorial and hints teach smoke over your warriors', async () => {
    const fs = await import('node:fs');
    const tut = fs.readFileSync('src/presentation/ui/tutorial.ts', 'utf8');
    expect(tut).not.toMatch(/tap the Kunai Tower: inside the smoke it can only see close up/);
    expect(tut).toMatch(/warriors inside the smoke can only be shot from close up/);
    expect(data.battle.abilities.smoke_bomb.description).toMatch(/over your warriors/);
  });
});

describe('audit follow-ups: matchups and grounded flyers', () => {
  it('a Repair Crane cuts a Hawk Tamer\'s slowing short (the catalog matchup is real)', () => {
    const base: BaseLayout = { name: 'x', hallLevel: 15, buildings: [hall, { id: 'cannon', type: 'acorn_cannon', level: 5, x: 10, y: 10 }, { id: 'crane', type: 'clockwork_repairer', level: 3, x: 13, y: 10 }] };
    const s = createBattle({ seed: 1, base, army: {}, levels: {} }, data);
    const cannon = s.buildings.find((b) => b.id === 'cannon')!;
    cannon.fireSlow = 0.25;
    cannon.slowedUntil = 40;
    step(s);
    expect(cannon.slowedUntil).toBeLessThan(40);
    expect(s.events.some((e) => e.k === 'counter' && e.what === 'repair')).toBe(true);
  });

  it('a flyer grounded by a Ballista can set off a trap; a flying one cannot', () => {
    for (const grounded of [false, true]) {
      const base: BaseLayout = { name: 'x', hallLevel: 15, buildings: [hall, { id: 'pit', type: 'thorn_snare', level: 1, x: 10, y: 10 }] };
      const s = createBattle({ seed: 1, base, army: { owl_bomber: 1 }, levels: {} }, data);
      const t = put(s, 'owl_bomber', 10.5, 10.5);
      if (grounded) s.troops[t].groundedUntil = 50;
      s.troops[t].cooldown = 9999;
      step(s);
      expect(s.buildings.find((b) => b.id === 'pit')!.destroyed, `grounded ${grounded}`).toBe(grounded);
    }
  });
});

