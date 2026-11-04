/**
 * Buying missing Coins and Provisions with Jade. There is no free-standing
 * exchange: a top-up buys exactly what one action is missing, priced at the
 * buyer's Keep, and the action happens in the same step. These pin the game
 * theory behind that (see docs/game-theory/TOP_UP.md).
 */
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, topUpQuote, trainingSkipQuote, type Command } from '../../../src/gameplay/sim/village';
import { skipCost, topUpOne, topUpScale, trainingSkipCost } from '../../../src/gameplay/sim/economy';
import { capacity } from '../../../src/gameplay/sim/resources';
import { data, find, must, newGame } from '../sim/helpers';

const halls = data.hall.levels.length;
const keepLv = data.buildings.elder_toadstool.levels;
const avgLoot = (k: number) => {
  const r = data.battle.generatedLootByHall[k - 1];
  return (r.min + r.max) / 2;
};
/** Jade for one average raid's loot at Keep `k`. */
const raidPrice = (k: number) => topUpOne(avgLoot(k), data, k);

describe('Keep-scaled price', () => {
  it('has a scale for every Keep, rising with the Keep, 1 at Keep 5', () => {
    const t = data.store.topUpScaleByHall;
    expect(t).toHaveLength(halls);
    expect(t[4]).toBe(1);
    for (let k = 2; k <= halls; k++) expect(t[k - 1]).toBeGreaterThan(t[k - 2]);
  });

  it('a raid of loot costs a similar share at every Keep (was a 1,700x swing)', () => {
    const prices = Array.from({ length: halls }, (_, i) => raidPrice(i + 1));
    for (let k = 2; k <= halls; k++) expect(prices[k - 1]).toBeGreaterThanOrEqual(prices[k - 2]);
    expect(prices[halls - 1] / prices[0]).toBeLessThan(50);
    // Unscaled, Keep 15 cost 1,766x Keep 1.
    expect(topUpOne(avgLoot(halls), data) / topUpOne(avgLoot(1), data)).toBeGreaterThan(1000);
  });

  it('early Keeps no longer give resources away: the starting Jade buys under 8 raids at Keep 2', () => {
    const start = data.economy.startingResources.moonstones;
    expect(start / raidPrice(2)).toBeLessThan(8);
    expect(raidPrice(2)).toBeGreaterThan(topUpOne(avgLoot(2), data));
  });

  it('late Keeps are no trap: buying a raid costs at most 100x skipping two hours of training', () => {
    for (let k = 6; k <= halls; k++) expect(raidPrice(k) / skipCost(7200, data)).toBeLessThan(100);
  });

  it('rushing the next Keep still costs more at every Keep (#20)', () => {
    const rush = (k: number) => topUpOne(keepLv[k].cost.acorns!, data, k) + skipCost(keepLv[k].buildSeconds, data);
    for (let k = 2; k < halls; k++) expect(rush(k), `Keep ${k}`).toBeGreaterThan(rush(k - 1));
    const start = data.economy.startingResources.moonstones;
    expect(rush(4)).toBeGreaterThan(start);
    expect(rush(5)).toBeGreaterThanOrEqual(3 * start);
  });

  it('the plain curve is the Keep 5 price', () => {
    expect(topUpScale(5, data)).toBe(1);
    for (const n of [100, 10_000, 1_000_000]) expect(topUpOne(n, data, 5)).toBe(topUpOne(n, data));
  });
});

describe('top-up then act', () => {
  const upgradeKeep = (s: ReturnType<typeof newGame>['state']): Command => ({ type: 'topUp', then: { type: 'upgrade', id: find(s, 'elder_toadstool')[0].id } });

  it('buys exactly the missing Coins at the Keep price and starts the upgrade in one step', () => {
    const { state, clock } = newGame({ acorns: 400 });
    const s = must(state, upgradeKeep(state), clock.now());
    expect(s.resources.acorns).toBe(0);
    expect(s.resources.moonstones).toBe(500 - topUpOne(600, data, 1));
    expect(find(s, 'elder_toadstool')[0].upgrade).toBeTruthy();
    expect(s.stats.moonstonesSpent).toBe(topUpOne(600, data, 1));
  });

  it('quotes what the command charges', () => {
    const { state, clock } = newGame({ acorns: 400 });
    const q = topUpQuote(state, { type: 'upgrade', id: find(state, 'elder_toadstool')[0].id }, clock.now(), data)!;
    expect(q.missing).toEqual({ acorns: 600 });
    const s = must(state, upgradeKeep(state), clock.now());
    expect(500 - s.resources.moonstones).toBe(q.moonstones);
  });

  it('bought resources never count as collected (achievements stay earned)', () => {
    const { state, clock } = newGame({ acorns: 400 });
    const s = must(state, upgradeKeep(state), clock.now());
    expect(s.stats.collectedAcorns).toBe(state.stats.collectedAcorns);
    expect(s.stats.collectedDew).toBe(state.stats.collectedDew);
  });

  it('offers nothing when resources are not what is missing, and takes no Jade then', () => {
    const { state, clock } = newGame({ acorns: 1000 });
    const keep = find(state, 'elder_toadstool')[0].id;
    // Already upgrading: the second upgrade can't start, so no top-up is offered or charged.
    const s = must(state, { type: 'upgrade', id: keep }, clock.now());
    expect(topUpQuote(s, { type: 'upgrade', id: keep }, clock.now(), data)).toBeNull();
    expect(applyCommand(s, upgradeKeep(s), clock.now(), data).ok).toBe(false);
  });

  it('nothing is bought when nothing is missing', () => {
    const { state, clock } = newGame({ acorns: 5000 });
    const r = applyCommand(state, upgradeKeep(state), clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOTHING_TO_SKIP');
  });

  it('cannot buy more than storage holds', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 0 });
    // A Keep 1 village cannot hold a Keep 4 cost; pretend the Keep is level 3.
    const s = { ...state, buildings: state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 3 } : b)) };
    const need = keepLv[3].cost.acorns!;
    expect(need).toBeGreaterThan(capacity(s, data).acorns);
    expect(topUpQuote(s, { type: 'upgrade', id: find(s, 'elder_toadstool')[0].id }, clock.now(), data)).toBeNull();
  });

  it('is refused without enough Jade, leaving the village as it was', () => {
    const { state, clock } = newGame({ acorns: 0, moonstones: 1 });
    const r = applyCommand(state, upgradeKeep(state), clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_ENOUGH_MOONSTONES');
  });

  it('has no free-standing exchange', () => {
    const { state, clock } = newGame({ acorns: 0 });
    const r = applyCommand(state, { type: 'topUp', then: { type: 'collect', id: 'x' } } as unknown as Command, clock.now(), data);
    expect(r.ok).toBe(false);
  });
});

describe('top-up for warriors and research', () => {
  const SHINOBI = 'hedgehog_roller';
  function armyVillage(dew: number) {
    const g = newGame({ acorns: 1500, dew: 1500, moonstones: 5000 });
    let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
    s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
    g.clock.advanceSeconds(3600);
    s = advance(s, g.clock.now(), data).state;
    s = { ...s, resources: { ...s.resources, dew } };
    return { ...g, state: s };
  }

  it('buys the Provisions for exactly the warriors who fit, and queues them', () => {
    const { state, clock } = armyVillage(0);
    const unit = data.troops[SHINOBI].levels[0].cost.dew!;
    const q = topUpQuote(state, { type: 'train', troop: SHINOBI, count: 500 }, clock.now(), data)!;
    expect(q).toBeTruthy();
    const fits = q.missing.dew! / unit;
    expect(Number.isInteger(fits)).toBe(true);
    const s = must(state, { type: 'topUp', then: { type: 'train', troop: SHINOBI, count: 500 } }, clock.now());
    expect(s.training).toHaveLength(fits);
    expect(s.resources.dew).toBe(0);
    expect(s.resources.moonstones).toBe(state.resources.moonstones - q.moonstones);
  });

  it('tops up research', () => {
    const g = armyVillage(0);
    const { clock } = g;
    // Keep 2 lets warriors reach level 2.
    const state = { ...g.state, buildings: g.state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 2 } : b)) };
    const action = { type: 'research', troop: SHINOBI } as const;
    const q = topUpQuote(state, action, clock.now(), data);
    expect(q).toBeTruthy();
    const s = must(state, { type: 'topUp', then: action }, clock.now());
    expect(s.research.active.some((a) => a.troop === SHINOBI)).toBe(true);
  });
});

describe('finishing training is priced like a top-up (skip-and-raid farming)', () => {
  /** Jade to finish a two-hour army (the refill target) at Keep `k`. */
  const finishArmy = (k: number) => trainingSkipCost(7200, k, data);

  it('never costs less than the plain time price, and the same up to Keep 5', () => {
    for (let k = 1; k <= halls; k++) expect(finishArmy(k)).toBeGreaterThanOrEqual(skipCost(7200, data));
    for (let k = 1; k <= 5; k++) expect(finishArmy(k)).toBe(skipCost(7200, data));
  });

  it('skip-and-raid is at most 10x cheaper than a top-up for the same loot at every Keep (was ~65x at Keep 15)', () => {
    for (let k = 1; k <= halls; k++) {
      const ratio = raidPrice(k) / finishArmy(k);
      expect(ratio, `Keep ${k}`).toBeLessThanOrEqual(10);
      // Time stays the cheaper thing to buy: finishing an army never costs more than buying its loot.
      expect(ratio, `Keep ${k}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('the Army panel quote and the command charge the Keep price', () => {
    const g = newGame({ acorns: 1500, dew: 100_000, moonstones: 5000 });
    let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
    s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
    g.clock.advanceSeconds(3600);
    s = advance(s, g.clock.now(), data).state;
    // Pretend a Keep 12 village: the same queue costs more Jade to finish.
    const late = { ...s, buildings: s.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 12 } : b)) };
    const t0 = g.clock.now();
    const q1 = must(s, { type: 'train', troop: 'hedgehog_roller', count: 20 }, t0);
    const q12 = must(late, { type: 'train', troop: 'hedgehog_roller', count: 20 }, t0);
    const k1 = trainingSkipQuote(q1, t0, data)!;
    const k12 = trainingSkipQuote(q12, t0, data)!;
    expect(k12.seconds).toBe(k1.seconds);
    expect(k12.moonstones).toBe(trainingSkipCost(k12.seconds, 12, data));
    expect(k12.moonstones).toBeGreaterThan(k1.moonstones);
    const done = must(q12, { type: 'skipTraining' }, t0);
    expect(q12.resources.moonstones - done.resources.moonstones).toBe(k12.moonstones);
  });
});
