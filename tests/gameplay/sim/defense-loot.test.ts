/**
 * Defense audit 2026-11-16 (docs/audit/understand-2026-11-16/defense-raids.md, DEF-01): a simulated raider carries
 * home only a share of what it broke open, by the stars it won, and every star the village denied pays part of the
 * hold reward. Before, a village that held a raid lost exactly what a village that lost it did.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { raidVillage } from '../../../src/gameplay/sim/defense';
import { capacity } from '../../../src/gameplay/sim/resources';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';
import { createNewVillage } from '../../../src/gameplay/sim/village';

const NOW = Date.UTC(2026, 5, 1, 12);
const HOUR = 3_600_000;
const KEEP = 9;

/** The rules before the change: the raider carries everything, and only a raid held to no star pays (5%). */
const before: GameData = (() => {
  const d = structuredClone(data);
  delete d.raids.carryByStars;
  d.raids.defenseWin = { shareOfRaidLoot: 0.05 };
  return d;
})();

type Build = 'cap' | 'floor' | 'level1';

/**
 * A Keep 9 village on a generated layout: every building at the top of the Keep's range (`cap`), at the bottom
 * (`floor`), or with level 1 defenses and no walls (`level1`).
 */
function village(seed: number, build: Build, fill: number): VillageState {
  const strong = build !== 'level1';
  const gen = generateOpponent(seed, KEEP, data, { levelBias: build === 'cap' ? 1 : 0 });
  const s = createNewVillage(NOW, data);
  let id = 1;
  s.buildings = [];
  for (const b of gen.buildings) {
    const def = data.buildings[b.type];
    const guards = def.category === 'defense' || def.category === 'trap' || def.category === 'hedge' || def.category === 'support';
    if (!strong && def.category === 'hedge') continue;
    s.buildings.push({ id: `b${id++}`, type: b.type, level: !strong && guards ? 1 : b.level, x: b.x, y: b.y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: NOW - 6 * HOUR } : null });
  }
  s.nextId = id;
  const cap = capacity(s, data);
  s.resources.acorns = Math.floor(cap.acorns * fill);
  s.resources.dew = Math.floor(cap.dew * fill);
  s.shieldUntil = 0;
  s.stats.defensesFaced = 99;
  s.trophies = 0;
  s.seed = seed;
  return s;
}

const total = (c: Partial<Record<string, number>>): number => Object.values(c).reduce<number>((a, v) => a + (v ?? 0), 0);

/** The same raid under the old and the new rules (the battle itself is the same fight: same seed, same base). */
function both(seed: number, build: Build, fill = 0.3) {
  const a = village(seed, build, fill);
  const b = village(seed, build, fill);
  const old = raidVillage(a, NOW, createRng(900 + seed), before).record;
  const now = raidVillage(b, NOW, createRng(900 + seed), data).record;
  return { old, now, village: b };
}

describe('DEF-01: a raid that wins fewer stars carries less home', () => {
  it('the data holds a carry share for 0 to 3 stars, rising to everything at three', () => {
    const c = data.raids.carryByStars!;
    expect(c).toHaveLength(4);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    expect(c[0]).toBeGreaterThan(0);
    expect(c[3]).toBe(1);
    expect(data.raids.defenseWin?.perStar).toBe(true);
  });

  it('the fight is unchanged; what leaves the village is at most the carry share of what the old rule took', () => {
    const seen = new Set<number>();
    for (const [seed, build] of [[4011, 'cap'], [4046, 'floor'], [4025, 'floor'], [4018, 'floor'], [4032, 'level1']] as const) {
      const { old, now, village: v } = both(seed, build);
      expect(now.result.hash).toBe(old.result.hash);
      const stars = now.result.stars;
      seen.add(stars);
      const share = data.raids.carryByStars![stars];
      for (const k of ['acorns', 'dew'] as const) {
        // Whole units, never more than the share of what was broken open, never more than before.
        expect(Number.isInteger(v.resources[k])).toBe(true);
        expect(now.result.loot[k] ?? 0).toBeLessThanOrEqual(Math.floor((old.result.loot[k] ?? 0) * share) + 0.5);
      }
      if (stars === 3) expect(total(now.result.loot)).toBe(total(old.result.loot));
    }
    // The sample covers every outcome, from a raid held to no star to one that took all three.
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('a village with level 1 defenses loses exactly what it lost before (three stars carry everything)', () => {
    const { old, now } = both(4032, 'level1');
    expect(now.result.stars).toBe(3);
    expect(now.result.loot).toEqual(old.result.loot);
    expect(now.banked).toBeUndefined();
  });

  it('every star denied pays a third of the hold reward, as far as storage has room', () => {
    const full = Math.floor(data.battle.generatedLootByHall[KEEP - 1].min * data.raids.defenseWin!.shareOfRaidLoot);
    const seen = new Set<number>();
    for (const [seed, build] of [[4011, 'cap'], [4046, 'floor'], [4025, 'floor'], [4018, 'floor']] as const) {
      const { now } = both(seed, build, 0);
      const stars = now.result.stars;
      const due = Math.floor(data.battle.generatedLootByHall[KEEP - 1].min * data.raids.defenseWin!.shareOfRaidLoot * ((3 - stars) / 3));
      if (stars === 3) expect(now.banked).toBeUndefined();
      else {
        expect(now.banked?.acorns).toBe(due);
        expect(now.banked?.dew).toBe(due);
        expect(due).toBeLessThanOrEqual(full);
      }
      seen.add(stars);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('a full storage takes no reward: the reward never goes over the cap', () => {
    const { now, village: v } = both(4011, 'cap', 1);
    const cap = capacity(v, data);
    for (const k of ['acorns', 'dew'] as const) expect(v.resources[k]).toBeLessThanOrEqual(cap[k]);
    // What was banked is what fitted after the raid's loss, never more than was lost plus nothing.
    for (const k of ['acorns', 'dew'] as const) expect(now.banked?.[k] ?? 0).toBeLessThanOrEqual(now.result.loot[k] ?? 0);
  });

  it('holding is now worth loot: a strong village keeps more of its stores than under the old rule', () => {
    let oldLoss = 0;
    let newLoss = 0;
    let newReward = 0;
    for (const seed of [4011, 4018, 4025, 4039]) {
      const { old, now } = both(seed, 'cap');
      oldLoss += total(old.result.loot) - total(old.banked ?? {});
      newLoss += total(now.result.loot);
      newReward += total(now.banked ?? {});
    }
    expect(newLoss - newReward).toBeLessThan(oldLoss * 0.5);
  });
});
