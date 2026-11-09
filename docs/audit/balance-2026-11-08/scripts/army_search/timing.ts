import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { LAYOUTS, generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { maxHousingAtHall } from '../../src/gameplay/sim/army';

export default function main() {
  for (const keep of [5, 8, 12, 15]) {
    const army = botArmy(keep, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const hero = keep >= 7 ? heroAtKeep(keep, data) : null;
    const t0 = Date.now();
    let n = 0, sum = 0;
    for (const L of LAYOUTS) for (const bias of [0.5, 1]) {
      const base = generateOpponent(1000 + n * 7919, keep, data, { levelBias: bias, layout: L });
      const setup: BattleSetup = { seed: 42 + n, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = createBattle(setup, data);
      const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(9 + n), data, levels, probe.entry);
      const { result } = runBattle(setup, plan, data);
      sum += result.destruction; n++;
    }
    console.log(`keep ${keep} housing ${maxHousingAtHall(keep, data)} hero ${JSON.stringify(hero)} army ${JSON.stringify(army)} mean ${(sum / n).toFixed(1)} : ${((Date.now() - t0) / n).toFixed(0)} ms/battle`);
  }
}
