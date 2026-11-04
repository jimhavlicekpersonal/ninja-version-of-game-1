/**
 * Gameplay audit fixes for pacing and long-term goals:
 * F25 Dojo training speed, F26 research lanes, F28 batch training, presets and
 * a next-army queue, F29 dismissing ready warriors, F30 tasks only from what is
 * still possible, F32 milestones through Keep 15.
 */
import { describe, expect, it } from 'vitest';
import { trainingSpeed, trainSecondsFor } from '../../../src/gameplay/sim/army';
import { achievementViews } from '../../../src/gameplay/sim/achievements';
import { currentTasks, taskEligible } from '../../../src/gameplay/sim/pass';
import { leagueFor } from '../../../src/gameplay/sim/ranks';
import { researchLanes } from '../../../src/gameplay/sim/research';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { armyHousing, housingCapacity } from '../../../src/gameplay/sim/army';
import { advance, applyCommand, lastAttackArmy, practiceArmy } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

/** A village at a Keep level with a Dojo and camps at chosen levels, rich enough to train. */
function camp(keep = 3, dojo = 2, campLevel = 1) {
  const g = newGame({ acorns: 200_000, dew: 200_000 });
  const s: VillageState = {
    ...g.state,
    buildings: [
      ...g.state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: keep } : b)),
      { id: 'dojo', type: 'burrow_barracks', level: dojo, x: 2, y: 2, upgrade: null, collector: null },
      { id: 'camp', type: 'army_camp', level: campLevel, x: 6, y: 2, upgrade: null, collector: null },
    ],
  };
  return { clock: g.clock, state: s };
}

describe('F25: the Dojo trains faster as it levels up', () => {
  it('a level 9 Dojo trains warriors faster than a level 2 Dojo', () => {
    const slow = camp(9, 2);
    const fast = camp(9, 9);
    expect(trainingSpeed(slow.state, data)).toBe(1);
    expect(trainingSpeed(fast.state, data)).toBeGreaterThan(2);
    expect(trainSecondsFor(fast.state, 'hedgehog_roller', data)).toBeLessThan(trainSecondsFor(slow.state, 'hedgehog_roller', data));
    const t = must(fast.state, { type: 'train', troop: 'hedgehog_roller' }, fast.clock.now());
    expect((t.training[0].endsAt - t.training[0].startedAt) / 1000).toBe(trainSecondsFor(fast.state, 'hedgehog_roller', data));
  });
});

describe('F26: research lanes', () => {
  it('a Keep 7 village researches two warriors at once, a Keep 3 village one', () => {
    expect(researchLanes(3, data)).toBe(1);
    expect(researchLanes(7, data)).toBe(2);
    expect(researchLanes(15, data)).toBe(3);
    const { clock, state } = camp(7, 7);
    let s = must(state, { type: 'research', troop: 'hedgehog_roller' }, clock.now());
    s = must(s, { type: 'research', troop: 'frog_lobber' }, clock.now());
    expect(s.research.active.map((a) => a.troop)).toEqual(['hedgehog_roller', 'frog_lobber']);
    expect(applyCommand(s, { type: 'research', troop: 'saboteur' }, clock.now(), data).ok).toBe(false);
    // Finish or cancel a particular lane.
    s = must(s, { type: 'cancelResearch', troop: 'frog_lobber' }, clock.now());
    expect(s.research.active.map((a) => a.troop)).toEqual(['hedgehog_roller']);
    const done = advance(s, clock.now() + 7 * 86_400_000, data).state;
    expect(done.research.levels.hedgehog_roller).toBe(2);
    expect(done.stats.researchDone).toBe(1);
  });
});

describe('F28: batch training, presets and the next army', () => {
  it('one command queues many warriors, as many as fit', () => {
    const { clock, state } = camp(3, 2, 1);
    const s = must(state, { type: 'train', troop: 'hedgehog_roller', count: 500 }, clock.now());
    // Camp housing 20 plus a full next army waiting in the queue.
    expect(s.training).toHaveLength(40);
  });

  it('saved armies and "retrain last army" queue only what is missing', () => {
    const { clock, state } = camp(3, 2, 1);
    let s = must(state, { type: 'saveArmyPreset', name: 'Rush', army: { hedgehog_roller: 10, saboteur: 2 } }, clock.now());
    expect(s.armyPresets).toEqual([{ name: 'Rush', army: { hedgehog_roller: 10, saboteur: 2 } }]);
    s = { ...s, army: { hedgehog_roller: 4 } };
    s = must(s, { type: 'trainArmy', army: s.armyPresets[0].army }, clock.now());
    expect(s.training.filter((q) => q.troop === 'hedgehog_roller')).toHaveLength(6);
    expect(s.training.filter((q) => q.troop === 'saboteur')).toHaveLength(2);
    // Nothing missing: nothing to queue.
    expect(applyCommand(s, { type: 'trainArmy', army: s.armyPresets[0].army }, clock.now(), data).ok).toBe(false);
    s = must(s, { type: 'deleteArmyPreset', index: 0 }, clock.now());
    expect(s.armyPresets).toEqual([]);
    expect(lastAttackArmy(s)).toBeNull();
  });

  it('finished warriors wait in the queue until the camps have room, then walk in', () => {
    const { clock, state } = camp(3, 2, 1);
    let s = must(state, { type: 'train', troop: 'hedgehog_roller', count: 30 }, clock.now());
    s = advance(s, clock.now() + 3 * 3_600_000, data).state;
    expect(s.army.hedgehog_roller).toBe(20);
    expect(s.training).toHaveLength(10);
    s = must(s, { type: 'dismiss', troop: 'hedgehog_roller', count: 5 }, clock.now() + 3 * 3_600_000);
    expect(s.army.hedgehog_roller).toBe(20);
    expect(s.training).toHaveLength(5);
  });
});

describe('F25: practice armies', () => {
  it('a practice army fills the camps with your mix plus a squad of the warrior to try', () => {
    const { state } = camp(6, 6, 3);
    const s = { ...state, army: { hedgehog_roller: 10, frog_lobber: 10 } };
    const army = practiceArmy(s, 'hawk_tamer', data);
    expect(army.hawk_tamer).toBeGreaterThan(0);
    expect(army.hedgehog_roller).toBeGreaterThan(0);
    expect(armyHousing(army, data)).toBeLessThanOrEqual(housingCapacity(s, data));
    expect(armyHousing(army, data)).toBeGreaterThan(housingCapacity(s, data) * 0.8);
    // An empty village gets a full squad of the warrior.
    expect(armyHousing(practiceArmy(state, 'hedgehog_roller', data), data)).toBe(housingCapacity(state, data));
  });
});

describe('F29: dismissing ready warriors', () => {
  it('frees camp space and gives back half the training cost', () => {
    const { clock, state } = camp(3, 2, 1);
    const s0 = { ...state, army: { hedgehog_roller: 10 }, resources: { ...state.resources, dew: 0 } };
    const s = must(s0, { type: 'dismiss', troop: 'hedgehog_roller', count: 4 }, clock.now());
    expect(s.army.hedgehog_roller).toBe(6);
    const each = data.troops.hedgehog_roller.levels[0].cost.dew!;
    expect(s.resources.dew).toBe(Math.floor(each * 4 * data.economy.dismissRefundFraction));
    expect(applyCommand(s, { type: 'dismiss', troop: 'hedgehog_roller', count: 99 }, clock.now(), data).ok).toBe(false);
  });
});

describe('F30: tasks only ask for what is still possible', () => {
  it('no obstacle-clearing challenge once the obstacles are gone', () => {
    const { state } = newGame();
    const tpl = data.pass.weeklyChallenges.find((t) => t.stat === 'obstaclesCleared')!;
    expect(taskEligible(tpl, 3, state, data, 7)).toBe(false);
    const forest = newGame(undefined, { obstacles: true }).state;
    expect(taskEligible(tpl, 3, forest, data, 7)).toBe(true);
    // Over many weeks, a village with no obstacles never draws it.
    for (let week = 0; week < 40; week++) {
      const s = { ...state, tasks: { ...state.tasks, week, weekIds: undefined } };
      const next = advance(s, state.lastSeenAt, data).state;
      expect(currentTasks(next, 1, data).map((t) => t.id)).not.toContain(tpl.id);
    }
  });

  it('a maxed village is not asked to finish upgrades', () => {
    const { state } = newGame();
    const maxed: VillageState = { ...state, buildings: state.buildings.map((b) => ({ ...b, level: data.hall.levels[0].limits[b.type]?.maxLevel ?? b.level })) };
    const tpl = data.pass.dailyTasks.find((t) => t.stat === 'upgradesDone')!;
    expect(taskEligible(tpl, 2, maxed, data, 1)).toBe(false);
  });

  it('the day\'s tasks are fixed when the day begins and do not change during it', () => {
    const { clock } = newGame();
    const forest = newGame(undefined, { obstacles: true }).state;
    const a = advance(forest, clock.now() + 86_400_000, data).state;
    const ids = currentTasks(a, 1, data).map((t) => t.id);
    const cleared = { ...a, buildings: a.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle') };
    expect(currentTasks(advance(cleared, clock.now() + 86_400_000 + 1000, data).state, 1, data).map((t) => t.id)).toEqual(ids);
  });
});

describe('F32: milestones continue to Keep 15', () => {
  it('leagues continue up to the honor range of Keep 15 opponents', () => {
    const top = data.ranks.matchmaking.trophiesPerHall * data.hall.levels.length;
    const leagues = data.ranks.leagues;
    expect(leagues[leagues.length - 1].min).toBeGreaterThan(top * 0.9);
    // No gap of more than three Keeps of honor between leagues.
    for (let i = 1; i < leagues.length; i++) expect(leagues[i].min - leagues[i - 1].min).toBeLessThanOrEqual(data.ranks.matchmaking.trophiesPerHall * 3);
    expect(leagueFor(top, data).id).not.toBe(leagueFor(2000, data).id);
  });

  it('the Keep achievement goes to Keep 15, and research and Trials have their own tracks', () => {
    const elder = data.achievements.find((a) => a.stat === 'hallLevel')!;
    expect(elder.tiers[elder.tiers.length - 1][0]).toBe(data.hall.levels.length);
    const { state } = newGame();
    const ids = achievementViews(state, 1, data).map((v) => v.def.stat);
    expect(ids).toContain('researchDone');
    expect(ids).toContain('trialsCleared');
  });
});
