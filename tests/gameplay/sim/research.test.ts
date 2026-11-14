/** Troop research (#13), its cost on training (#12), and task counters that only count finished work (#10). */
import { describe, expect, it } from 'vitest';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { troopLevel } from '../../../src/gameplay/sim/data';
import { troopLevelCapAt, troopLevelOf, troopLevels } from '../../../src/gameplay/sim/research';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, researchSkipQuote } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

/** Hall 2 village with a level 2 barracks and an army camp, plenty of Dew. */
function lab(hall = 2) {
  const g = newGame({ acorns: 50000, dew: 50000 });
  let s: VillageState = { ...g.state, buildings: g.state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: hall } : b)) };
  s = must(s, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(60);
  s = advance(s, g.clock.now(), data).state;
  const barracks = s.buildings.find((b) => b.type === 'burrow_barracks')!;
  s = must(s, { type: 'upgrade', id: barracks.id }, g.clock.now());
  g.clock.advanceSeconds(60);
  s = advance(s, g.clock.now(), data).state;
  // Plenty of room to hold the Dew research costs.
  s = { ...s, resources: { ...s.resources, dew: 50000 } };
  return { ...g, state: s };
}

describe('troop research', () => {
  it('costs Dew and time, needs no builder, and raises the level when done', () => {
    const { state, clock } = lab();
    const next = troopLevel(data, 'hedgehog_roller', 2);
    const s1 = must(state, { type: 'research', troop: 'hedgehog_roller' }, clock.now());
    expect(s1.resources.dew).toBe(state.resources.dew - next.research!.cost.dew!);
    expect(s1.research.active[0]?.toLevel).toBe(2);
    expect(troopLevelOf(s1, 'hedgehog_roller')).toBe(1);
    // Builders stay free.
    expect(s1.buildings.every((b) => !b.upgrade)).toBe(true);
    // One research at a time at an early Keep (one research lane).
    const busy = applyCommand(s1, { type: 'research', troop: 'frog_lobber' }, clock.now(), data);
    expect(busy.ok).toBe(false);
    clock.advanceSeconds(next.research!.seconds);
    const s2 = advance(s1, clock.now(), data).state;
    expect(troopLevelOf(s2, 'hedgehog_roller')).toBe(2);
    expect(s2.research.active).toEqual([]);
  });

  it('is capped by the Keep level and locked until the barracks unlocks the troop', () => {
    const { state, clock } = lab(2);
    expect(troopLevelCapAt(2, data)).toBe(2);
    const s1 = { ...state, research: { levels: { hedgehog_roller: 2 }, active: [] } };
    const capped = applyCommand(s1, { type: 'research', troop: 'hedgehog_roller' }, clock.now(), data);
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.code).toBe('HALL_LEVEL_TOO_LOW');
    const locked = applyCommand(state, { type: 'research', troop: 'owl_bomber' }, clock.now(), data);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe('LOCKED');
  });

  it('can be finished with Moonstones or cancelled for a partial refund', () => {
    const { state, clock } = lab();
    const s1 = must(state, { type: 'research', troop: 'hedgehog_roller' }, clock.now());
    const q = researchSkipQuote(s1, clock.now(), data)!;
    expect(q.moonstones).toBeGreaterThan(0);
    const s2 = must(s1, { type: 'skipResearch' }, clock.now());
    expect(troopLevelOf(s2, 'hedgehog_roller')).toBe(2);
    expect(s2.resources.moonstones).toBe(s1.resources.moonstones - q.moonstones);
    // Empty the Dew so the refund fits in storage.
    const s3 = must({ ...s1, resources: { ...s1.resources, dew: 0 } }, { type: 'cancelResearch' }, clock.now());
    expect(s3.research.active).toEqual([]);
    const paid = troopLevel(data, 'hedgehog_roller', 2).research!.cost.dew!;
    expect(s3.resources.dew).toBe(Math.floor(paid * data.economy.cancelRefundFraction));
  });

  it('higher levels hit harder in battle and cost more to train', () => {
    const base = { name: 'Dummy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 }] };
    const deps = Array.from({ length: 5 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const l1 = runBattle({ seed: 3, base, army: { hedgehog_roller: 5 } }, deps, data, 400);
    const l3 = runBattle({ seed: 3, base, army: { hedgehog_roller: 5 }, levels: { hedgehog_roller: 3 } }, deps, data, 400);
    expect(l3.sim.buildings[0].hp).toBeLessThan(l1.sim.buildings[0].hp);
    expect(l3.sim.troops[0].maxHp).toBe(troopLevel(data, 'hedgehog_roller', 3).hp);
    const { state, clock } = lab();
    const s = { ...state, research: { levels: { hedgehog_roller: 2 }, active: [] } };
    const t = must(s, { type: 'train', troop: 'hedgehog_roller' }, clock.now());
    expect(t.training[0].cost).toEqual(troopLevel(data, 'hedgehog_roller', 2).cost);
    expect(troopLevel(data, 'hedgehog_roller', 2).cost.dew!).toBeGreaterThan(troopLevel(data, 'hedgehog_roller', 1).cost.dew!);
  });

  it('a banked battle cannot claim troop levels or troops the player does not have', () => {
    const { state, clock } = lab();
    const s = { ...state, army: { hedgehog_roller: 5 } };
    const base = { name: 'Dummy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 }] };
    const ok = applyCommand(s, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'x', setup: { seed: 1, base, army: { hedgehog_roller: 5 }, levels: troopLevels(s, data) }, deployments: [] } }, clock.now(), data);
    expect(ok.ok).toBe(true);
    const tooHigh = applyCommand(s, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'x', setup: { seed: 1, base, army: { hedgehog_roller: 5 }, levels: { hedgehog_roller: 4 } }, deployments: [] } }, clock.now(), data);
    expect(tooHigh.ok).toBe(false);
    const tooMany = applyCommand(s, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'x', setup: { seed: 1, base, army: { hedgehog_roller: 50 } }, deployments: [] } }, clock.now(), data);
    expect(tooMany.ok).toBe(false);
  });
});

describe('task counters count finished work (#10)', () => {
  it('training then cancelling earns nothing; finished troops count', () => {
    const lab2 = lab();
    const clock = lab2.clock;
    const state = { ...lab2.state, resources: { ...lab2.state.resources, dew: 1000 } };
    let s = state;
    for (let i = 0; i < 10; i++) {
      s = must(s, { type: 'train', troop: 'hedgehog_roller' }, clock.now());
      s = must(s, { type: 'cancelTraining', index: 0 }, clock.now());
    }
    expect(s.stats.troopsTrained).toBe(state.stats.troopsTrained);
    expect(s.resources.dew).toBe(state.resources.dew);
    s = must(s, { type: 'train', troop: 'hedgehog_roller' }, clock.now());
    clock.advanceSeconds(data.troops.hedgehog_roller.trainSeconds);
    s = advance(s, clock.now(), data).state;
    expect(s.stats.troopsTrained).toBe(state.stats.troopsTrained + 1);
  });

  it('starting then cancelling an upgrade earns nothing; finished upgrades count', () => {
    const { state, clock } = lab();
    const camp = state.buildings.find((b) => b.type === 'army_camp')!;
    let s = state;
    for (let i = 0; i < 5; i++) {
      s = must(s, { type: 'upgrade', id: camp.id }, clock.now());
      // Room for the refund (balance audit CU-7: a refund that would not fit is refused).
      const rich = s.resources;
      s = must({ ...s, resources: { ...s.resources, acorns: 0, dew: 0 } }, { type: 'cancel', id: camp.id }, clock.now());
      s = { ...s, resources: rich };
    }
    expect(s.stats.upgradesDone).toBe(state.stats.upgradesDone);
    s = must(s, { type: 'upgrade', id: camp.id }, clock.now());
    clock.advanceSeconds(3600);
    s = advance(s, clock.now(), data).state;
    expect(s.stats.upgradesDone).toBe(state.stats.upgradesDone + 1);
  });

  it('the pass tasks and the achievement use the finished-upgrade counter', () => {
    const all = [...data.pass.dailyTasks, ...data.pass.weeklyChallenges];
    expect(all.some((t) => t.stat === 'upgradesStarted')).toBe(false);
    expect(all.some((t) => t.stat === 'upgradesDone')).toBe(true);
    expect(data.achievements.some((a) => a.stat === 'upgradesStarted')).toBe(false);
  });
});
