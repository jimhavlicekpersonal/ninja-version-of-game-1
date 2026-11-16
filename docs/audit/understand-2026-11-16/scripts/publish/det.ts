import { createBattle, deploymentsByTick, result as battleResult, step } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/battle/battle';
import { defaultData as data } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/data';
import { botDeployments } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/defense';
import { botArmy, opponentFor } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/matchmaking';
import { createRng } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/rng';
import { matchedVillage } from '/home/user/ninja-version-of-game-1/tools/balance/matched';

function h(s: string): string { let x = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16); }
const engine = (globalThis as any).Bun ? 'bun/JSC ' + (globalThis as any).Bun.version : 'node/V8 ' + process.version + ' v8 ' + process.versions.v8;
console.log('engine', engine);
for (const keep of [5, 8, 12, 15]) {
  const army = botArmy(keep, 1, data);
  const state = matchedVillage(keep, army, 0, data);
  const levels = { ...state.research.levels };
  let stars = 0; const per: string[] = [];
  for (let i = 0; i < 12; i++) {
    const seed = 1000 + keep * 97 + i * 7919;
    const base = opponentFor(seed, state, data);
    const baseHash = h(JSON.stringify(base));
    const sim = createBattle({ seed: 77 + i, base, army, levels, infiltration: true }, data);
    const deps = botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + i), data, levels, sim.entry);
    const depHash = h(JSON.stringify(deps));
    const byTick = deploymentsByTick(deps);
    while (!sim.ended) step(sim, byTick.get(sim.tick));
    const r = battleResult(sim);
    stars += r.stars;
    per.push(`${i}:b${baseHash}/d${depHash}/s${r.stars}/x${r.destruction}/t${sim.tick}`);
  }
  console.log('keep', keep, 'army', h(JSON.stringify(army)), 'avgStars', (stars / 12).toFixed(3));
  console.log('  ' + per.join(' '));
}
