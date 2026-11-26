/**
 * Beast Mode 2026-11-21 GT-09: how hard each Shadow Trial tier is for the raid bots' capped army at the tier's Keep
 * (with that Keep's hero), deployed with the bots' plan through the fortress's Infiltration Points. Mean destruction
 * and stars over a few battle seeds per tier. A measurement of the ladder's shape, not of a player.
 */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { createRng } from '../../src/gameplay/sim/rng';
import { trialBase, trialInfo } from '../../src/gameplay/sim/trials';
import type { GameData } from '../../src/gameplay/sim/types';
import { cappedArmy } from './search';

export interface TierRow {
  tier: number;
  keep: number;
  destruction: number;
  stars: number;
  clears: number;
}

/** `variant` is the alternate fortress a player may switch a failed tier to (`canTryAlternate`); 0 is the tier's own. */
export function measureLadder(tiers: number[], seeds = 4, data: GameData = defaultData, variant = 0): TierRow[] {
  return tiers.map((tier) => {
    const keep = trialInfo(tier, data, variant).hall;
    const { army, levels } = cappedArmy(keep, data);
    const hero = heroAtKeep(keep, data);
    const base = trialBase(tier, data, variant);
    let destruction = 0;
    let stars = 0;
    let clears = 0;
    for (let s = 0; s < seeds; s++) {
      const setup = { seed: 31_000 + tier * 7 + s, base: structuredClone(base), army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = createBattle(structuredClone(setup), data);
      const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(tier * 101 + s), data, levels, probe.entry);
      const r = runBattle(setup, plan, data).result;
      destruction += r.destruction;
      stars += r.stars;
      if (r.stars >= data.trials.starsToClear) clears++;
    }
    return { tier, keep, destruction: destruction / seeds, stars: stars / seeds, clears };
  });
}
