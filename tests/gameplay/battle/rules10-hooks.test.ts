/**
 * P4-10 step 1 (BNL-10): the Rules 8/10 hooks that stay in the simulator, none set in shipped data. One test each:
 * a neutral value plays exactly as absent, and a real value changes the battle. (raids.carryByStars, defenseWin
 * perStar, raiderMatch and economy.garrisonCrew went live or got tests in Phase 2; kit.breachRadius was removed.)
 */
import { describe, expect, it } from 'vitest';
import { createBattle, deploymentsByTick, result, step } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { temperBase } from '../../../src/gameplay/sim/battle/temper';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { GameData } from '../../../src/gameplay/sim/types';

function hash(data: GameData, keep = 8, tempered = false): string {
  const base = generateOpponent(77, keep, data, { levelBias: 0.5 });
  // A blended temper (convexity acts on the share of each axis; the shipped clans put all points in one axis).
  if (tempered) temperBase(base, { acorn_cannon: { reach: 5, blast: 5 }, wasp_nest: { reach: 5, watch: 5 } }, data);
  const army = { hedgehog_roller: 40, frog_lobber: 40, beetle_brute: 8 };
  const levels = { hedgehog_roller: 6, frog_lobber: 6, beetle_brute: 5 };
  const sim = createBattle({ seed: 5, base, army, levels, infiltration: true }, data);
  const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(5), data, levels, sim.entry));
  while (!sim.ended) step(sim, plan.get(sim.tick));
  return result(sim).hash;
}
const variant = (f: (d: GameData) => void) => {
  const d = structuredClone(defaultData);
  f(d);
  return d;
};

describe('Rules 10 hooks (not live)', () => {
  const plain = hash(defaultData);
  it('shipped data sets none of them', () => {
    expect(defaultData.battle.wallHp).toBeUndefined();
    expect(defaultData.battle.crowding).toBeUndefined();
    expect(defaultData.battle.damageSpread).toBeUndefined();
    expect(defaultData.battle.temper?.convexity).toBeUndefined();
    expect(defaultData.raids.attackCarryByStars).toBeUndefined();
  });
  it('battle.wallHp: 1 plays as absent; 3 changes the battle', () => {
    expect(hash(variant((d) => { d.battle.wallHp = 1; }))).toBe(plain);
    expect(hash(variant((d) => { d.battle.wallHp = 3; }))).not.toBe(plain);
  });
  it('battle.crowding: a slow of 0 plays as absent; a real slow changes the battle', () => {
    expect(hash(variant((d) => { d.battle.crowding = { radius: 4, slow: 0, max: 0 }; }))).toBe(plain);
    expect(hash(variant((d) => { d.battle.crowding = { radius: 4, slow: 0.2, max: 0.6 }; }))).not.toBe(plain);
  });
  it('battle.damageSpread: 0 plays as absent; 0.3 changes the battle', () => {
    expect(hash(variant((d) => { d.battle.damageSpread = 0; }))).toBe(plain);
    expect(hash(variant((d) => { d.battle.damageSpread = 0.3; }))).not.toBe(plain);
  });
  it('battle.temper.convexity (with a versus bonus, also not live): 1 plays as absent; 2 makes a blended tower\'s bonus convex', () => {
    const tempered = hash(defaultData, 12, true);
    expect(hash(variant((d) => { d.battle.temper!.convexity = 1; }), 12, true)).toBe(tempered);
    const versusOf = (convexity: number | undefined) => {
      const d = variant((x) => {
        x.battle.temper!.types.acorn_cannon.reach = { ...x.battle.temper!.types.acorn_cannon.reach, versus: { cls: 'ranged', bonus: 0.4 } };
        if (convexity !== undefined) x.battle.temper!.convexity = convexity;
      });
      const base = generateOpponent(77, 12, d, { levelBias: 0.5 });
      temperBase(base, { acorn_cannon: { reach: 5, blast: 5 } }, d);
      const sim = createBattle({ seed: 5, base, army: { hedgehog_roller: 1 }, infiltration: true }, d);
      return (sim.buildings.find((b) => b.type === 'acorn_cannon') as { versus?: Record<string, number> }).versus?.ranged;
    };
    expect(versusOf(undefined)).toBeCloseTo(0.2, 9);
    expect(versusOf(1)).toBeCloseTo(0.2, 9);
    expect(versusOf(2)).toBeCloseTo(0.1, 9);
  });
});
