/**
 * PUB-02 / XPL-07: the path the other pins do not cover. `rules-version.test.ts` hashes the data and
 * `aura-cache.test.ts` pins hand-built battles; neither touches generated bases, matchmaking or the bot
 * plan. CI once computed a whole matched-raid row with another row's parameter; this file pins that path
 * battle by battle (base, deployments, final state hash), and CI runs it a second time with V8's optimising
 * compilers off (`--execArgv=--no-turbofan --execArgv=--no-maglev`), so a compiler fault fails here by name.
 *
 * Re-pin (copy the printed table) only when a change to generated bases, matchmaking, the bot plan or the
 * battle rules is intended: a SIM_RULES bump, or a matchmaking change that rides one (P4-07).
 */
import { describe, expect, it } from 'vitest';
import { createBattle, deploymentsByTick, result as battleResult, stateHash, step } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy, opponentFor } from '../../../src/gameplay/sim/matchmaking';
import { createRng } from '../../../src/gameplay/sim/rng';
import { matchedVillage } from '../../../tools/balance/matched';

function fnv(s: string): string {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(16).padStart(8, '0');
}

function row(keep: number, lag: number, battles: number): string[] {
  const army = botArmy(keep, 1, data);
  const state = matchedVillage(keep, army, lag, data);
  const levels = { ...state.research.levels };
  const out: string[] = [];
  for (let i = 0; i < battles; i++) {
    const base = opponentFor(1000 + keep * 97 + i * 7919, state, data);
    const sim = createBattle({ seed: 77 + i, base, army, levels, infiltration: true }, data);
    const deps = botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + i), data, levels, sim.entry);
    const byTick = deploymentsByTick(deps);
    while (!sim.ended) step(sim, byTick.get(sim.tick));
    const r = battleResult(sim);
    out.push(`K${keep} lag${lag} #${i}: base ${fnv(JSON.stringify(base))} Keep ${base.hallLevel} deps ${fnv(JSON.stringify(deps))} ${r.stars}* ${r.destruction}% t${sim.tick} ${stateHash(sim)}`);
  }
  return out;
}

// Re-pinned for SIM_RULES 9 (2026-11-22): the combat rebalance's tier and air stats (the bases and bot plans are unchanged;
// the battles' outcomes and final states are not).
const PINNED: string[] = [
  'K8 lag0 #0: base d4aaffaf Keep 8 deps 9018cbfb 3* 100% t861 e4956570',
  'K8 lag0 #1: base 5be08c91 Keep 8 deps 22c24102 0* 47% t994 e55d5ad2',
  'K8 lag0 #2: base 96b74eab Keep 8 deps 2ec9874c 2* 60% t631 4bc2c3d1',
  'K8 lag2 #0: base 083557ac Keep 7 deps 8894ed06 3* 100% t617 e626125e',
  'K8 lag2 #1: base 881784bf Keep 7 deps 22c24102 3* 100% t609 84a1cc85',
  'K8 lag2 #2: base dd410f6e Keep 7 deps 798fbbfd 3* 100% t1119 981d6cbb',
  'K15 lag0 #0: base a454ff00 Keep 15 deps a902890c 2* 63% t1800 592b50a4',
  'K15 lag0 #1: base 42256ef7 Keep 15 deps 80ce8626 2* 70% t1430 e4727a40',
  'K15 lag0 #2: base f6f1397d Keep 15 deps 96cb11d4 2* 67% t1800 b5b59893',
  'K15 lag2 #0: base 5e68117f Keep 14 deps a902890c 3* 100% t975 4061edce',
  'K15 lag2 #1: base 6e52bb45 Keep 14 deps 80ce8626 2* 72% t1265 ff962ef2',
  'K15 lag2 #2: base a08de6a0 Keep 14 deps 96cb11d4 2* 67% t917 64869a9d',
];

describe('matchmaking, generated bases and the bot plan replay exactly (PUB-02)', () => {
  it('every pinned battle gives the same base, deployments and final state', { timeout: 120_000 }, () => {
    const got = [8, 15].flatMap((k) => [0, 2].flatMap((lag) => row(k, lag, 3)));
    if (got.join('\n') !== PINNED.join('\n')) console.log(JSON.stringify(got, null, 2));
    expect(got).toEqual(PINNED);
  });
});
