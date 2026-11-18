/**
 * P5-04 (RET-05, second half): eight more task templates, each offered only when the village can finish it, and the
 * new counters they read. No collect task can be finished by a single collect.
 */
import { describe, expect, it } from 'vitest';
import { taskEligible, taskTarget } from '../../../src/gameplay/sim/pass';
import { collectorCapacity } from '../../../src/gameplay/sim/resources';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import type { TaskTemplate, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const tpl = (id: string): TaskTemplate => [...data.pass.dailyTasks, ...data.pass.weeklyChallenges].find((t) => t.id === id)!;
const raid = (stars: number, i: number, stake?: number): BattleRecord =>
  ({ id: `r${i}`, kind: 'attack', at: i, opponentName: 'x', setup: { seed: 1, base: { name: 'b', hallLevel: 5, buildings: [] }, army: {}, levels: {} }, deployments: [], result: { stars, destruction: stars * 33, loot: {}, used: {}, hash: 'h' }, trophies: 0, banked: {}, ...(stake ? { stake } : {}) }) as unknown as BattleRecord;

const typeWith = (f: (id: string) => boolean) => Object.keys(data.buildings).find(f)!;
const campType = typeWith((id) => (data.buildings[id].levels[0]?.housing ?? 0) > 0);
const withCamp = (s: VillageState): VillageState => ({ ...s, buildings: [...s.buildings, { id: 'camp_t', type: campType, level: 1, x: 0, y: 0 }] });

describe('the new templates are offered only when they can be finished (P5-04)', () => {
  const state = withCamp(newGame().state);

  it('there are at least eight new ones over new and existing counters', () => {
    for (const id of ['trial_tier', 'donate', 'daily_drill', 'stake_won', 'three_star', 'w_rematch', 'w_goal_steps', 'w_three_stars']) expect(tpl(id), id).toBeDefined();
  });

  it('donations need an Alliance; the drill needs a camp', () => {
    const t = tpl('donate');
    expect(taskEligible(t, 5, { ...state, grove: { ...state.grove, joined: false } }, data, 1)).toBe(false);
    expect(taskEligible(t, 5, { ...state, grove: { ...state.grove, joined: true } }, data, 1)).toBe(true);
    const noCamp = { ...state, buildings: state.buildings.filter((b) => !(data.buildings[b.type].levels[0]?.housing ?? 0)) };
    expect(taskEligible(tpl('daily_drill'), 1, noCamp, data, 1)).toBe(false);
    expect(taskEligible(tpl('daily_drill'), 1, state, data, 1)).toBe(true);
  });

  it('three-star and stake tasks follow the recent raids', () => {
    const weak: VillageState = { ...state, battleLog: Array.from({ length: 10 }, (_, i) => raid(1, i)) };
    const strong: VillageState = { ...state, battleLog: Array.from({ length: 10 }, (_, i) => raid(3, i)) };
    expect(taskEligible(tpl('three_star'), 1, weak, data, 1)).toBe(false);
    expect(taskEligible(tpl('three_star'), 1, strong, data, 1)).toBe(true);
    expect(taskEligible(tpl('stake_won'), 1, weak, data, 1)).toBe(false);
    expect(taskEligible(tpl('stake_won'), 1, strong, data, 1)).toBe(true);
  });

  it('a rematch task needs a raid that can still be answered; a goal-steps task needs a goal event in the week', () => {
    expect(taskEligible(tpl('w_rematch'), 1, state, data, 7)).toBe(false);
    // Every week of the loop has the Gauntlet, so a goal-steps task is always possible.
    expect(taskEligible(tpl('w_goal_steps'), 4, state, data, 7, data.events.epoch)).toBe(true);
  });
});

describe('the new counters (P5-04)', () => {
  it('a settled three-star raid counts raidsThreeStar, a reached stake counts stakesWon', () => {
    const { state } = newGame();
    const s = structuredClone(state);
    s.battleLog.push({ ...raid(3, 1, 2), ticket: 't1', settlement: 'pending' } as BattleRecord);
    const r = applyCommand(s, { type: 'settleOnlineAttack', ticket: 't1', result: raid(3, 1).result, stake: 2, trophies: 10 }, 1000, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.stats.raidsThreeStar).toBe(1);
    expect(r.state.stats.stakesWon).toBe(1);
  });
});

describe('no collect task is finished by a single collect (P5-04 done-when)', () => {
  it('whenever a collect task is offered, its target is more than the largest collector holds', () => {
    const { state } = newGame();
    let offered = 0;
    for (const id of ['collect_acorns', 'collect_dew']) {
      const t = tpl(id);
      const kind = t.stat === 'collectedAcorns' ? 'acorns' : 'dew';
      for (let level = 1; level <= 10; level++) {
        for (const copies of [1, 2, 4]) {
          const proto = { id: 'col', type: typeWith((x) => data.buildings[x].produces === kind), level, x: 0, y: 0 };
          const others = state.buildings.filter((b) => data.buildings[b.type].produces !== kind);
          const v: VillageState = { ...state, buildings: [...others, ...Array.from({ length: copies }, (_, i) => ({ ...proto, id: `${proto.id}_${i}`, level }))] };
          const target = taskTarget(t, v, data)!;
          const largest = collectorCapacity(proto, level, data);
          if (!taskEligible(t, target, v, data, 1)) continue;
          offered++;
          expect(target, `${id} level ${level} x${copies}`).toBeGreaterThan(largest);
        }
      }
    }
    // Still offered to villages with two or more collectors (a single one is always one collect away).
    expect(offered).toBeGreaterThanOrEqual(20);
  });
});
