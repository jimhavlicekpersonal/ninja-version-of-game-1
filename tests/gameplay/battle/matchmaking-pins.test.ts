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

// Re-pinned for SIM_RULES 8 (2026-11-18): Phase 4's combat changes and P4-07's raid layouts; Keep 8 rows again for
// the rules-8 power slack. SIM_RULES 9 (2026-11-22) left the Keep 8 and Keep 15 bot armies' warriors unchanged.
// Re-pinned for SIM_RULES 10 (2026-11-25): generated bases now hold the live counters and the Hero Hall (new layouts).
const PINNED: string[] = [
  'K8 lag0 #0: base 04e20248 Keep 8 deps 24bc1f98 3* 100% t1433 fd5ad755',
  'K8 lag0 #1: base 7bc0f81a Keep 8 deps 9342820d 0* 48% t1110 0ccf2e1e',
  'K8 lag0 #2: base d017baa8 Keep 8 deps 5a93113b 0* 46% t743 6545f36f',
  'K8 lag2 #0: base 908d1f50 Keep 7 deps 9018cbfb 2* 87% t1800 c7d8bbf1',
  'K8 lag2 #1: base 1162ced1 Keep 7 deps 22c24102 2* 73% t900 36af5507',
  'K8 lag2 #2: base 48736fd9 Keep 7 deps 2ec9874c 2* 65% t796 b9362225',
  'K15 lag0 #0: base fd5e70fa Keep 15 deps 761a3476 2* 75% t1800 31e58953',
  'K15 lag0 #1: base 7abdae11 Keep 15 deps 82bb80ec 2* 52% t1387 5ca07ea1',
  'K15 lag0 #2: base 37532de9 Keep 15 deps 5263304c 2* 68% t1170 add9336c',
  'K15 lag2 #0: base 8c2b5401 Keep 14 deps 761a3476 2* 88% t1452 a813c1a5',
  'K15 lag2 #1: base f16c3ae8 Keep 14 deps 82bb80ec 2* 68% t1685 de436088',
  'K15 lag2 #2: base d1de7521 Keep 14 deps 5263304c 2* 72% t1369 31ea0d6e',
];

describe('matchmaking, generated bases and the bot plan replay exactly (PUB-02)', () => {
  it('every pinned battle gives the same base, deployments and final state', { timeout: 120_000 }, () => {
    const got = [8, 15].flatMap((k) => [0, 2].flatMap((lag) => row(k, lag, 3)));
    if (got.join('\n') !== PINNED.join('\n')) console.log(JSON.stringify(got, null, 2));
    expect(got).toEqual(PINNED);
  });
});
