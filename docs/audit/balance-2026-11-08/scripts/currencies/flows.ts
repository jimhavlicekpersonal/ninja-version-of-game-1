/**
 * CU flow model: per-Keep supply and demand of Coins (acorns) and Provisions (dew), from data only.
 * Run: node scratch/run.mjs scratch/currencies/flows.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import campaign from '../../docs/game-theory/campaign.json';

type Cost = Record<string, number>;
const H = data.hall.levels;
const B = data.buildings as Record<string, any>;
const T = data.troops as Record<string, any>;
const add = (a: Cost, b: Cost, m = 1) => { for (const [k, v] of Object.entries(b ?? {})) a[k] = (a[k] ?? 0) + (v as number) * m; return a; };
const fmt = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

function incomePerHour(k: number): number {
  const lim = H[k - 1].limits.acorn_orchard;
  return lim.count * B.acorn_orchard.levels[lim.maxLevel - 1].ratePerHour;
}
function storageCap(k: number): number {
  const lim = H[k - 1].limits.acorn_silo;
  return B.elder_toadstool.levels[k - 1].storage.acorns + lim.count * B.acorn_silo.levels[lim.maxLevel - 1].storage.acorns;
}
/** Coins and Provisions of every upgrade newly allowed at Keep k (walls and decor excluded; walls separate). */
function newUpgrades(k: number): { coins: number; prov: number; walls: number; byType: Record<string, Cost> } {
  const now = H[k - 1].limits as Record<string, { count: number; maxLevel: number }>;
  const prev = k > 1 ? (H[k - 2].limits as Record<string, { count: number; maxLevel: number }>) : {};
  let coins = 0, prov = 0, walls = 0;
  const byType: Record<string, Cost> = {};
  for (const [type, lim] of Object.entries(now)) {
    const def = B[type];
    if (!def || def.category === 'decor' || def.category === 'builder' || def.category === 'obstacle') continue;
    const p = prev[type] ?? { count: 0, maxLevel: 0 };
    const c: Cost = {};
    // existing buildings go from p.maxLevel to lim.maxLevel
    for (let L = p.maxLevel + 1; L <= lim.maxLevel; L++) add(c, def.levels[L - 1]?.cost ?? {}, p.count);
    // new buildings go from 1 to lim.maxLevel
    for (let L = 1; L <= lim.maxLevel; L++) add(c, def.levels[L - 1]?.cost ?? {}, lim.count - p.count);
    if (def.category === 'hedge') { walls += c.acorns ?? 0; continue; }
    byType[type] = c;
    coins += c.acorns ?? 0; prov += c.dew ?? 0;
  }
  // The Keep itself (to reach k+1) is counted separately.
  return { coins, prov, walls, byType };
}
/** Research Provisions newly allowed at Keep k (every troop), and for the bot mix of Keep k only. */
function newResearch(k: number): { all: number; mix: number; lanesDays: number } {
  let all = 0, mix = 0, secs = 0;
  const mixTroops = new Set(Object.keys(data.raids.botArmyMix[Math.min(15, k) - 1]));
  for (const [id, def] of Object.entries(T)) {
    const unlock = def.unlockKeep ?? 1;
    if (unlock > k) continue;
    const capNow = Math.min(troopLevelCapAt(k, data, id), def.levels.length);
    const capPrev = k > 1 && unlock <= k - 1 ? Math.min(troopLevelCapAt(k - 1, data, id), def.levels.length) : 1;
    for (let L = capPrev + 1; L <= capNow; L++) {
      const r = def.levels[L - 1].research;
      if (!r) continue;
      all += r.cost.dew ?? 0; secs += r.seconds;
      if (mixTroops.has(id)) mix += r.cost.dew ?? 0;
    }
  }
  return { all, mix, lanesDays: secs / 86400 / (H[k - 1].researchLanes ?? 1) };
}
function armyCost(k: number): { prov: number; housing: number; refillMin: number; army: Record<string, number> } {
  const army = botArmy(k, 1, data);
  let prov = 0, housing = 0, secs = 0;
  const dojoMax = H[k - 1].limits.burrow_barracks?.maxLevel ?? 1;
  const speed = B.burrow_barracks.levels[dojoMax - 1].trainingSpeed ?? 1;
  for (const [t, n] of Object.entries(army)) {
    const lvl = Math.min(troopLevelCapAt(k, data, t), T[t].levels.length);
    prov += (T[t].levels[lvl - 1].cost.dew ?? 0) * n;
    housing += T[t].housing * n;
    secs += Math.ceil(T[t].trainSeconds / speed) * n;
  }
  return { prov, housing, refillMin: secs / 60, army };
}

export default function main() {
  const regular = (campaign as any).results.find((r: any) => r.id === 'regular');
  const casual = (campaign as any).results.find((r: any) => r.id === 'casual');
  const perDay = (r: any, k: number) => {
    const row = r.byKeep.find((x: any) => x.keep === k);
    if (!row) return null;
    const start = r.reached[String(k)], end = r.reached[String(k + 1)] ?? r.days;
    const d = Math.max(0.1, end - start);
    return { days: d, raidsPerDay: row.raids / d, lootPerRaid: row.loot, raidedPerDay: row.defenses / d, stolenPerRaid: row.stolen, lootPerDay: row.raids * row.loot / d, stolenPerDay: row.defenses * row.stolen / d, stars: row.stars };
  };
  console.log('== Table A: supply side per Keep (one currency; Coins and Provisions are symmetric in production and storage)');
  console.log('K | inc/h max | inc/h prev-max | day 1s(8h) | day 2s(16h) | day 4s(22h) | storage | KeepCost(next) | hours of max income to next Keep | storage/KeepCost');
  const rows: any[] = [];
  for (let k = 1; k <= 15; k++) {
    const inc = incomePerHour(k), prev = incomePerHour(Math.max(1, k - 1));
    const cap = storageCap(k);
    const keepCost = B.elder_toadstool.levels[k]?.cost?.acorns ?? 0;
    const up = newUpgrades(k), res = newResearch(k), army = armyCost(k);
    rows.push({ k, inc, prev, cap, keepCost, up, res, army, reg: perDay(regular, k), cas: perDay(casual, k) });
    console.log(`${k} | ${fmt(inc)} | ${fmt(prev)} | ${fmt(inc * 8)} | ${fmt(inc * 16)} | ${fmt(inc * 22)} | ${fmt(cap)} | ${fmt(keepCost)} | ${keepCost ? (keepCost / inc).toFixed(0) : '-'} | ${keepCost ? (cap / keepCost).toFixed(2) : '-'}`);
  }
  console.log('\n== Table B: demand newly allowed at each Keep (buildings.json x hall.json; walls separate; Keep cost = next Keep)');
  console.log('K | Coins upgrades | Prov upgrades | walls (Coins) | next Keep (Coins) | research all (Prov) | research bot-mix (Prov) | lane-days all | army refill (Prov) | housing | refill min @max Dojo');
  for (const r of rows) console.log(`${r.k} | ${fmt(r.up.coins)} | ${fmt(r.up.prov)} | ${fmt(r.up.walls)} | ${fmt(r.keepCost)} | ${fmt(r.res.all)} | ${fmt(r.res.mix)} | ${r.res.lanesDays.toFixed(1)} | ${fmt(r.army.prov)} | ${r.army.housing} | ${r.army.refillMin.toFixed(0)}`);
  console.log('\n== Table B2: Coins-vs-Provisions split of the newly allowed building spend by type (Keep 8 and 12 examples)');
  for (const k of [5, 8, 12, 15]) {
    const r = rows[k - 1];
    console.log(`K${k}: ` + Object.entries(r.up.byType).filter(([, c]) => (c as Cost).acorns || (c as Cost).dew).map(([t, c]) => `${t}=${fmt((c as Cost).acorns ?? 0)}C/${fmt((c as Cost).dew ?? 0)}P`).join(', '));
  }
  console.log('\n== Table C: two-currency load, REGULAR (4 sessions, campaign loot and losses; loot and losses split 50/50 between currencies)');
  console.log('K | days@K | prod/day | loot/day | stolen/day | net Coins/day | net Prov/day (after refills) | Coins demand | Prov demand (bot-mix research) | Prov demand (all research) | days Coins | days Prov(mix) | days Prov(all) | binds | factor');
  for (const r of rows) {
    const p = r.reg; if (!p) { console.log(`${r.k} | no campaign row`); continue; }
    const prod = r.inc * 22;
    const lootC = p.lootPerDay / 2, stolenC = p.stolenPerDay / 2;
    const netC = prod + lootC - stolenC;
    const refills = p.raidsPerDay * r.army.prov;
    const netP = prod + lootC - stolenC - refills;
    const demC = r.up.coins + r.keepCost + r.up.walls * 0; // walls optional
    const demPmix = r.up.prov + r.res.mix;
    const demPall = r.up.prov + r.res.all;
    const dC = demC / netC, dPm = demPmix / Math.max(1, netP), dPa = demPall / Math.max(1, netP);
    const binds = dPm > dC ? 'Prov' : 'Coins';
    console.log(`${r.k} | ${p.days.toFixed(1)} | ${fmt(prod)} | ${fmt(p.lootPerDay)} | ${fmt(p.stolenPerDay)} | ${fmt(netC)} | ${fmt(netP)} | ${fmt(demC)} | ${fmt(demPmix)} | ${fmt(demPall)} | ${dC.toFixed(1)} | ${dPm.toFixed(1)} | ${dPa.toFixed(1)} | ${binds} | ${(Math.max(dC, dPm) / Math.min(dC, dPm)).toFixed(2)}`);
  }
  console.log('\n== Table D: two-currency load, CASUAL (1 session, campaign casual loot and losses)');
  console.log('K | days@K | prod/day(8h) | loot/day | stolen/day | net Coins/day | net Prov/day | Coins demand | Prov demand(mix) | days Coins | days Prov(mix) | days Prov(all) | binds | factor');
  for (const r of rows) {
    const p = r.cas; if (!p) { console.log(`${r.k} | no campaign row`); continue; }
    const prod = r.inc * 8;
    const lootC = p.lootPerDay / 2, stolenC = p.stolenPerDay / 2;
    const netC = prod + lootC - stolenC;
    const refills = p.raidsPerDay * r.army.prov;
    const netP = prod + lootC - stolenC - refills;
    const demC = r.up.coins + r.keepCost;
    const demPmix = r.up.prov + r.res.mix;
    const demPall = r.up.prov + r.res.all;
    const dC = demC / netC, dPm = demPmix / Math.max(1, netP), dPa = demPall / Math.max(1, netP);
    const binds = netP <= 0 ? 'Prov(negative)' : dPm > dC ? 'Prov' : 'Coins';
    console.log(`${r.k} | ${p.days.toFixed(1)} | ${fmt(prod)} | ${fmt(p.lootPerDay)} | ${fmt(p.stolenPerDay)} | ${fmt(netC)} | ${fmt(netP)} | ${fmt(demC)} | ${fmt(demPmix)} | ${dC.toFixed(1)} | ${netP > 0 ? dPm.toFixed(1) : 'inf'} | ${netP > 0 ? dPa.toFixed(1) : 'inf'} | ${binds} | ${netP > 0 ? (Math.max(dC, dPm) / Math.min(dC, dPm)).toFixed(2) : '-'}`);
  }
  console.log('\n== Table E: raid vs farm per Keep (generated-loot average and campaign loot; refill at the best Dojo + 3 min)');
  console.log('K | gen loot avg (both) | campaign loot/raid (reg) | refill+3 min | loot/raid-hour | prod/h (both currencies) | ratio raid:farm per hour | army Prov cost | net Prov per raid (loot/2 - army) | raids to pay a day of 4-session farming | 10-min raid vs 22h farm');
  for (const r of rows) {
    const g = data.battle.generatedLootByHall[r.k - 1];
    const genAvg = (g.min + g.max) / 2 * 2; // both currencies
    const loot = r.reg?.lootPerRaid ?? genAvg * 0.6;
    const cycle = r.army.refillMin + 3;
    const lph = loot / (cycle / 60);
    const prodBoth = r.inc * 2;
    const netP = loot / 2 - r.army.prov;
    console.log(`${r.k} | ${fmt(genAvg)} | ${fmt(loot)} | ${cycle.toFixed(0)} min | ${fmt(lph)} | ${fmt(prodBoth)} | ${(lph / prodBoth).toFixed(2)} | ${fmt(r.army.prov)} | ${fmt(netP)} | ${(prodBoth * 22 / loot).toFixed(2)} | ${loot >= prodBoth * 22 ? 'raid wins' : (loot / (prodBoth * 22) * 100).toFixed(0) + '% of a day'}`);
  }
}
