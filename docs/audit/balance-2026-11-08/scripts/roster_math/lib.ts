// Shared helpers for the roster_math battle experiments (read-only against the sim).
import { createBattle, runBattle, deploymentsByTick, step, result } from '../../src/gameplay/sim/battle/battle';
import { LAYOUTS, generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../src/gameplay/sim/battle/types';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData } from '../../src/gameplay/sim/types';

export const LAYOUT_IDS = ['random', ...LAYOUTS.map((l) => l.id)];

export function levelsAtCaps(keep: number, army: Record<string, number>, data: GameData = defaultData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of Object.keys(army)) out[t] = Math.min(data.troops[t].levels.length, troopLevelCapAt(keep, data, t));
  return out;
}

export interface FightResult { destruction: number; stars: number; events: Record<string, number>; troopsLost: number; }

/**
 * One battle: generated base at `keep` (layout, seed, levelBias), the bot deployment plan
 * (same rng seed for every candidate), optional hero deployed at tick 0 on the first squad's point.
 */
export function fight(data: GameData, keep: number, army: Record<string, number>, levels: Record<string, number>, layout: string, seed: number, bias = 0.5, hero?: { id: string; level: number }, countEvents: string[] = []): FightResult {
  const base = generateOpponent(1000 + seed * 7919 + LAYOUT_IDS.indexOf(layout) * 131, keep, data, { levelBias: bias, ...(layout === 'random' ? {} : { layout: LAYOUTS.find((l) => l.id === layout)! }) });
  const setup: BattleSetup = { seed: 42 + seed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const plan: Deployment[] = botDeployments(probe.deployable, probe.grid.size, army, createRng(9 + seed), data, levels, probe.entry);
  if (hero && plan.length) plan.unshift({ tick: 0, troop: hero.id, x: plan[0].x, y: plan[0].y });
  const events: Record<string, number> = {};
  if (!countEvents.length) {
    const { result, sim } = runBattle(setup, plan, data);
    return { destruction: result.destruction, stars: result.stars, events, troopsLost: sim.troops.filter((t) => t.dead && !t.summoned).length };
  }
  // step manually to count events
  const sim = createBattle(setup, data);
  const byTick = deploymentsByTick(plan);
  while (!sim.ended) {
    step(sim, byTick.get(sim.tick) ?? []);
    for (const e of sim.events) {
      const key = e.k === 'ability' ? `ability:${(e as { what: string }).what}` : e.k;
      if (countEvents.includes(key)) events[key] = (events[key] ?? 0) + 1;
    }
  }
  const r = result(sim);
  return { destruction: r.destruction, stars: r.stars, events, troopsLost: sim.troops.filter((t) => t.dead && !t.summoned).length };
}

export function cloneData(): GameData {
  return JSON.parse(JSON.stringify(defaultData)) as GameData;
}

export function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); }

export function summarize(rs: FightResult[]): { d: number; one: number; three: number } {
  return { d: mean(rs.map((r) => r.destruction)), one: mean(rs.map((r) => (r.stars >= 1 ? 100 : 0))), three: mean(rs.map((r) => (r.stars >= 3 ? 100 : 0))) };
}
