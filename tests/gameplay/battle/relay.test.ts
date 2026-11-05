/**
 * Relay assaults (SIM_RULES 3, roadmap step 64): a strike can start from the
 * damage an earlier strike on the same base left (`BattleSetup.startDamage`,
 * read back with `battleDamage`). Without it, battles play out exactly as
 * under rules 2.
 */
import { describe, expect, it } from 'vitest';
import { battleDamage, createBattle, replayable, runBattle, SIM_RULES, SIM_RULES_COMPATIBLE } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { createRng } from '../../../src/gameplay/sim/rng';

function strike(keep: number, seed: number, share = 1): { setup: BattleSetup; deployments: Deployment[] } {
  const base = generateOpponent(keep * 7919 + 3, keep, data);
  for (const b of base.buildings) b.loot = {};
  const full = botArmy(keep, 1, data);
  const army = Object.fromEntries(Object.entries(full).map(([t, n]) => [t, Math.max(1, Math.floor(n * share))]));
  const setup: BattleSetup = { seed, base, army, infiltration: true };
  const probe = createBattle(setup, data);
  return { setup, deployments: botDeployments(probe.deployable, probe.grid.size, army, createRng(seed), data, {}, probe.entry) };
}

describe('relay assaults (SIM_RULES 3)', () => {
  it('rules 3 keeps rules 2 battles exactly, so their replays stay watchable', () => {
    expect(SIM_RULES).toBe(3);
    expect(SIM_RULES_COMPATIBLE).toContain(2);
    expect(replayable({ rules: 2 })).toBe(true);
    expect(replayable({ rules: 3 })).toBe(true);
    expect(replayable({ rules: 1 })).toBe(false);
    const s = strike(6, 11);
    const plain = runBattle(s.setup, s.deployments, data).result;
    expect(runBattle({ ...s.setup, startDamage: {} }, s.deployments, data).result).toEqual(plain);
  });

  it('a second strike starts where the first left off', () => {
    const one = strike(6, 21, 0.4);
    const first = runBattle(one.setup, one.deployments, data);
    const damage = battleDamage(first.sim);
    expect(Object.keys(damage).length).toBeGreaterThan(0);
    // With no warriors sent, the base stays exactly as the first strike left it.
    const idle = runBattle({ ...one.setup, seed: 5, startDamage: damage }, [], data, 1);
    expect(idle.result.destruction).toBe(first.result.destruction);
    expect(idle.result.hallDestroyed).toBe(first.result.hallDestroyed);
    const start = createBattle({ ...one.setup, startDamage: damage }, data);
    for (const b of start.buildings) {
      const before = first.sim.buildings.find((x) => x.id === b.id)!;
      expect(b.destroyed).toBe(before.destroyed);
      if (!before.destroyed && before.kind !== 'trap') expect(b.hp).toBeCloseTo(before.hp, 6);
      if (b.destroyed) expect(Object.values(b.loot).every((v) => !v)).toBe(true);
    }
  });

  it('the relay adds up: never below the first strike, and above it with a second wave', () => {
    const one = strike(6, 31, 0.4);
    const first = runBattle(one.setup, one.deployments, data);
    const two = strike(6, 32, 0.6);
    const second = runBattle({ ...two.setup, startDamage: battleDamage(first.sim) }, two.deployments, data);
    expect(second.result.destruction).toBeGreaterThanOrEqual(first.result.destruction);
    const fresh = runBattle(two.setup, two.deployments, data);
    expect(second.result.destruction).toBeGreaterThanOrEqual(fresh.result.destruction);
    // Everything the first strike destroyed is still destroyed.
    for (const b of first.sim.buildings) if (b.destroyed) expect(second.sim.buildings.find((x) => x.id === b.id)!.destroyed).toBe(true);
  });
});
