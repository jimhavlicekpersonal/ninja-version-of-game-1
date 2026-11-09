/** (a) Shadow Trials: where a capped army stalls and what a new Keep harvests at once. (b) The "Next" lottery: loot spread across offers and the value of rerolling. node scratch/run.mjs scratch/design/misc.ts */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { totalLoot } from '../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy, opponentFor } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import { trialBase, trialReward } from '../../src/gameplay/sim/trials';
import { createNewVillage, scoutFee } from '../../src/gameplay/sim/village';
import type { VillageState } from '../../src/gameplay/sim/types';

function stateAt(K: number, honor: number): VillageState {
  const s = createNewVillage(Date.UTC(2026, 0, 5), data);
  const hall = s.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
  hall.level = K;
  const army = botArmy(K, 1, data);
  s.army = army;
  for (const t of Object.keys(army)) (s.research as any).levels[t] = troopLevelCapAt(K, data, t);
  s.trophies = honor;
  return s;
}
export default function main() {
  console.log('== (a) Shadow Trials with the bot mix at caps + hero (bot plan): primary fortress then up to 4 alternates; a tier is cleared at 2 stars');
  const HONOR: Record<number, number> = { 8: 2173, 12: 3000 };
  for (const K of [8, 12]) {
    const army = botArmy(K, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, data, t)]));
    const hero = heroAtKeep(K, data);
    const first = 4 * (K - 2) + 1; // tiers of the Keep below start here
    let stall = -1, harvestRes = 0, harvestJade = 0, cleared = 0, attempts = 0;
    const row: string[] = [];
    for (let tier = first; tier < first + 28; tier++) {
      let ok = false;
      for (let v = 0; v < 5 && !ok; v++) {
        const base = trialBase(tier, data, v);
        const setup = { seed: 1000 + tier * 7 + v, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
        const probe = createBattle(setup, data);
        const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(tier * 13 + v), data, levels, probe.entry);
        const r = runBattle(setup, plan, data).result; attempts++;
        if (r.stars >= 2) { ok = true; row.push(`${tier}:${v === 0 ? '✓' : 'alt' + v}`); }
      }
      if (!ok) { stall = tier; row.push(`${tier}:✗`); break; }
      const rw = trialReward(tier, data); harvestRes += (rw.acorns ?? 0) + (rw.dew ?? 0); harvestJade += rw.moonstones ?? 0; cleared++;
    }
    const raid = data.battle.generatedLootByHall[K - 1]; const raidAvg = raid.min + raid.max;
    console.log(`Keep ${K}: own tiers ${4 * (K - 1) + 1}-${4 * K}; cleared ${cleared} tiers from ${first}, stalled at ${stall} (Keep ${1 + Math.floor((stall - 1) / 4)} fortress, ${attempts} attempts); harvest ${Math.round(harvestRes / 1000)}k Coins+Prov = ${(harvestRes / raidAvg).toFixed(1)} average raids, ${harvestJade} Jade; alternates used: ${row.filter((x) => x.includes('alt')).length}`);
    console.log('   ' + row.join(' '));
  }
  console.log('\n== (b) the Next lottery: 300 offers per Keep via opponentFor at the campaign honor; loot in Coins+Prov; fee = scoutFee');
  for (const K of [5, 8, 12]) {
    const s = stateAt(K, HONOR[K] ?? 984);
    const loots: number[] = [];
    for (let i = 0; i < 300; i++) { const b = opponentFor(50_000 + i, s, data); const tl = totalLoot(b); loots.push((tl.acorns ?? 0) + (tl.dew ?? 0)); }
    loots.sort((a, b) => a - b);
    const q = (p: number) => loots[Math.floor(p * (loots.length - 1))];
    const mean = loots.reduce((a, b) => a + b, 0) / loots.length;
    const fee = scoutFee(s, data);
    // optimal threshold policy: accept the first offer >= T, pay fee per reroll; expected value = E[loot | >= T] - fee * (expected rerolls)
    let bestT = 0, bestV = -Infinity;
    for (const T of [q(0), q(0.25), q(0.5), q(0.6), q(0.7), q(0.8), q(0.9), q(0.95)]) {
      const above = loots.filter((l) => l >= T); const p = above.length / loots.length; const e = above.reduce((a, b) => a + b, 0) / above.length;
      const v = e - fee * ((1 - p) / p); if (v > bestV) { bestV = v; bestT = T; }
    }
    console.log(`Keep ${K}: fee ${fee}; loot min ${q(0)} p25 ${q(0.25)} median ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} max ${q(1)}; mean ${Math.round(mean)}; max/min ${(q(1) / q(0)).toFixed(2)}x; best accept-threshold ${bestT} -> expected ${Math.round(bestV)} per raid (+${((bestV / mean - 1) * 100).toFixed(1)}% over taking the first offer; fee is ${(100 * fee / mean).toFixed(1)}% of a mean offer)`);
  }
}
