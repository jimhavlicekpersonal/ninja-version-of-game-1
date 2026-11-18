/** Phase 4 of the 2026-11-16 replayability pass (SIM_RULES 8): one test per combat hook. */
import { describe, expect, it } from 'vitest';
import { createBattle, deploymentsByTick, result, step } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { GameData } from '../../../src/gameplay/sim/types';

function fight(data: GameData, army: Record<string, number>, keep = 4, seed = 11) {
  const base = generateOpponent(4100 + seed, keep, data, { levelBias: 0.5 });
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, 3]));
  const sim = createBattle({ seed, base, army, levels, infiltration: true }, data);
  const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(seed), data, levels, sim.entry));
  while (!sim.ended) step(sim, plan.get(sim.tick));
  return { r: result(sim) };
}

describe('P4-01 (CMB-01): support warriors in position strike', () => {
  it('absent or 0 plays exactly as before; the shipped share makes a support-heavy army do more', () => {
    const army = { herbalist: 12, drum_monk: 12, hedgehog_roller: 12 };
    const off = structuredClone(defaultData);
    delete off.battle.warriorRules.supportStrike;
    const zero = structuredClone(defaultData);
    zero.battle.warriorRules.supportStrike = 0;
    expect(fight(off, army).r.hash).toBe(fight(zero, army).r.hash);
    expect(defaultData.battle.warriorRules.supportStrike).toBe(1);
    let on = 0;
    let without = 0;
    for (let seed = 11; seed <= 18; seed++) {
      on += fight(defaultData, army, 4, seed).r.destruction;
      without += fight(off, army, 4, seed).r.destruction;
    }
    expect(on).toBeGreaterThan(without);
  });
});
