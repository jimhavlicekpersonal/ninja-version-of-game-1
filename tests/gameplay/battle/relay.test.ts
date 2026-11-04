/**
 * Relay assaults (roadmap step 64, SIM_RULES 3): a strike can start from the
 * damage an earlier strike left. Buildings destroyed before stay destroyed
 * and count toward stars; damaged ones keep their lost HP. Battles without
 * `startDamage` play exactly as before, so older records still replay.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, endDamage, replayable, runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { BattleSetup } from '../../../src/gameplay/sim/battle/types';

const keep = 6;
const base = generateOpponent(4242, keep, data);

function strike(seed: number, housingShare: number, startDamage?: Record<string, number>) {
  const full = botArmy(keep, 1, data);
  const army = Object.fromEntries(Object.entries(full).map(([t, n]) => [t, Math.max(1, Math.floor(n * housingShare))]));
  const setup: BattleSetup = { seed, base, army, infiltration: true, ...(startDamage ? { startDamage } : {}) };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(seed), data, {}, probe.entry);
  const out = runBattle(setup, deployments, data);
  return { setup, deployments, out };
}

describe('relay assaults', () => {
  it('a second strike starts from the first one\'s damage and is scored on the total', () => {
    const first = strike(11, 0.35);
    const carried = endDamage(first.out.sim);
    expect(Object.keys(carried).length).toBeGreaterThan(0);
    const second = strike(12, 0.35, carried);
    const fresh = strike(12, 0.35);
    // Everything the first strike destroyed is still destroyed after the second.
    const destroyedFirst = first.out.sim.buildings.filter((b) => b.destroyed).map((b) => b.id);
    const after = new Map(second.out.sim.buildings.map((b) => [b.id, b]));
    for (const id of destroyedFirst) expect(after.get(id)!.destroyed).toBe(true);
    // Damage only adds up: no building ends the relay with more HP than the first strike left it.
    for (const [id, lost] of Object.entries(carried)) expect(endDamage(second.out.sim)[id]).toBeGreaterThanOrEqual(lost);
    // The relay does at least as much as either strike alone, and more than the same strike on a fresh base.
    expect(second.out.result.destruction).toBeGreaterThanOrEqual(first.out.result.destruction);
    expect(second.out.result.destruction).toBeGreaterThan(fresh.out.result.destruction);
    // Loot from buildings destroyed earlier is not paid twice.
    const lootFirst = Object.values(first.out.result.loot).reduce((s, v) => s + (v ?? 0), 0);
    const lootRelay = Object.values(second.out.result.loot).reduce((s, v) => s + (v ?? 0), 0);
    const lootFresh = Object.values(fresh.out.result.loot).reduce((s, v) => s + (v ?? 0), 0);
    expect(lootRelay).toBeLessThanOrEqual(lootFresh + lootFirst);
  });

  it('a pre-destroyed Keep keeps its star', () => {
    const hall = base.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
    const sim = createBattle({ seed: 1, base, army: {}, infiltration: true, startDamage: { [hall.id]: 1e9 } }, data);
    expect(sim.hallDestroyed).toBe(true);
    expect(sim.destroyedCount).toBe(1);
  });

  it('battles without startDamage replay exactly as before, and rules-2 records stay watchable', () => {
    const plain = strike(31, 0.5);
    const again = runBattle({ ...plain.setup, startDamage: {} }, plain.deployments, data);
    expect(again.result.hash).toBe(plain.out.result.hash);
    expect(SIM_RULES).toBe(3);
    expect(replayable({ rules: 2 })).toBe(true);
    expect(replayable({ rules: 3 })).toBe(true);
    expect(replayable({ rules: 1 })).toBe(false);
    expect(replayable({})).toBe(false);
  });
});
