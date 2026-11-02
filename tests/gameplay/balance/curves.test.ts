/**
 * Shape of the progression curves. Each test pins one of the balance fixes so
 * a later tuning pass can't quietly bring the old problem back.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data, troopLevel } from '../../../src/gameplay/sim/data';
import { scaleReward, skipCost, topUpOne } from '../../../src/gameplay/sim/economy';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { leagueChest } from '../../../src/gameplay/sim/ranks';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';

const halls = data.hall.levels.length;
const hallLv = data.buildings.elder_toadstool.levels;
const avgLoot = (h: number) => {
  const r = data.battle.generatedLootByHall[h - 1];
  return (r.min + r.max) / 2;
};
/** Max Acorn storage at a hall level (silos at their cap plus the Elder Toadstool). */
const maxStorage = (h: number) => {
  const lim = data.hall.levels[h - 1].limits.acorn_silo;
  return lim.count * data.buildings.acorn_silo.levels[lim.maxLevel - 1].storage!.acorns! + hallLv[h - 1].storage!.acorns!;
};

describe('Elder Toadstool curve (#14, #15)', () => {
  it('upgrade times grow by a steady factor, reaching about a week at hall 10', () => {
    const ratios: number[] = [];
    for (let l = 3; l < hallLv.length; l++) ratios.push(hallLv[l].buildSeconds / hallLv[l - 1].buildSeconds);
    for (const r of ratios) {
      expect(r).toBeGreaterThanOrEqual(2.2);
      expect(r).toBeLessThanOrEqual(3);
    }
    const r = Math.pow(hallLv[hallLv.length - 1].buildSeconds / hallLv[2].buildSeconds, 1 / (hallLv.length - 3));
    const hall10Days = (hallLv[hallLv.length - 1].buildSeconds * Math.pow(r, 10 - hallLv.length)) / 86400;
    expect(hall10Days).toBeGreaterThan(5);
    expect(hall10Days).toBeLessThan(9);
  });

  it('upgrade costs grow by a multiplier that never shrinks', () => {
    let last = 0;
    for (let l = 2; l < hallLv.length; l++) {
      const m = hallLv[l].cost.acorns! / hallLv[l - 1].cost.acorns!;
      expect(m).toBeGreaterThanOrEqual(last);
      expect(m).toBeGreaterThanOrEqual(3);
      last = m;
    }
  });

  it('the Elder Toadstool itself stores little; storages do the storing', () => {
    // (Halls 1-2 hold a useful share while there are hardly any storages yet.)
    for (let h = 3; h <= halls; h++) expect(hallLv[h - 1].storage!.acorns!).toBeLessThanOrEqual(0.1 * maxStorage(h));
    for (let h = 1; h < halls; h++) expect(maxStorage(h)).toBeGreaterThanOrEqual(hallLv[h].cost.acorns!);
  });
});

describe('collectors (#16)', () => {
  it('each level pays back more slowly than the one before, and within a week', () => {
    for (const type of ['acorn_orchard', 'dewdrop_well']) {
      const lv = data.buildings[type].levels;
      let last = 0;
      for (let i = 1; i < lv.length; i++) {
        const cost = Object.values(lv[i].cost)[0]!;
        const hours = cost / (lv[i].ratePerHour! - lv[i - 1].ratePerHour!);
        expect(hours, `${type} level ${lv[i].level}`).toBeGreaterThan(last);
        expect(hours).toBeLessThanOrEqual(7 * 24);
        last = hours;
      }
    }
  });
});

describe('raiding profit (#12)', () => {
  it('loot on offer per Dew spent on a full army stays in a narrow band at every hall', () => {
    const ratios: number[] = [];
    for (let h = 1; h <= halls; h++) {
      const army = botArmy(h, 1, data);
      const cap = troopLevelCapAt(h, data);
      const cost = Object.entries(army).reduce((s, [t, n]) => s + n * (troopLevel(data, t, cap).cost.dew ?? 0), 0);
      ratios.push(avgLoot(h) / cost);
    }
    for (const r of ratios) {
      expect(r).toBeGreaterThan(1.8);
      expect(r).toBeLessThan(5);
    }
    // It used to climb from 1.3x at hall 1 to 9.6x at hall 6.
    expect(ratios[halls - 1] / ratios[2]).toBeLessThan(2);
  });
});

describe('fixed rewards scale with the hall level (#19)', () => {
  it('a Grove Raid win is worth one to three raids of loot at every hall, and fits in storage', () => {
    for (let h = 1; h <= halls; h++) {
      const win = scaleReward(data.social.groveRaid.rewards.win, h, data);
      expect(win.acorns! / avgLoot(h), `hall ${h}`).toBeGreaterThanOrEqual(1);
      expect(win.acorns! / avgLoot(h), `hall ${h}`).toBeLessThanOrEqual(3);
      expect(win.acorns!).toBeLessThanOrEqual(maxStorage(h));
      expect(win.moonstones).toBe(data.social.groveRaid.rewards.win.moonstones);
    }
  });

  it('league chests grow with the hall level', () => {
    for (const league of data.ranks.leagues) {
      for (let h = 2; h <= halls; h++) expect(leagueChest(league, h, data).acorns!).toBeGreaterThan(leagueChest(league, h - 1, data).acorns!);
    }
  });
});

describe('buying progress (#20)', () => {
  /** Moonstones to buy the next Elder Toadstool's Acorns and skip its timer. */
  const rush = (h: number) => topUpOne(hallLv[h].cost.acorns!, data) + skipCost(hallLv[h].buildSeconds, data);

  it('costs more at every hall, and the starting Moonstones cannot buy a mid-game hall', () => {
    for (let h = 2; h < halls; h++) expect(rush(h)).toBeGreaterThan(rush(h - 1));
    const start = data.economy.startingResources.moonstones;
    expect(rush(4)).toBeGreaterThan(start);
    expect(rush(5)).toBeGreaterThanOrEqual(3 * start);
  });
});

describe('troop roster (#7)', () => {
  it('no troop is at least as good as another on every count', () => {
    const stats = Object.entries(data.troops).map(([id, t]) => {
      const l1 = t.levels[0];
      return {
        id,
        value: t.housing / (l1.cost.dew ?? 1), // housing per Dew
        hp: l1.hp / t.housing,
        dps: (l1.damage * data.battle.ticksPerSecond) / t.attackIntervalTicks / t.housing,
        range: t.range,
        speed: t.speed,
        air: t.air ? 1 : 0,
        hedges: t.ignoresHedges ? 1 : 0,
        defense: t.prefers === 'defense' ? 1 : 0,
      };
    });
    const keys = ['value', 'hp', 'dps', 'range', 'speed', 'air', 'hedges', 'defense'] as const;
    for (const a of stats) {
      for (const b of stats) {
        if (a === b) continue;
        const dominates = keys.every((k) => a[k] >= b[k]);
        expect(dominates, `${a.id} dominates ${b.id}`).toBe(false);
      }
    }
  });
});
