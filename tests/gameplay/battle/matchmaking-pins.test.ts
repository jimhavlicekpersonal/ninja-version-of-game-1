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

const PINNED: string[] = [
  'K8 lag0 #0: base 6f5f245e Keep 8 deps 424e3f6d 1* 62% t644 84375405',
  'K8 lag0 #1: base 7d17a2cf Keep 8 deps 77b21de7 2* 71% t886 d11e452d',
  'K8 lag0 #2: base 3f8b2401 Keep 8 deps 5a93113b 1* 67% t850 59f3ca18',
  'K8 lag2 #0: base fa099ae2 Keep 7 deps 24bc1f98 3* 100% t878 e2cda61f',
  'K8 lag2 #1: base 56cc2214 Keep 7 deps 77b21de7 2* 83% t730 45391a3f',
  'K8 lag2 #2: base 01aa0a57 Keep 7 deps 798fbbfd 2* 82% t732 41aacc53',
  'K15 lag0 #0: base 6a8a4dfb Keep 15 deps 2bc68668 1* 56% t1654 bcb27d1c',
  'K15 lag0 #1: base e9ec400e Keep 15 deps 80ce8626 3* 100% t1656 a006c332',
  'K15 lag0 #2: base bf56858f Keep 15 deps 96cb11d4 2* 95% t1800 76e209ab',
  'K15 lag2 #0: base ed4943f3 Keep 14 deps 2bc68668 1* 78% t1800 91f769ef',
  'K15 lag2 #1: base 76646757 Keep 14 deps 80ce8626 3* 100% t968 9543c014',
  'K15 lag2 #2: base 0958f3d4 Keep 14 deps 96cb11d4 1* 53% t1800 9461e48d',
];

describe('matchmaking, generated bases and the bot plan replay exactly (PUB-02)', () => {
  it('every pinned battle gives the same base, deployments and final state', { timeout: 120_000 }, () => {
    const got = [8, 15].flatMap((k) => [0, 2].flatMap((lag) => row(k, lag, 3)));
    if (got.join('\n') !== PINNED.join('\n')) console.log(JSON.stringify(got, null, 2));
    expect(got).toEqual(PINNED);
  });
});
