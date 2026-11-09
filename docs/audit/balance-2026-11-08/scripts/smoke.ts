import { createBattle, runBattle } from '../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../src/gameplay/sim/battle/basegen';
import type { BattleSetup } from '../src/gameplay/sim/battle/types';
import { defaultData as data } from '../src/gameplay/sim/data';
import { botDeployments } from '../src/gameplay/sim/defense';
import { botArmy } from '../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../src/gameplay/sim/research';
import { createRng } from '../src/gameplay/sim/rng';

export default function main(keepArg = '6') {
  const keep = Number(keepArg);
  const army = botArmy(keep, 1, data);
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const t0 = Date.now();
  let n = 0, sum = 0;
  for (let i = 0; i < 4; i++) {
    const base = generateOpponent(1000 + i * 7919, keep, data, { levelBias: 0.5 });
    const setup: BattleSetup = { seed: 42 + i, base, army, levels, infiltration: true };
    const probe = createBattle(setup, data);
    const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(9 + i), data, levels, probe.entry);
    const { result } = runBattle(setup, plan, data);
    sum += result.destruction; n++;
    console.log(`keep ${keep} seed ${i}: destruction ${result.destruction}% stars ${result.stars} layout ${base.layout ?? '?'}`);
  }
  console.log(`mean ${sum / n} over ${n} battles in ${Date.now() - t0} ms`);
}
