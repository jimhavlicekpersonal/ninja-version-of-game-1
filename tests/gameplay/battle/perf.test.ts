import { expect, it } from 'vitest';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';

it('a full 3-minute battle with a big army simulates quickly', () => {
  const base = generateOpponent(42, 6, data);
  const army = { hedgehog_roller: 60, frog_lobber: 40, beetle_brute: 8, owl_bomber: 6, mole_digger: 10 };
  const deps = [];
  let tick = 0;
  for (const [troop, n] of Object.entries(army)) {
    for (let i = 0; i < n; i++) deps.push({ tick: tick++, troop, x: (i % 2 ? 1 : 38), y: 1 + (i % 38) });
  }
  const t0 = performance.now();
  const { result, sim } = runBattle({ seed: 1, base, army }, deps, data);
  const ms = performance.now() - t0;
  console.log(`battle: ${result.ticks} ticks, ${sim.troops.length} troops, ${ms.toFixed(0)} ms total, ${(ms / result.ticks).toFixed(3)} ms/tick, ${result.destruction}% ${result.stars}*`);
  // 10 ticks per second of game time: each tick must be far below the 100 ms budget.
  expect(ms / result.ticks).toBeLessThan(2);
});
