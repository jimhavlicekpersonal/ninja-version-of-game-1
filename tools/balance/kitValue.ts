/**
 * P4-05 (CMB-04): each warrior's marginal value (the audit's t7 method). The bot mix at 80% of the Keep's housing plus
 * 20% of warrior X, fought on the five layouts from two sides with the bot plan and the hero, against the same army
 * with X's kit removed. Also the warrior's score, for the "no newer tier below the older one" gate.
 */
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { createBattle, deploymentsByTick, result, step } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData } from '../../src/gameplay/sim/types';

function withX(keep: number, x: string, data: GameData): Record<string, number> {
  const mix = botArmy(keep, 1, data);
  const out: Record<string, number> = {};
  for (const [t, n] of Object.entries(mix)) out[t] = Math.floor(n * 0.8);
  const used = Object.entries(out).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
  out[x] = (out[x] ?? 0) + Math.floor((maxHousingAtHall(keep, data) - used) / data.troops[x].housing);
  return out;
}

/** Mean destruction of `army` at `keep` over 5 layouts x 2 bot plans. */
export function armyScore(army: Record<string, number>, keep: number, data: GameData = defaultData): number {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = heroAtKeep(keep, data);
  let sum = 0;
  let n = 0;
  for (const layout of LAYOUTS) {
    const base = generateOpponent(9500 + keep * 131, keep, data, { levelBias: 0.5, layout });
    for (const side of [0, 1]) {
      const setup = { seed: 800 + side, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const sim = createBattle(setup, data);
      const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(31 + side), data, levels, sim.entry));
      while (!sim.ended) step(sim, plan.get(sim.tick));
      sum += result(sim).destruction;
      n++;
    }
  }
  return sum / n;
}

/** The warrior's score with 20% of the army, and its kit's value (score minus the same army with the kit removed). */
export function kitValue(x: string, keep: number, data: GameData = defaultData): { score: number; kit: number | null } {
  const army = withX(keep, x, data);
  const score = armyScore(army, keep, data);
  const def = data.troops[x];
  if (!def.kit || !Object.keys(def.kit).length) return { score, kit: null };
  const off = structuredClone(data);
  delete off.troops[x].kit;
  if (['sabotage', 'charge', 'chain_lightning'].includes(off.troops[x].ability ?? '')) off.troops[x].ability = 'none';
  return { score, kit: score - armyScore(army, keep, off) };
}
