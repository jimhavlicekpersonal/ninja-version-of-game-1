/** Matchmaking arithmetic for the sandbagger: what floor each policy's research gives at every Keep. */
import { defaultData as d } from '../../src/gameplay/sim/data';
import { lootPenalty, powerSlackAt, researchKeep } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';

export default function main() {
  const mm = d.ranks.matchmaking;
  console.log(`researchFloorKeeps ${mm.researchFloorKeeps} hallsBelow ${mm.hallsBelow} trophiesPerHall ${mm.trophiesPerHall} strengthJitter ${mm.strengthJitter}`);
  console.log('K | cap | slack | raider floor (strength K) | opp at floor | sandbag max lvl (reads <= K-1.4) | reads | sandbag floor | opp at floor | loot x (1 below / 2 below) | honor needed to beat floor (raider / sandbag)');
  for (let K = 3; K <= 15; K++) {
    const cap = troopLevelCapAt(K, d);
    const slack = powerSlackAt(K, d);
    const rFloor = K - slack;
    const lo = (f: number) => Math.max(0, K - mm.hallsBelow - 1, f);
    const rLo = lo(rFloor);
    let maxLvl = 1;
    let reads = Math.max(K - mm.researchFloorKeeps, Math.min(K, researchKeep(1, d)));
    for (let L = 1; L <= cap; L++) {
      const r = L >= cap ? K : Math.max(K - mm.researchFloorKeeps, Math.min(K, researchKeep(L, d)));
      if (r <= K - 1.4) { maxLvl = L; reads = r; }
    }
    const sFloor = reads - slack;
    const sLo = lo(sFloor);
    const opp = (s: number) => `K${Math.floor(s) + 1} b${(s - Math.floor(s)).toFixed(2)}`;
    console.log(`${K} | ${cap} | ${slack} | ${rFloor.toFixed(2)} -> lo ${rLo.toFixed(2)} | ${opp(rLo)} | ${maxLvl} of ${cap} | ${reads.toFixed(2)} | ${sFloor.toFixed(2)} -> lo ${sLo.toFixed(2)} | ${opp(sLo)} | ${lootPenalty(K, K - 1, d)} / ${lootPenalty(K, K - 2, d)} | ${Math.round(rLo * mm.trophiesPerHall)} / ${Math.round(sLo * mm.trophiesPerHall)}`);
  }
  console.log('\nloot ranges by Keep (generatedLootByHall min..max) and storageLootCapByHall:');
  for (let K = 1; K <= 15; K++) {
    const r = d.battle.generatedLootByHall[K - 1];
    console.log(`K${K}: ${r.min}..${r.max}  cap ${d.raids.storageLootCapByHall[K - 1]}  scoutFee ${d.battle.scoutFeeByHall?.[K - 1] ?? '?'}`);
  }
}
