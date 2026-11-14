/**
 * Content batch 2026-11-14: the non-live buildings as catalog content (buildable only with withPreview), the Hero
 * Hall's hero choice, Warrior Mastery (audit B4) behind its feature flag, and save v23.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { createBattle, deploy, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData } from '../../../src/gameplay/sim/data';
import { heroFor } from '../../../src/gameplay/sim/heroes';
import { awardMastery, masteryBonuses } from '../../../src/gameplay/sim/mastery';
import { previewBuildingIds, withPreview } from '../../../src/gameplay/sim/plannedContent';
import { BUILDINGS, battleMasteryXp, buildingMaxLevelAt, masteryBonus } from '../../../src/gameplay/sim/progression';
import { SAVE_VERSION, migrate, serialize } from '../../../src/gameplay/sim/save';
import { applyCommand, battleLoadout, createNewVillage } from '../../../src/gameplay/sim/village';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';

const P = withPreview(defaultData);
const NOW = 1_800_000_000_000;

function village(keep: number, data: GameData, heroHall = 0): VillageState {
  const s = createNewVillage(NOW, data);
  s.buildings = s.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle');
  s.buildings[0].level = keep;
  s.resources = { ...s.resources, acorns: 1e9, dew: 1e9 };
  if (heroHall) s.buildings.push({ id: 'hh', type: 'hero_shrine', level: heroHall, x: 2, y: 2, upgrade: null, collector: null });
  return s;
}

describe('the planned buildings', () => {
  const ids = previewBuildingIds();
  it('are the sixteen designed buildings (fifteen counters and the Hero Hall), none of them live', () => {
    expect(ids).toHaveLength(16);
    for (const id of ids) {
      expect(BUILDINGS.find((b) => b.id === id)!.live).toBe(false);
      expect(defaultData.buildings[id]).toBeUndefined();
      for (const h of defaultData.hall.levels) expect(h.limits[id]).toBeUndefined();
    }
  });

  it.each(ids)('%s: levels to its catalog pinnacle, unlocked at its catalog Keep, costs and HP that never fall', (id) => {
    const entry = BUILDINGS.find((b) => b.id === id)!;
    const def = P.buildings[id];
    expect(def.levels).toHaveLength(entry.pinnacleMaxLevel);
    expect(def.category).toBe(entry.category);
    if (entry.effect) expect(def.effect?.kind).toBe(entry.effect.kind);
    for (let i = 1; i < def.levels.length; i++) {
      expect(def.levels[i].hp).toBeGreaterThanOrEqual(def.levels[i - 1].hp);
      const c = (l: number) => Object.values(def.levels[l].cost).reduce((a, v) => a + (v ?? 0), 0);
      expect(c(i)).toBeGreaterThan(c(i - 1));
    }
    P.hall.levels.forEach((h, k) => {
      const max = buildingMaxLevelAt(entry, k + 1);
      if (k + 1 < entry.unlockKeep) expect(h.limits[id]).toBeUndefined();
      else expect(h.limits[id].maxLevel).toBe(max);
    });
  });

  it('generated bases, bot raids and shops of the shipped game never include them', () => {
    for (let keep = 1; keep <= 15; keep++) {
      for (const seed of [1, 2]) {
        const base = generateOpponent(seed * 977 + keep, keep, defaultData);
        expect(base.buildings.some((b) => ids.includes(b.type))).toBe(false);
      }
    }
  });

  it('can be placed in the preview, and not in the shipped game', () => {
    const live = village(9, defaultData);
    expect(applyCommand(live, { type: 'place', buildingType: 'whirling_blade_tower', x: 2, y: 2 }, NOW, defaultData).ok).toBe(false);
    const preview = village(9, P);
    const r = applyCommand(preview, { type: 'place', buildingType: 'whirling_blade_tower', x: 2, y: 2 }, NOW, P);
    expect(r.ok).toBe(true);
  });

  it('withPreview leaves the shipped data untouched, and a live battle plays the same under both', () => {
    const before = JSON.stringify(defaultData);
    const data = withPreview(defaultData);
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(data.features).toEqual({ mastery: true, heroChoice: true });
    expect(defaultData.features).toBeUndefined();
    for (const keep of [5, 9, 14]) {
      const base = generateOpponent(4242 + keep, keep, defaultData);
      const army = { hedgehog_roller: 20, frog_lobber: 10, beetle_brute: 4, owl_bomber: 3 };
      const hero = heroFor(village(keep, defaultData), defaultData);
      const setup = { seed: keep, base, army, levels: {}, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = createBattle(setup, defaultData);
      const spot = probe.entry!.points[0];
      const deployments = Object.keys(army).flatMap((troop, i) => Array.from({ length: 3 }, (_, j) => ({ tick: i * 5 + j, troop, x: spot.x, y: spot.y })));
      if (hero) deployments.unshift({ tick: 0, troop: hero.id, x: spot.x, y: spot.y });
      expect(runBattle(setup, deployments, data).result).toEqual(runBattle(setup, deployments, defaultData).result);
    }
  });
});

describe('Hero Hall: choosing a hero', () => {
  it('is refused in the shipped game', () => {
    const s = village(13, defaultData, 3);
    const r = applyCommand(s, { type: 'chooseHero', hero: 'shadow_captain' }, NOW, defaultData);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_AVAILABLE');
    // A choice left in a save changes nothing while the feature is off.
    s.hero = { chosen: 'iron_matriarch' };
    expect(heroFor(s, defaultData)).toEqual({ id: 'shadow_captain', level: 7 });
  });

  it('needs a Hero Hall, lets the player pick an unlocked hero, and caps the hero at the Hall\'s level', () => {
    const noHall = village(12, P);
    const r0 = applyCommand(noHall, { type: 'chooseHero', hero: 'iron_matriarch' }, NOW, P);
    expect(r0.ok).toBe(false);
    expect(heroFor(noHall, P)).toEqual({ id: 'shadow_captain', level: 6 });
    const s = village(12, P, 2);
    const locked = applyCommand(s, { type: 'chooseHero', hero: 'grand_sensei' }, NOW, P);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe('LOCKED');
    const r = applyCommand(s, { type: 'chooseHero', hero: 'iron_matriarch' }, NOW, P);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.hero).toEqual({ chosen: 'iron_matriarch' });
    expect(heroFor(r.state, P)).toEqual({ id: 'iron_matriarch', level: 2 });
    expect(battleLoadout(r.state, P).hero).toEqual({ id: 'iron_matriarch', level: 2 });
    const back = applyCommand(r.state, { type: 'chooseHero', hero: null }, NOW, P);
    expect(back.ok && heroFor(back.state, P)).toEqual({ id: 'shadow_captain', level: 6 });
  });
});

describe('Warrior Mastery (audit B4)', () => {
  it('earns nothing and changes no battle in the shipped game', () => {
    const s = village(8, defaultData);
    expect(awardMastery(s, { used: { hedgehog_roller: 10 }, stars: 3 }, {}, defaultData)).toEqual({});
    expect(s.mastery).toEqual({});
    s.mastery = { hedgehog_roller: 1e6 };
    expect(masteryBonuses(s, defaultData)).toEqual({});
    expect(battleLoadout(s, defaultData).mastery).toBeUndefined();
  });

  it('with the feature on: EXP per attack by housing and stars, own warriors only, and a bonus that never passes 30%', () => {
    const s = village(8, P);
    const gained = awardMastery(s, { used: { hedgehog_roller: 10, beetle_brute: 2, shadow_captain: 1 }, stars: 2 }, { hero: { id: 'shadow_captain', level: 2 }, reinforcements: { beetle_brute: { count: 1, level: 3 } } }, P);
    expect(gained).toEqual({ hedgehog_roller: battleMasteryXp(10, 2), beetle_brute: battleMasteryXp(P.troops.beetle_brute.housing, 2) });
    s.mastery = { hedgehog_roller: 2730, frog_lobber: 1e12 };
    const bonus = masteryBonuses(s, P);
    expect(bonus.hedgehog_roller).toBeCloseTo(masteryBonus(10), 4);
    expect(bonus.frog_lobber).toBeLessThanOrEqual(0.3);
    expect(battleLoadout(s, P).mastery).toEqual(bonus);
  });

  it('mastered warriors fight with the bonus, and a setup claiming more mastery than earned is refused', () => {
    const s = village(8, P);
    s.army = { hedgehog_roller: 5 };
    s.mastery = { hedgehog_roller: 2730 };
    const loadout = battleLoadout(s, P);
    const base = generateOpponent(77, 8, P);
    const sim = createBattle({ seed: 1, base, ...loadout }, P);
    expect(deploy(sim, { tick: 0, troop: 'hedgehog_roller', x: sim.entry ? sim.entry.points[0].x : 1, y: sim.entry ? sim.entry.points[0].y : 1 })).toBe(true);
    const lv = P.troops.hedgehog_roller.levels[0];
    expect(sim.troops[0].maxHp).toBeCloseTo(lv.hp * (1 + loadout.mastery!.hedgehog_roller), 6);
    const cheat = { ...loadout, mastery: { hedgehog_roller: 0.3 } };
    const r = applyCommand(s, { type: 'battleEnd', record: { at: NOW, opponentName: 'x', setup: { seed: 1, base, ...cheat }, deployments: [] } }, NOW, P);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_BATTLE');
  });
});

describe('save v23', () => {
  it('a new village starts with empty mastery and no chosen hero', () => {
    const s = createNewVillage(NOW, defaultData);
    expect(s.mastery).toEqual({});
    expect(s.hero).toEqual({});
    expect(SAVE_VERSION).toBe(23);
  });

  it('a v22 save gains both, empty, and keeps everything else', () => {
    const s = createNewVillage(NOW, defaultData) as unknown as Record<string, unknown>;
    delete s.mastery;
    delete s.hero;
    const file = { ...serialize(s as unknown as VillageState, NOW), version: 22 };
    const out = migrate(structuredClone(file), defaultData);
    expect(out.version).toBe(23);
    expect(out.village.mastery).toEqual({});
    expect(out.village.hero).toEqual({});
    expect({ ...out.village, mastery: undefined, hero: undefined }).toEqual({ ...file.village, mastery: undefined, hero: undefined });
  });
});
