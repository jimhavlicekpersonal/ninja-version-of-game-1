/** Procedural AI clan villages: legal, recognisable, near their designed difficulty (sim/world/villagegen.ts). */
import { describe, expect, it } from 'vitest';
import { armyHousing } from '../../../src/gameplay/sim/army';
import { createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { createRng } from '../../../src/gameplay/sim/rng';
import { defensePower } from '../../../src/gameplay/sim/world/power';
import { clanArmy, clanVillage, estimateDifficulty, expectedDefense, firstRaidBase, hallAndBias, validateLayout } from '../../../src/gameplay/sim/world/villagegen';
import { data } from '../sim/helpers';

const count = (b: BaseLayout, cat: string) => b.buildings.filter((x) => data.buildings[x.type].category === cat).length;

describe('clan villages', () => {
  it('every clan builds legal, reachable villages at every Keep it lives at', () => {
    for (const clan of data.clans.clans) {
      for (let hall = clan.halls[0]; hall <= clan.halls[1]; hall++) {
        for (let v = 0; v < 6; v++) {
          const base = clanVillage(clan.id, 1000 + v * 7919, hall - 1 + 0.5, data);
          const check = validateLayout(base, data);
          expect(check.problems, `${clan.id} keep ${hall} variant ${v}`).toEqual([]);
          expect(base.hallLevel).toBe(hall);
        }
      }
    }
  });

  it('is deterministic and always labelled as an AI clan village', () => {
    const a = clanVillage('crimson_fang', 42, 1.6, data);
    expect(clanVillage('crimson_fang', 42, 1.6, data)).toEqual(a);
    expect(a.clan).toBe('crimson_fang');
    expect(a.practice).toContain('AI');
  });

  it('layouts follow the clan identity', () => {
    // Same Keep (3): Iron Serpent builds every wall, Bamboo only a third; Crimson Fang every trap.
    const iron = clanVillage('iron_serpent', 7, 2.5, data);
    const bamboo = clanVillage('bamboo', 7, 1.99, data);
    const fang = clanVillage('crimson_fang', 7, 2.5, data);
    const wallLimit = data.hall.levels[2].limits.bramble_hedge.count;
    expect(count(iron, 'hedge')).toBeGreaterThan(wallLimit * 0.9);
    expect(count(fang, 'trap')).toBe(data.hall.levels[2].limits.thorn_snare.count + data.hall.levels[2].limits.sap_puddle.count);
    expect(count(bamboo, 'hedge')).toBeLessThan(data.hall.levels[1].limits.bramble_hedge.count * 0.5);
    // Thunder Lotus puts its area-damage mortars in the core, inside its other towers.
    const lotus = clanVillage('thunder_lotus', 9, 4.5, data);
    const c = data.economy.mapSize / 2;
    const dist = (b: { x: number; y: number; type: string }) => Math.max(Math.abs(b.x + data.buildings[b.type].size / 2 - c), Math.abs(b.y + data.buildings[b.type].size / 2 - c));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const mortars = lotus.buildings.filter((b) => b.type === 'pinecone_catapult');
    const towers = lotus.buildings.filter((b) => data.buildings[b.type].category === 'defense' && b.type !== 'pinecone_catapult');
    expect(mortars.length).toBeGreaterThan(0);
    expect(mean(mortars.map(dist))).toBeLessThan(mean(towers.map(dist)));
  });

  it('accepts villages near the designed difficulty (estimate, then regenerate)', () => {
    let near = 0;
    let total = 0;
    for (const clan of data.clans.clans) {
      for (let v = 0; v < 10; v++) {
        const s = clan.halls[0] - 1 + 0.4;
        const base = clanVillage(clan.id, 500 + v, s, data);
        const { hall, bias } = hallAndBias(s, data, clan.levelBias);
        const d = estimateDifficulty(base, expectedDefense(hall, bias, clan, data), data);
        total++;
        if (Math.abs(d.ratio - 1) <= data.clans.generator.difficultyTolerance) near++;
        expect(d.ratio).toBeGreaterThan(0.5);
        expect(d.ratio).toBeLessThan(1.6);
      }
    }
    expect(near / total).toBeGreaterThan(0.85);
  });

  it('stronger clans and higher strengths mean tougher villages', () => {
    const avg = (clan: string, s: number) => Array.from({ length: 6 }, (_, i) => defensePower(clanVillage(clan, 300 + i, s, data), data)).reduce((a, b) => a + b, 0) / 6;
    expect(avg('thunder_lotus', 4.8)).toBeGreaterThan(avg('thunder_lotus', 3.2));
    expect(avg('shadow_emperor', 5.5)).toBeGreaterThan(avg('bamboo', 1.5) * 3);
  });
});

describe('layout validation', () => {
  const base = (): BaseLayout => ({ name: 't', hallLevel: 3, buildings: [{ id: 'h', type: 'elder_toadstool', level: 3, x: 18, y: 18 }] });

  it('rejects overlaps, too many buildings and a second Keep', () => {
    const b = base();
    b.buildings.push({ id: 'a', type: 'acorn_cannon', level: 1, x: 19, y: 19 });
    expect(validateLayout(b, data).problems.some((p) => p.includes('overlaps'))).toBe(true);
    const c = base();
    for (let i = 0; i < 4; i++) c.buildings.push({ id: `p${i}`, type: 'pinecone_catapult', level: 1, x: 2 + i * 4, y: 2 });
    expect(validateLayout(c, data).problems).toContain('too many pinecone_catapult');
    const d = base();
    d.buildings.push({ id: 'h2', type: 'elder_toadstool', level: 3, x: 2, y: 2 });
    expect(validateLayout(d, data).problems).toContain('needs exactly one Keep');
  });

  it('rejects a building boxed in by solid buildings', () => {
    const b: BaseLayout = { name: 't', hallLevel: 6, buildings: [{ id: 'h', type: 'elder_toadstool', level: 6, x: 18, y: 18 }] };
    // Ring the Keep with 3x3 storages and collectors, wall to wall.
    const ring: [number, number][] = [[15, 15], [18, 15], [21, 15], [21, 18], [21, 21], [18, 21], [15, 21], [15, 18]];
    const types = ['acorn_orchard', 'acorn_orchard', 'acorn_orchard', 'acorn_orchard', 'dewdrop_well', 'dewdrop_well', 'dewdrop_well', 'dewdrop_well'];
    ring.forEach(([x, y], i) => b.buildings.push({ id: `r${i}`, type: types[i], level: 1, x, y }));
    // The Keep is 4x4 at 18..21 and the ring leaves no gap: it must be unreachable.
    const check = validateLayout(b, data);
    expect(check.problems.some((p) => p.startsWith('h cannot be reached') || p.includes('overlaps'))).toBe(true);
  });
});

describe('clan raiding armies', () => {
  it('fight in the clan style with the housing of a generic raider, using only warriors the Keep can field', () => {
    for (const hall of [1, 3, 6]) {
      const generic = armyHousing(botArmy(hall, 1, data), data);
      const iron = clanArmy('iron_serpent', hall, 1, data);
      expect(armyHousing(iron, data)).toBeGreaterThan(generic * 0.9);
      expect(armyHousing(iron, data)).toBeLessThanOrEqual(generic);
      const dojo = data.hall.levels[hall - 1].limits.burrow_barracks.maxLevel;
      for (const t of Object.keys(iron)) expect(data.troops[t].barracksLevel).toBeLessThanOrEqual(dojo);
    }
    expect(clanArmy('iron_serpent', 6, 1, data).beetle_brute).toBeGreaterThan(0);
  });
});

describe('the first raid', () => {
  it('three Shinobi beat the Bamboo Outpost from any side (the side away from the tower is easier)', () => {
    const base = firstRaidBase(data);
    expect(validateLayout(base, data).ok).toBe(true);
    expect(base.practice).toMatch(/AI/);
    for (let seed = 1; seed <= 12; seed++) {
      const army = { hedgehog_roller: 3 };
      const setup = { seed, base, army, levels: {} };
      const probe = createBattle(setup, data);
      const deps = botDeployments(probe.deployable, probe.grid.size, army, createRng(seed * 101), data);
      const { result } = runBattle(setup, deps, data);
      expect(result.stars, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});
