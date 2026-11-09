import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS, totalLoot } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
export default function main() {
  for (const K of [7, 9, 12, 15]) {
    const hero = heroAtKeep(K, data)!;
    let d = 0, st = 0, n = 0, loot = 0, one = 0;
    for (const L of LAYOUTS) for (let s = 0; s < 2; s++) {
      const base = generateOpponent(80000 + K * 10 + s, K, data, { levelBias: 0.5, layout: L });
      const setup: BattleSetup = { seed: 3 + s, base, army: {}, levels: {}, infiltration: true, hero };
      const probe = createBattle(setup, data);
      const p = probe.entry!.points[0];
      const { result } = runBattle(setup, [{ tick: 0, troop: hero.id, x: Math.floor(p.x), y: Math.floor(p.y) }], data);
      d += result.destruction; st += result.stars; n++; if (result.stars >= 1) one++;
      const tl = totalLoot(base); loot += (result.loot.acorns ?? 0) + (result.loot.dew ?? 0);
    }
    console.log(`K${K} hero L${hero.level} alone, 10 bases bias 0.5: destruction ${(d / n).toFixed(1)}%, stars ${(st / n).toFixed(2)}, 1-star ${one}/${n}, loot/battle ${(loot / n).toFixed(0)}`);
  }
}
