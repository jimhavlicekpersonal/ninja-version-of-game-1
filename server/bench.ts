/**
 * Re-simulation benchmark (roadmap step 18): how long `runBattle` takes for a
 * realistic attack at each Keep (a generated base of that Keep, a full bot
 * army at its research cap, deployed through the Infiltration Points). This is
 * the CPU the server spends on every reported battle. Run it on the hosting
 * hardware: `npm run server:build && npm run server:bench`.
 */
import { createBattle, runBattle } from '../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../src/gameplay/sim/battle/basegen';
import { botDeployments } from '../src/gameplay/sim/defense';
import { botArmy } from '../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../src/gameplay/sim/research';
import { createRng } from '../src/gameplay/sim/rng';
import type { GameData } from '../src/gameplay/sim/types';

export interface BenchRow {
  keep: number;
  battles: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  meanTicks: number;
  buildings: number;
  troops: number;
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const round = (n: number) => Math.round(n * 100) / 100;

/** Battles per Keep, timed one by one after a short warm-up (so the JIT has compiled the simulation). */
export function benchmarkBattles(data: GameData, opts: { keeps?: number[]; battles?: number; warmup?: number } = {}): BenchRow[] {
  const keeps = opts.keeps ?? [1, 4, 8, 12, 15];
  const battles = opts.battles ?? 30;
  const one = (keep: number, i: number) => {
    const base = generateOpponent(keep * 7919 + i, keep, data);
    const army = botArmy(keep, 1, data);
    const levels: Record<string, number> = {};
    for (const t of Object.keys(army)) levels[t] = Math.max(1, Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length));
    const setup = { seed: (keep * 104729 + i) >>> 0, base, army, levels, infiltration: true };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(i + 1), data, levels, probe.entry);
    const t0 = performance.now();
    const { result } = runBattle(setup, deployments, data);
    return { ms: performance.now() - t0, ticks: result.ticks, buildings: base.buildings.length, troops: Object.values(army).reduce((s, n) => s + n, 0) };
  };
  for (let i = 0; i < (opts.warmup ?? 5); i++) one(keeps[keeps.length - 1], 10_000 + i);
  return keeps.map((keep) => {
    const runs = Array.from({ length: battles }, (_, i) => one(keep, i));
    const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
    return {
      keep,
      battles,
      medianMs: round(pct(ms, 0.5)),
      p95Ms: round(pct(ms, 0.95)),
      maxMs: round(ms[ms.length - 1]),
      meanTicks: Math.round(runs.reduce((s, r) => s + r.ticks, 0) / runs.length),
      buildings: runs[0].buildings,
      troops: runs[0].troops,
    };
  });
}
