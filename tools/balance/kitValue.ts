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

/**
 * Mean destruction of `army` at `keep` over 5 layouts x 2 bot plans, on `bases` generated bases per layout (base 0 is
 * the original one, so `bases` 1 is the score the kit gate has always used).
 */
export function armyScore(army: Record<string, number>, keep: number, data: GameData = defaultData, bases = 1): number {
  return armyScoreStats(army, keep, data, bases).mean;
}

/** `armyScore` with the spread of its battles (sample variance), for a significance check between two scores. */
export function armyScoreStats(army: Record<string, number>, keep: number, data: GameData = defaultData, bases = 1): { mean: number; variance: number; n: number } {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = heroAtKeep(keep, data);
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let b = 0; b < bases; b++) for (const layout of LAYOUTS) {
    const base = generateOpponent(9500 + keep * 131 + b * 7919, keep, data, { levelBias: 0.5, layout });
    for (const side of [0, 1]) {
      const setup = { seed: 800 + side, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const sim = createBattle(setup, data);
      const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(31 + side), data, levels, sim.entry));
      while (!sim.ended) step(sim, plan.get(sim.tick));
      const d = result(sim).destruction;
      sum += d;
      sq += d * d;
      n++;
    }
  }
  const mean = sum / n;
  return { mean, variance: n > 1 ? (sq - n * mean * mean) / (n - 1) : 0, n };
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

/**
 * Bases per layout for a tier pair (40 battles a side). With one (10 battles) a pair's order was mostly layout luck:
 * any data change moved scores 4-10 points and flipped pairs (SIM_RULES 10 tuning, 2026-11-25).
 */
export const PAIR_BASES = 4;

/**
 * SIM_RULES 10 (GT-04, 2026-11-25): a tier pair compared fairly. Both warriors join the same army: the raid bots' mix
 * without either of them, refilled to 80% of the housing, plus 20% of the warrior. `kitValue`'s score adds the warrior
 * to the full bot mix, so a warrior that is already in that mix (the four Keep 15 bot warriors) was scored on top of
 * a dozen copies of itself: a once-per-battle jam or a splash cover saturates, and its newer tier read as weaker than
 * the tier below (Ghost Engineer 72.8 against Fuse Master 84.1; on a shared base without either, 92.3 against 79.4).
 */
export function pairScores(newer: string, older: string, keep: number, data: GameData = defaultData, bases = PAIR_BASES): { newer: number; older: number; se: number } {
  const army = (x: string): Record<string, number> => {
    const mix = botArmy(keep, 1, data);
    delete mix[newer];
    delete mix[older];
    const housing = maxHousingAtHall(keep, data);
    const mixHousing = Object.entries(mix).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
    const out: Record<string, number> = {};
    for (const [t, n] of Object.entries(mix)) out[t] = Math.floor((n * 0.8 * housing) / mixHousing);
    const used = Object.entries(out).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
    out[x] = Math.floor((housing - used) / data.troops[x].housing);
    return out;
  };
  const a = armyScoreStats(army(newer), keep, data, bases);
  const b = armyScoreStats(army(older), keep, data, bases);
  // Standard error of the difference of the two means (independent battles).
  return { newer: a.mean, older: b.mean, se: Math.sqrt(a.variance / a.n + b.variance / b.n) };
}
