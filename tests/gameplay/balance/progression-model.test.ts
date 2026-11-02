/**
 * The progression model (gameplay/sim/progression.ts): it must reproduce the
 * live, balanced roster, and the 50-warrior design must keep its invariants.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import {
  BUILDINGS,
  HEROES,
  MODEL,
  WARRIORS,
  buildingCurve,
  buildingMaxLevelAt,
  expectedArmyPower,
  masteryBonus,
  masteryLevelFor,
  masteryXpTotal,
  researchCost,
  researchSeconds,
  role,
  trainingCost,
  visualStage,
  warriorLevelCap,
  warriorPower,
  warriorStats,
  warriorUnlockKeep,
} from '../../../src/gameplay/sim/progression';

const TPS = data.battle.ticksPerSecond;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) / b <= tol;

describe('the model reproduces the live roster', () => {
  const live = WARRIORS.filter((w) => w.liveTroop);

  it('every live troop is in the roster', () => {
    expect(live.map((w) => w.liveTroop).sort()).toEqual(Object.keys(data.troops).sort());
  });

  it('level-1 HP and DPS of every live troop are within 3% of the power budget', () => {
    for (const w of live) {
      const t = data.troops[w.liveTroop!];
      const l1 = t.levels[0];
      const dps = l1.damage / (t.attackIntervalTicks / TPS);
      const m = warriorStats(w, 1);
      expect(near(l1.hp, m.hp, 0.03), `${w.id} hp ${l1.hp} vs ${m.hp.toFixed(1)}`).toBe(true);
      expect(near(dps, m.dps, 0.03), `${w.id} dps ${dps} vs ${m.dps.toFixed(1)}`).toBe(true);
      expect(t.housing).toBe(role(w.role).housing);
    }
  });

  it('live troops grow by the model level growth (within 4%)', () => {
    for (const w of live) {
      const lv = data.troops[w.liveTroop!].levels;
      const growth = Math.pow(lv[lv.length - 1].hp / lv[0].hp, 1 / (lv.length - 1));
      expect(near(growth, MODEL.levelGrowth, 0.04), `${w.id} grows ${growth.toFixed(3)}`).toBe(true);
    }
  });

  it('live Keep levels use the model research caps', () => {
    data.hall.levels.forEach((l, i) => expect(l.troopLevelCap).toBe(MODEL.troopLevelCapByKeep[i]));
  });

  it('live buildings follow the catalog up to Keep 6', () => {
    for (const b of BUILDINGS.filter((x) => x.live)) {
      for (let k = 1; k <= MODEL.liveKeepLevels; k++) {
        expect(buildingMaxLevelAt(b, k, data)).toBe(data.hall.levels[k - 1].limits[b.id]?.maxLevel ?? 0);
      }
    }
  });
});

describe('the 50-warrior design', () => {
  it('has at least 50 warriors: 10 roles x 5 tiers, unique, each with an ability', () => {
    expect(WARRIORS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(WARRIORS.map((w) => w.id)).size).toBe(WARRIORS.length);
    const roles = Object.keys(MODEL.roles);
    expect(roles).toHaveLength(10);
    for (const r of roles) expect(WARRIORS.filter((w) => w.role === r).map((w) => w.tier).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const w of WARRIORS) expect(w.ability.text.length).toBeGreaterThan(10);
    expect(new Set(WARRIORS.map((w) => w.ability.id)).size).toBe(WARRIORS.length);
    expect(HEROES.length).toBeGreaterThanOrEqual(4);
  });

  it('every Keep level from 1 to 15 brings at least one new warrior', () => {
    for (let k = 1; k <= MODEL.keepLevels; k++) {
      expect(WARRIORS.some((w) => warriorUnlockKeep(w) === k), `keep ${k}`).toBe(true);
    }
  });

  it('no warrior dominates its tier: same budget per housing, split by role', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const same = WARRIORS.filter((w) => w.tier === tier).map((w) => warriorPower(w, 5) / role(w.role).housing / role(w.role).efficiency);
      for (const p of same) expect(near(p, same[0], 1e-9)).toBe(true);
    }
  });

  it('higher tiers are stronger at the pinnacle, but never make lower tiers useless', () => {
    const atPinnacle = (tier: number) => {
      const w = WARRIORS.find((x) => x.tier === tier && x.role === 'blade')!;
      return warriorPower(w, warriorLevelCap(w, MODEL.keepLevels));
    };
    for (let t = 2; t <= 5; t++) expect(atPinnacle(t)).toBeGreaterThan(atPinnacle(t - 1));
    expect(atPinnacle(5) / atPinnacle(1)).toBeLessThan(2.5);
  });

  it('a newly unlocked tier starts no stronger than the tier below at its cap', () => {
    for (const w of WARRIORS.filter((x) => x.tier > 1 && !x.liveTroop)) {
      const k = warriorUnlockKeep(w);
      const below = WARRIORS.find((x) => x.role === w.role && x.tier === w.tier - 1)!;
      expect(warriorPower(w, warriorLevelCap(w, k))).toBeLessThanOrEqual(warriorPower(below, warriorLevelCap(below, k)) * 1.05);
    }
  });

  it('long curve: costs outgrow power every level, research time caps at 7 days', () => {
    for (const w of WARRIORS) {
      for (let lv = 2; lv <= MODEL.warriorMaxLevel; lv++) {
        expect(researchCost(w, lv) / warriorPower(w, lv)).toBeGreaterThan(researchCost(w, lv - 1) / warriorPower(w, lv - 1) || 0);
        expect(trainingCost(w, lv)).toBeGreaterThanOrEqual(trainingCost(w, lv - 1));
      }
    }
    expect(researchSeconds(MODEL.warriorMaxLevel)).toBe(7 * 86400);
    const days = Array.from({ length: MODEL.warriorMaxLevel }, (_, i) => researchSeconds(i + 1)).reduce((a, b) => a + b, 0) / 86400;
    expect(days).toBeGreaterThan(30); // maxing one warrior is a long project
  });

  it('art stages cover every level', () => {
    for (let lv = 1; lv <= MODEL.warriorMaxLevel; lv++) expect(visualStage(lv)).toBeGreaterThanOrEqual(1);
    expect(visualStage(1)).toBe(1);
    expect(visualStage(MODEL.warriorMaxLevel)).toBe(MODEL.visualStages.length);
  });
});

describe('EXP and mastery', () => {
  it('EXP needed grows without end while the bonus approaches its ceiling', () => {
    let last = 0;
    for (let m = 1; m < 200; m++) {
      const xp = masteryXpTotal(m);
      expect(xp).toBeGreaterThan(last);
      expect(Number.isFinite(xp)).toBe(true);
      last = xp;
      expect(masteryBonus(m)).toBeGreaterThan(masteryBonus(m - 1));
      expect(masteryBonus(m)).toBeLessThan(MODEL.mastery.maxBonus);
    }
    expect(masteryLevelFor(masteryXpTotal(12))).toBe(12);
    expect(masteryLevelFor(masteryXpTotal(12) - 1)).toBe(11);
  });
});

describe('buildings scale with the same model', () => {
  it('every catalog building reaches its pinnacle level at Keep 15 and never goes down', () => {
    for (const b of BUILDINGS) {
      let last = 0;
      for (let k = 1; k <= MODEL.keepLevels; k++) {
        const m = buildingMaxLevelAt(b, k, data);
        expect(m).toBeGreaterThanOrEqual(last);
        last = m;
      }
      expect(last).toBe(b.pinnacleMaxLevel);
    }
    expect(BUILDINGS.some((b) => b.id === 'scroll_library')).toBe(true);
  });

  it('building cost per power rises every level', () => {
    for (let lv = 2; lv <= 40; lv++) {
      const a = buildingCurve(lv - 1);
      const b = buildingCurve(lv);
      expect(b.costMult / b.powerMult).toBeGreaterThan(a.costMult / a.powerMult);
    }
  });

  it('expected army power rises with every Keep level', () => {
    for (let k = 2; k <= MODEL.keepLevels; k++) expect(expectedArmyPower(k)).toBeGreaterThan(expectedArmyPower(k - 1));
  });
});
