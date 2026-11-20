/**
 * P6-04 (defense opportunity 1): "Test my defenses" is a pure look at the simulated raider against the village as it
 * is now: the village does not change, the record replays exactly, and the same seed gives the same raid.
 */
import { describe, expect, it } from 'vitest';
import { runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { testDefense } from '../../../src/gameplay/sim/defenseTest';
import { data, newGame } from './helpers';

describe('test my defenses (P6-04)', () => {
  it('changes nothing in the village, replays exactly, and is labelled simulated', () => {
    const { state, clock } = newGame({ acorns: 2000, dew: 2000 });
    const before = JSON.stringify(state);
    const r = testDefense(state, clock.now(), 1234, data);
    expect(JSON.stringify(state)).toBe(before);
    expect(r.kind).toBe('defense');
    expect(r.simulated).toBe(true);
    expect(r.rules).toBe(SIM_RULES);
    expect(runBattle(structuredClone(r.setup), r.deployments, data).result.hash).toBe(r.result.hash);
    expect(testDefense(state, clock.now(), 1234, data).result.hash).toBe(r.result.hash);
    expect(r.deployments.length).toBeGreaterThan(0);
  });
});
