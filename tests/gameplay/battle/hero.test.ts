/**
 * The first playable hero (report section 5 step 8, growth 5; SIM_RULES 5): the Shadow Captain joins
 * attacks from Keep 7, deploys once, and his Rally raises nearby warriors' damage after his first hit.
 * A battle without a hero plays out exactly as under rules 4 (the archived engine).
 */
import { describe, expect, it } from 'vitest';
import { createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../../src/gameplay/sim/heroes';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { createRng } from '../../../src/gameplay/sim/rng';
import { engine as v4 } from '../../../server/rules/v4/engine';
import { checkArmy } from '../../../server/core/pvp';
import type { Player } from '../../../server/repo';

function raid(keep: number, seed: number, withHero: boolean): { setup: BattleSetup; deployments: Deployment[] } {
  const base = generateOpponent(keep * 7919 + seed, keep, data);
  const army = botArmy(keep, 1, data);
  const hero = withHero ? heroAtKeep(keep, data) : null;
  const setup: BattleSetup = { seed, base, army, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(seed), data, {}, probe.entry);
  // The hero goes in first, where the first warriors go.
  if (hero) deployments.unshift({ ...deployments[0], troop: hero.id });
  return { setup, deployments };
}

describe('the Shadow Captain', () => {
  it('joins from Keep 7, his level following the Keep', () => {
    expect(heroAtKeep(6, data)).toBeNull();
    expect(heroAtKeep(7, data)).toEqual({ id: 'shadow_captain', level: 1 });
    expect(heroAtKeep(15, data)).toEqual({ id: 'shadow_captain', level: 9 });
  });

  it('deploys once, costs no housing and is never spent from the army', () => {
    const r = raid(8, 41, true);
    const twice = [...r.deployments.slice(0, 1), ...r.deployments];
    const { sim } = runBattle(r.setup, twice, data);
    expect(sim.troops.filter((t) => t.type === 'shadow_captain')).toHaveLength(1);
    expect(sim.remaining.shadow_captain).toBe(0);
  });

  it('a battle without a hero plays exactly as under rules 4', () => {
    for (const seed of [3, 17]) {
      const r = raid(9, seed, false);
      expect(runBattle(r.setup, r.deployments, data).result).toEqual(v4().runBattle(r.setup, r.deployments, v4().data).result);
    }
  });

  it('helps without deciding battles: at Keeps 7, 10 and 13 the hero adds a modest amount of destruction', () => {
    const gains: number[] = [];
    for (const keep of [7, 10, 13]) {
      const plain = raid(keep, 5, false);
      const a = runBattle(plain.setup, plain.deployments, data).result.destruction;
      const r = raid(keep, 5, true);
      gains.push(runBattle(r.setup, r.deployments, data).result.destruction - a);
    }
    const avg = gains.reduce((x, y) => x + y, 0) / gains.length;
    expect(avg, `gains ${gains.join(', ')}`).toBeGreaterThanOrEqual(0);
    expect(avg, `gains ${gains.join(', ')}`).toBeLessThan(20);
  }, 60_000);
});

describe('the Rally aura (balance audit RM-3)', () => {
  // RM-3 measured Rally 30% vs 0% as no change in destruction. It is not a no-op: warriors within 4 tiles of a
  // rallying hero deal 30% more (re-armed on each new target). It is small because few warriors stand that close
  // to one hero; how big it should be is a design number (battle.json heroes.shadow_captain.kit), not a bug.
  it('adds building damage over the same battles (Rally at 0% deals less)', () => {
    const off = structuredClone(data);
    (off.battle.heroes as Record<string, { kit: { strength: number } }>).shadow_captain.kit.strength = 0;
    const dealt = (d: typeof data) => {
      let sum = 0;
      for (const keep of [7, 11, 15]) for (const seed of [1, 3]) {
        const r = raid(keep, seed, true);
        sum += runBattle(r.setup, r.deployments, d).sim.buildings.reduce((a, b) => a + (b.maxHp - Math.max(0, b.hp)), 0);
      }
      return sum;
    };
    expect(dealt(data)).toBeGreaterThan(dealt(off));
  }, 60_000);
});

describe('the server checks the hero (report section 5 step 8)', () => {
  const at = (hallLevel: number) => ({ hallLevel }) as Player;
  const sub = (hero: unknown) => ({ ticket: 't', seed: 1, deployments: [], army: { saboteur: 1 }, hero }) as never;
  it('takes the hero the Keep brings (one Keep of slack for a base upload that trails), refuses anything else', () => {
    expect(checkArmy(sub({ id: 'shadow_captain', level: 1 }), at(7), data).hero).toEqual({ id: 'shadow_captain', level: 1 });
    expect(checkArmy(sub({ id: 'shadow_captain', level: 2 }), at(7), data).hero).toEqual({ id: 'shadow_captain', level: 2 });
    expect(() => checkArmy(sub({ id: 'shadow_captain', level: 3 }), at(7), data)).toThrow('bad hero');
    expect(() => checkArmy(sub({ id: 'shadow_captain', level: 1 }), at(5), data)).toThrow('bad hero');
    expect(() => checkArmy(sub({ id: 'iron_matriarch', level: 1 }), at(12), data)).toThrow('bad hero');
    expect(checkArmy(sub(undefined), at(12), data).hero).toBeUndefined();
  });
});
