/**
 * Progression pacing for more than one way to play (audit F36). The default
 * model player (progression.test.ts) only raids with the raid bots' mix; these
 * policies cover what it skipped: building the five counters, fielding the
 * newer warriors of every family, Shadow Trials, tasks and the pass. Each claim
 * below is about the policy that was actually played.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { activeHour, ModelPlayer, normalDays } from '../../../tools/balance/playerModel';

const DAYS = 21;
const COUNTERS = ['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner'];

function play(policy: 'defender' | 'explorer', engaged: boolean) {
  const p = new ModelPlayer(data, { raidsPerSession: 2, policy, engaged });
  activeHour(p, 60, 2);
  normalDays(p, DAYS);
  const reached = Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [k, +(v / 24).toFixed(1)]));
  const late = p.raidLog.filter((r) => r.hall >= 4);
  const avg = late.reduce((a, r) => a + r.destruction, 0) / Math.max(1, late.length);
  console.log(policy, engaged ? 'engaged' : '', 'reached (days)', JSON.stringify(reached), 'raids', p.raids, 'avg destruction (Keep 4+)', avg.toFixed(0), 'fielded', [...p.fielded].join(','), 'trials', p.state.trials.best, 'tasks', p.tasksClaimed);
  return { p, reached, avg };
}

describe('pacing per playing style (model player policies)', () => {
  it('a defensive planner builds the counters and still reaches Keep 6 in about two to three weeks', { timeout: 180_000 }, () => {
    const { p, reached, avg } = play('defender', false);
    expect(reached[6]).toBeDefined();
    expect(reached[6]).toBeGreaterThanOrEqual(10);
    expect(reached[6]).toBeLessThanOrEqual(21);
    const built = COUNTERS.filter((t) => p.state.buildings.some((b) => b.type === t && b.level >= 1));
    expect(built.length).toBeGreaterThanOrEqual(2);
    expect(avg).toBeGreaterThan(40);
  });

  it('an explorer fields newer warriors of every family, plays Trials and tasks, and keeps the same pace', { timeout: 180_000 }, () => {
    const { p, reached, avg } = play('explorer', true);
    expect(reached[6]).toBeDefined();
    expect(reached[6]).toBeGreaterThanOrEqual(10);
    expect(reached[6]).toBeLessThanOrEqual(21);
    // Not just the original six.
    const newer = [...p.fielded].filter((t) => !['hedgehog_roller', 'frog_lobber', 'beetle_brute', 'owl_bomber', 'mole_digger', 'saboteur'].includes(t));
    expect(newer.length).toBeGreaterThanOrEqual(4);
    expect(p.state.trials.best).toBeGreaterThanOrEqual(5);
    expect(p.tasksClaimed).toBeGreaterThan(10);
    expect(avg).toBeGreaterThan(40);
  });
});
