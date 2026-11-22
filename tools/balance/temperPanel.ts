/**
 * Beast Mode GT-07 (earlier P4-06, audit "Army panel against the four temper profiles"): a panel of Keep 12 armies,
 * each scored on generated bases with no temper and with the Reach, Blast and Watch profiles (5 layouts x 2 bot plans,
 * the hero along, mean destruction). Tempering is meant to make a different army best against a different base;
 * `bestByProfile` names the winner on each profile.
 */
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { createBattle, deploymentsByTick, result, step } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import { temperBase } from '../../src/gameplay/sim/battle/temper';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData, Temper } from '../../src/gameplay/sim/types';

export const PROFILES: Record<string, Record<string, Temper> | null> = {
  plain: null,
  reach: { acorn_cannon: { reach: 10 }, wasp_nest: { reach: 10 } } as Record<string, Temper>,
  blast: { acorn_cannon: { blast: 10 }, wasp_nest: { reach: 5, watch: 5 } } as Record<string, Temper>,
  watch: { acorn_cannon: { watch: 10 }, wasp_nest: { watch: 10 } } as Record<string, Temper>,
};

function fromShares(shares: Record<string, number>, keep: number, data: GameData): Record<string, number> {
  const housing = maxHousingAtHall(keep, data);
  return Object.fromEntries(Object.entries(shares).map(([t, s]) => [t, Math.floor((housing * s) / data.troops[t].housing)]));
}

/** The audit's Keep 12 panel: the raid bots' mix, its searched best mix, and the family answers. */
export function keep12Panel(data: GameData = defaultData): Record<string, Record<string, number>> {
  return {
    botmix: botArmy(12, 1, data),
    searched: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    void: fromShares({ void_walker: 1 }, 12, data),
    kites: fromShares({ thunder_kite: 1 }, 12, data),
    reaper_shield: fromShares({ chain_sickle_reaper: 0.5, mountain_shield: 0.5 }, 12, data),
    tanks_heal: fromShares({ mountain_shield: 0.5, spirit_caller: 0.25, herbalist: 0.25 }, 12, data),
    siege_blades: fromShares({ bomb_carrier: 0.25, fire_monk: 0.25, moonblade_master: 0.5 }, 12, data),
    beasts: fromShares({ bear_warrior: 1 }, 12, data),
  };
}

export function temperedScore(army: Record<string, number>, keep: number, tempers: Record<string, Temper> | null, data: GameData = defaultData): number {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = heroAtKeep(keep, data);
  let sum = 0;
  let n = 0;
  for (const layout of LAYOUTS) {
    const base = generateOpponent(9100 + keep * 131, keep, data, { levelBias: 0.5, layout });
    if (tempers) temperBase(base, tempers as never, data);
    for (const side of [0, 1]) {
      const setup = { seed: 600 + side, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const sim = createBattle(setup, data);
      const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(31 + side), data, levels, sim.entry));
      while (!sim.ended) step(sim, plan.get(sim.tick));
      sum += result(sim).destruction;
      n++;
    }
  }
  return sum / n;
}

/** For each profile, the panel's best army and every army's score. */
export function bestByProfile(keep = 12, data: GameData = defaultData): Record<string, { best: string; scores: Record<string, number> }> {
  const panel = keep12Panel(data);
  const out: Record<string, { best: string; scores: Record<string, number> }> = {};
  for (const [p, tempers] of Object.entries(PROFILES)) {
    const scores = Object.fromEntries(Object.entries(panel).map(([name, army]) => [name, +temperedScore(army, keep, tempers, data).toFixed(1)]));
    out[p] = { best: Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0], scores };
  }
  return out;
}
