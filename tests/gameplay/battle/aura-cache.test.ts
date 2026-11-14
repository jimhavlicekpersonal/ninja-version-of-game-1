/**
 * Quality 28: auras and the taunt read only the sources of their own kind (`BattleSim.auraSources`)
 * instead of every support warrior per pair per tick. The battles must not change at all (no SIM_RULES
 * bump): these battles use every aura (heal, haste, veil, resist, splash cover, taunt and the hero's
 * Rally), tempered and untempered bases, and their full end state is pinned below. The pinned value
 * was taken with the old per-pair lookup and is unchanged with the cache; it changes only with the
 * battle rules (bump SIM_RULES and re-pin it then).
 */
import { describe, expect, it } from 'vitest';
import { createBattle, runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../../src/gameplay/sim/heroes';
import { createRng } from '../../../src/gameplay/sim/rng';
import { canonicalJson, fnv64 } from '../../../src/gameplay/sim/serverEconomy';
import { temperBase } from '../../../src/gameplay/sim/battle/temper';

const ARMIES: Record<string, number>[] = [
  { iron_monk: 4, herbalist: 6, drum_monk: 6, hedgehog_roller: 30, frog_lobber: 20 },
  { bell_warden: 4, mountain_shield: 4, mist_weaver: 6, herbalist: 4, frog_lobber: 30, beetle_brute: 6 },
  { mist_weaver: 8, drum_monk: 8, iron_monk: 6, bell_warden: 2, owl_bomber: 6, hedgehog_roller: 20 },
];

function battle(keep: number, seed: number, army: Record<string, number>, tempered: boolean): { setup: BattleSetup; deployments: Deployment[] } {
  const base = generateOpponent(keep * 7919 + seed, keep, data);
  // Invalid tempers (types that cannot be tempered) are skipped by temperBase.
  if (tempered) temperBase(base, Object.fromEntries(base.buildings.map((b) => [b.type, seed % 2 ? { watch: 10 } : { blast: 5, watch: 5 }])), data);
  const hero = heroAtKeep(keep, data);
  const setup: BattleSetup = { seed, base, army, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(seed), data, {}, probe.entry);
  if (hero) deployments.unshift({ ...deployments[0], troop: hero.id });
  return { setup, deployments };
}

describe('aura lookups by kind (quality 28)', () => {
  it('play every aura battle exactly as before', () => {
    const parts: string[] = [];
    for (const keep of [8, 12, 15]) {
      ARMIES.forEach((army, i) => {
        for (const tempered of [false, true]) {
          const b = battle(keep, 11 + i, army, tempered);
          const { result, sim } = runBattle(b.setup, b.deployments, data);
          parts.push(canonicalJson({ result, hp: sim.buildings.map((x) => x.hp), troops: sim.troops.map((t) => [t.type, t.hp, t.x, t.y, t.dead]) }));
        }
      });
    }
    expect(SIM_RULES).toBe(7);
    expect(fnv64(parts.join('|'))).toBe('017e7540026ee6ec');
  }, 120_000);
});
