/**
 * CU parallel per-Keep tables, loot at risk (real village vs generated base), hoarding, scout fee.
 * Run: node scratch/run.mjs scratch/currencies/tables.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { topUpOne } from '../../src/gameplay/sim/economy';

const H = data.hall.levels; const B = data.buildings as any;
const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const inc = (k: number) => H[k - 1].limits.acorn_orchard.count * B.acorn_orchard.levels[H[k - 1].limits.acorn_orchard.maxLevel - 1].ratePerHour; // one currency
const storage = (k: number) => B.elder_toadstool.levels[k - 1].storage.acorns + H[k - 1].limits.acorn_silo.count * B.acorn_silo.levels[H[k - 1].limits.acorn_silo.maxLevel - 1].storage.acorns;

export default function main() {
  const e = data.economy, bt = data.battle, r = data.raids, st = data.store, rk = data.ranks;
  const gen = bt.generatedLootByHall;
  const genAvg = (k: number) => (gen[k - 1].min + gen[k - 1].max) / 2;
  const slack = (k: number) => rk.matchmaking.powerSlackByKeep?.[k - 1] ?? rk.matchmaking.powerSlack;
  console.log('== 6. parallel per-Keep tables as ratios to Keep 5 (first block) and to the Keep max income per hour, one currency (second block)');
  console.log('K | income/h | rewardScale | genLoot avg | scoutFee | storageLootCap | topUpScale | trainingSkipScale | powerSlack | KeepCost');
  for (let k = 1; k <= 15; k++) {
    const q = (v: number, v5: number) => (v / v5).toFixed(2);
    console.log(`${k} | ${q(inc(k), inc(5))} | ${q(e.rewardScaleByHall[k - 1], e.rewardScaleByHall[4])} | ${q(genAvg(k), genAvg(5))} | ${q(bt.scoutFeeByHall[k - 1], bt.scoutFeeByHall[4])} | ${q(r.storageLootCapByHall[k - 1], r.storageLootCapByHall[4])} | ${q(st.topUpScaleByHall[k - 1], st.topUpScaleByHall[4])} | ${q(st.trainingSkipScaleByHall[k - 1], st.trainingSkipScaleByHall[4])} | ${slack(k)} | ${q(B.elder_toadstool.levels[k]?.cost.acorns ?? 0, B.elder_toadstool.levels[5].cost.acorns)}`);
  }
  console.log('\nK | genLoot avg / income-h | rewardScale x 20k chest / income-h | scoutFee / genLoot avg | scoutFee as minutes of income | storageLootCap / genLoot min | storageLootCap / full storage (20% rule binds below) | topUp Jade per hour of income | trainingSkip Jade per 2 h army');
  for (let k = 1; k <= 15; k++) {
    const capRule = Math.min(0.2 * storage(k), r.storageLootCapByHall[k - 1]);
    console.log(`${k} | ${(genAvg(k) / inc(k)).toFixed(1)} h | ${(e.rewardScaleByHall[k - 1] * 20000 / inc(k)).toFixed(2)} h | ${(bt.scoutFeeByHall[k - 1] / genAvg(k) * 100).toFixed(1)}% | ${(bt.scoutFeeByHall[k - 1] / inc(k) * 60).toFixed(1)} min | ${(r.storageLootCapByHall[k - 1] / gen[k - 1].min).toFixed(2)} | ${(r.storageLootCapByHall[k - 1] / storage(k)).toFixed(3)} (${(0.2 * storage(k) <= r.storageLootCapByHall[k - 1]) ? '20% binds' : 'cap binds'}: ${(capRule / storage(k) * 100).toFixed(1)}% of storage at risk) | ${topUpOne(inc(k), data, k)} | ${Math.ceil(Math.max(1, st.trainingSkipScaleByHall[k - 1]) * 50)}`);
  }

  console.log('\n== 3. loot at risk per raid: real village (defense.ts villageToBase) vs a generated base of the same Keep (basegen.ts), per currency');
  console.log('K | full storage | 20% of it | storageLootCap | storage at risk (min) | collectors full 8 h | 50% of it | real max at risk (storage+collectors) | generated avg loot | real/generated | real at 25% storage | real/generated @25% | at Keep 15 attacker penalty: diff>=4 -> x0.05');
  for (let k = 1; k <= 15; k++) {
    const S = storage(k), s20 = 0.2 * S, cap = r.storageLootCapByHall[k - 1], risk = Math.min(s20, cap);
    const coll = inc(k) * e.collectorHoursCap, c50 = coll * e.raidableUncollectedFraction;
    const real = risk + c50, g = genAvg(k);
    const real25 = Math.min(0.2 * 0.25 * S, cap) + c50;
    console.log(`${k} | ${fmt(S)} | ${fmt(s20)} | ${fmt(cap)} | ${fmt(risk)} | ${fmt(coll)} | ${fmt(c50)} | ${fmt(real)} | ${fmt(g)} | ${(real / g).toFixed(2)} | ${fmt(real25)} | ${(real25 / g).toFixed(2)} | ${(risk / S * 100).toFixed(1)}% of storage per 100% raid`);
  }
  console.log('\nhoarding at Keeps 7-15: loss per 100%-destruction raid as % of a full storage = storageLootCap / storage (collectors aside): ' + [7, 8, 9, 10, 11, 12, 13, 14, 15].map((k) => `K${k} ${(r.storageLootCapByHall[k - 1] / storage(k) * 100).toFixed(1)}%`).join(', '));
  console.log('with 2 raids/day for 30 days (60 raids), a hoard of a full Keep storage loses: ' + [7, 10, 12, 15].map((k) => `K${k} ${(60 * r.storageLootCapByHall[k - 1] / storage(k) * 100).toFixed(0)}% (= ${fmt(60 * r.storageLootCapByHall[k - 1])} = ${(60 * r.storageLootCapByHall[k - 1] / inc(k)).toFixed(0)} h of income)`).join('; '));
  console.log('the Keep itself holds storage (elder_toadstool.levels[].storage), so villageToBase spreads storage loot over silos AND the Keep: Keep share of total storage: ' + [1, 3, 5, 8, 12, 15].map((k) => `K${k} ${(B.elder_toadstool.levels[k - 1].storage.acorns / storage(k) * 100).toFixed(0)}%`).join(', '));

  console.log('\n== lootPenaltyByHallDiff ' + JSON.stringify(rk.lootPenaltyByHallDiff) + ': an attacker one Keep above gets 80%, two above 50%, three 25%, four+ 5%. Bot raiders are matched by the DEFENDER trophies (matchStrength mirror, hallsAbove 1), so a raider is at most one Keep above: x0.8 at worst.');

  console.log('\n== league chests and win bonuses vs Keep loot (ranks.json): chest per month and win bonus per 3-star win');
  for (const l of rk.leagues) console.log(`${l.name} (min ${l.min}): chest ${fmt((l.chest.acorns ?? 0) + (l.chest.dew ?? 0))} + ${l.chest.moonstones} Jade; win bonus ${fmt((l.winBonus?.acorns ?? 0) + (l.winBonus?.dew ?? 0))} = ${((((l.winBonus?.acorns ?? 0) + (l.winBonus?.dew ?? 0)) / (genAvg(Math.max(1, Math.min(15, Math.round(l.min / 350) + 1))) * 2)) * 100).toFixed(1)}% of the matching Keep ${Math.max(1, Math.min(15, Math.round(l.min / 350) + 1))} average raid loot`);
  console.log('(trophiesPerHall 350: honor 2800 ~ Keep 9, 5200 ~ Keep 15; regular model honor: Keep 10 2778, Keep 14 4337, Keep 15 3786)');

  console.log('\n== daily chest EV per day at each Keep vs income (rewardScale x outcomes, streak step 1), and the Jade');
  const outcomes = data.daily.chest.outcomes; const W = outcomes.reduce((a, o) => a + o.weight, 0);
  const evBase = outcomes.reduce((a, o) => a + o.weight / W * ((o.reward.acorns ?? 0) + (o.reward.dew ?? 0)), 0);
  const evJade = outcomes.reduce((a, o) => a + o.weight / W * (o.reward.moonstones ?? 0), 0);
  console.log(`base EV ${fmt(evBase)} resources + ${evJade.toFixed(2)} Jade per day (+5 Jade every 7th day of streak); per Keep in hours of max income (both currencies): ` + [1, 3, 5, 8, 10, 12, 15].map((k) => `K${k} ${(evBase * e.rewardScaleByHall[k - 1] / (2 * inc(k))).toFixed(2)} h`).join(', '));
}
