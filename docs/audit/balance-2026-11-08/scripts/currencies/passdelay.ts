/**
 * CU gap (d): pass rewards are scaled by the Keep at CLAIM time (village.ts passTierReward -> scaleReward(hallLevel(state))).
 * Confirms with real claimTier commands, shows the season reset bounds the delay, and quantifies delaying every claim to
 * the last day of a season over the campaign timelines (docs/game-theory/campaign.json). Also gap (a)/(b) rate tables.
 * Run: node scratch/run.mjs scratch/currencies/passdelay.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, advance, topUpQuote, passTierReward, type Command } from '../../src/gameplay/sim/village';
import { findFreeSpot } from '../../src/gameplay/sim/grid';
import { capacity } from '../../src/gameplay/sim/resources';
import { topUpOne, rewardScale, scaleReward } from '../../src/gameplay/sim/economy';
import { passPointsPerDay, passSeasonEndsAt, passSeason } from '../../src/gameplay/sim/pass';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { suggestedArmy } from '../../src/gameplay/sim/suggest';
import { housingCapacity } from '../../src/gameplay/sim/army';
import campaign from '../../docs/game-theory/campaign.json';
import type { VillageState } from '../../src/gameplay/sim/types';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 20, 12);
const B = data.buildings as Record<string, any>;
const H = data.hall.levels;
const fmt = (n: number) => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const inc1 = (k: number) => H[k - 1].limits.acorn_orchard.count * B.acorn_orchard.levels[H[k - 1].limits.acorn_orchard.maxLevel - 1].ratePerHour; // one currency per hour

function run(s: VillageState, cmd: Command, t: number): VillageState {
  const r = applyCommand(s, cmd, t, data);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.code} ${r.message}`);
  return r.state;
}
function craft(keep: number, res: Partial<Record<string, number>>, t = T0): VillageState {
  const s = createNewVillage(t, data);
  s.buildings = s.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle');
  s.buildings.find((b) => b.type === 'elder_toadstool')!.level = keep;
  const lim = H[keep - 1].limits as Record<string, { count: number; maxLevel: number }>;
  const addB = (type: string, level: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const spot = findFreeSpot(s, data, type, 20, 20);
      if (!spot) throw new Error('no spot for ' + type);
      s.buildings.push({ id: `b${s.nextId++}`, type, level, x: spot.x, y: spot.y, upgrade: null, collector: B[type].produces ? { stored: 0, accrueFrom: t } : null });
    }
  };
  for (const ty of ['acorn_silo', 'dew_cistern', 'army_camp', 'acorn_orchard', 'dewdrop_well']) addB(ty, lim[ty].maxLevel, lim[ty].count);
  addB('burrow_barracks', lim.burrow_barracks.maxLevel, 1);
  s.resources = { ...s.resources, ...res } as any;
  s.tutorial = { step: 99, done: true };
  return s;
}
function priciestTroop(keep: number): string {
  const dojo = H[keep - 1].limits.burrow_barracks.maxLevel;
  let best = 'hedgehog_roller', bestV = 0;
  for (const [id, def] of Object.entries(data.troops as Record<string, any>)) {
    if ((def.unlockKeep ?? 1) > keep || def.barracksLevel > dojo) continue;
    const lvl = Math.min(troopLevelCapAt(keep, data, id), def.levels.length);
    const v = (def.levels[lvl - 1].cost.dew ?? 0) / def.housing;
    if (v > bestV) { bestV = v; best = id; }
  }
  return best;
}
function armyCost(keep: number, army: Record<string, number>): number {
  let c = 0;
  for (const [t, n] of Object.entries(army)) { const lvl = Math.min(troopLevelCapAt(keep, data, t), (data.troops as any)[t].levels.length); c += ((data.troops as any)[t].levels[lvl - 1].cost.dew ?? 0) * n; }
  return c;
}

export default function main() {
  const tiers = data.pass.tiers as any[];
  const scale = data.economy.rewardScaleByHall;
  console.log('== (d1) claimTier reads the Keep at claim time: same points, same tier, different Keep (real applyCommand)');
  const mk = (keep: number) => { const s = craft(keep, { acorns: 0, dew: 0 }); s.pass.points = tiers.length * data.pass.pointsPerTier; s.pass.premium = true; return s; };
  for (const [tier, track] of [[2, 'premium'], [2, 'free'], [29, 'premium']] as const) {
    const base = (tiers[tier - 1][track].acorns ?? 0) + (tiers[tier - 1][track].dew ?? 0);
    const row = [5, 6, 7, 8, 12, 13].map((k) => { const s = run(mk(k), { type: 'claimTier', tier, track }, T0); return `K${k}: ${fmt(s.resources.acorns + s.resources.dew)}`; });
    console.log(`tier ${tier} ${track} (base ${fmt(base)}): ${row.join(' | ')}; K8/K5 = ${(scale[7] / scale[4]).toFixed(2)}x, K13/K12 = ${(scale[12] / scale[11]).toFixed(2)}x, K7/K6 = ${(scale[6] / scale[5]).toFixed(2)}x`);
  }
  console.log(`rewardScaleByHall step ratios K->K+1: ${scale.slice(1).map((v, i) => `${i + 1}->${i + 2} ${(v / scale[i]).toFixed(2)}x`).join(', ')}`);

  console.log('\n== (d2) the delay is bounded by the season: unclaimed tiers vanish at the season roll (pass.ts rollPeriods)');
  {
    const s = mk(5);
    const end = passSeasonEndsAt(T0, data);
    const before = s.pass.points;
    const after = advance(s, end + 1, data).state;
    console.log(`points before ${before} (tiers unlocked ${Math.floor(before / data.pass.pointsPerTier)}), 1 ms after the season end: points ${after.pass.points}, premium ${after.pass.premium}, claimedFree ${JSON.stringify(after.pass.claimedFree)}; season ${passSeason(T0, data)} -> ${after.pass.season}. passPointsPerDay ${passPointsPerDay(data)} -> all ${tiers.length} tiers unlock in ${(tiers.length * data.pass.pointsPerTier / passPointsPerDay(data)).toFixed(1)} days of full tasks; noSaleLastDays ${data.pass.noSaleLastDays}.`);
  }

  console.log('\n== (d3) delaying every claim to the last day of the season vs claiming as tiers unlock, over the campaign timelines');
  console.log('Tier i unlocks at day ceil(300 i / points per day) after the season start; Keep at a day from campaign.json `reached`; a season = 30 days; value in Coins+Prov, hours of both-currency income at the end Keep, and Jade as a top-up at the end Keep.');
  const ppd = passPointsPerDay(data);
  const unlockDay = (i: number) => Math.ceil((i * data.pass.pointsPerTier) / ppd);
  const resOf = (tier: any, track: 'free' | 'premium') => { const { skin, ...r } = tier[track]; return { acorns: r.acorns ?? 0, dew: r.dew ?? 0 }; };
  const sumScaled = (track: 'free' | 'premium', keepAt: (day: number) => number, lastDay: number) => {
    let acorns = 0, dew = 0;
    for (const t of tiers) {
      const d = Math.min(unlockDay(t.tier), lastDay);
      if (unlockDay(t.tier) > lastDay) continue;
      const r = scaleReward(resOf(t, track), keepAt(d), data);
      acorns += r.acorns ?? 0; dew += r.dew ?? 0;
    }
    return { acorns, dew, total: acorns + dew };
  };
  console.log('model | season start (campaign day) | Keep at start -> at day 29 | premium immediate | premium delayed | gain x | gain in hours of income at end Keep | gain as top-up Jade | free immediate | free delayed | gain x');
  for (const id of ['regular', 'casual']) {
    const r = (campaign as any).results.find((x: any) => x.id === id);
    const reached: Record<string, number> = r.reached;
    const keepAt = (day: number) => { let k = 1; for (const [kk, d] of Object.entries(reached)) if (d <= day && Number(kk) > k) k = Number(kk); return k; };
    const rows: any[] = [];
    for (let s0 = 0; s0 + 29 <= r.days; s0 += 1) {
      const endKeep = keepAt(s0 + 29.5);
      const imm = sumScaled('premium', (d) => keepAt(s0 + d), 29);
      const del = sumScaled('premium', () => endKeep, 29);
      const immF = sumScaled('free', (d) => keepAt(s0 + d), 29);
      const delF = sumScaled('free', () => endKeep, 29);
      const gain = del.total - imm.total;
      rows.push({ s0, k0: keepAt(s0), k1: endKeep, imm: imm.total, del: del.total, x: del.total / imm.total, hours: gain / (2 * inc1(endKeep)), jade: topUpOne(Math.max(0, del.acorns - imm.acorns), data, endKeep) + topUpOne(Math.max(0, del.dew - imm.dew), data, endKeep), immF: immF.total, delF: delF.total, xF: delF.total / immF.total });
    }
    const sorted = [...rows].sort((a, b) => b.x - a.x);
    const pick = [sorted[0], sorted[Math.floor(sorted.length / 4)], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1], rows[0]];
    const labels = ['best', 'upper quartile', 'median', 'worst', 'fresh start (day 0)'];
    pick.forEach((p, i) => console.log(`${id} | ${labels[i]}: day ${p.s0} | K${p.k0} -> K${p.k1} | ${fmt(p.imm)} | ${fmt(p.del)} | ${p.x.toFixed(2)}x | ${p.hours.toFixed(1)} h | ${Math.round(p.jade)} Jade | ${fmt(p.immF)} | ${fmt(p.delF)} | ${p.xF.toFixed(2)}x`));
    const share = rows.filter((p) => p.x > 1.0001).length / rows.length;
    const mean = rows.reduce((a, p) => a + p.x, 0) / rows.length;
    console.log(`${id}: ${rows.length} season starts; a Keep changes inside the season in ${(share * 100).toFixed(0)}% of them; mean gain ${mean.toFixed(2)}x; the premium Scroll costs $${data.pass.usd} and its honest estimate (passPremiumValue) prices the tiers at the Keep AT PURCHASE.`);
  }
  // Hours-of-production view of the whole premium track at the claim Keep, for scale.
  console.log(`for scale: premium track Coins+Prov at scale 1 (Keep 6) = ${fmt(tiers.reduce((a, t) => a + (t.premium.acorns ?? 0) + (t.premium.dew ?? 0), 0))}; free = ${fmt(tiers.reduce((a, t) => a + (t.free.acorns ?? 0) + (t.free.dew ?? 0), 0))}; in hours of both-currency income: K6 ${(583500 / (2 * inc1(6))).toFixed(1)} h, K10 ${(583500 * scale[9] / (2 * inc1(10))).toFixed(1)} h, K15 ${(583500 * scale[14] / (2 * inc1(15))).toFixed(1)} h (premium).`);

  console.log('\n== (a) exact Jade -> resource rate table per Keep (one currency; income/h = Keep max collectors of one kind)');
  console.log('K | income/h | top-up Jade per 1k (buying 1k) | top-up Jade per 1 h of income | train loop: max Prov per loop (camps + next army x priciest) | Jade | Jade per 1k | = hours of income | upgrade/research loop Jade per 1k (x2) | 1 h skip | 24 h skip | 2 h army finish | 24 h skip buys (h of income) : loop buys per 180 Jade');
  for (let k = 1; k <= 15; k++) {
    const s0 = craft(k, { acorns: 0, dew: 0, moonstones: 10_000_000 });
    const troop = priciestTroop(k);
    const q = topUpQuote(s0, { type: 'train', troop, count: 200 }, T0, data);
    const bought = q?.missing.dew ?? 0, jade = q?.moonstones ?? 0;
    const per1k = jade / bought * 1000;
    const inc = inc1(k);
    const skip2h = Math.ceil(Math.max(1, data.store.trainingSkipScaleByHall[k - 1]) * 50);
    console.log(`${k} | ${fmt(inc)} | ${topUpOne(1000, data, k)} | ${topUpOne(inc, data, k)} | ${fmt(bought)} (${troop}) | ${jade} | ${per1k.toFixed(2)} | ${(bought / inc).toFixed(2)} h | ${(per1k * 2).toFixed(2)} | 15 | 180 | ${skip2h} | 24 : ${(180 / per1k * 1000 / inc).toFixed(1)} h`);
  }

  console.log('\n== (b) raid vs farm per Keep: campaign loot per raid (regular / casual), army cost (bot mix at cap = what the campaign fields; Suggested army = newest warrior per role at the same shares), net Provisions and Coins per raid');
  console.log('K | loot/raid reg | loot/raid cas | bot-mix army Prov | suggested army Prov | net Prov/raid reg (loot/2 - army) | net Prov cas | Coins/raid (loot/2) | Prov income/h | net Prov as minutes of Prov income (reg) | raids/day reg (campaign) | binding currency reg (flows Table C) | Prov demand (mix) / Coins demand at Keep');
  const reg = (campaign as any).results.find((x: any) => x.id === 'regular'), cas = (campaign as any).results.find((x: any) => x.id === 'casual');
  const binds: Record<number, string> = { 2: 'Prov', 3: 'Coins', 4: 'Coins', 5: 'Coins', 6: 'Coins', 7: 'Coins', 8: 'Coins', 9: 'Coins', 10: 'Coins', 11: 'Coins', 12: 'Coins', 13: 'Prov', 14: 'Prov', 15: 'Prov' };
  for (let k = 2; k <= 15; k++) {
    const br = reg.byKeep.find((x: any) => x.keep === k), bc = cas.byKeep.find((x: any) => x.keep === k);
    const s = craft(k, { acorns: 0, dew: 0 });
    const sug = suggestedArmy(s, data);
    const bot = botArmy(k, 1, data);
    const cBot = armyCost(k, bot), cSug = armyCost(k, sug);
    const lootR = br?.loot ?? 0, lootC = bc?.loot ?? 0;
    const netR = lootR / 2 - cBot, netC = lootC / 2 - cBot;
    const days = Math.max(0.1, (reg.reached[String(k + 1)] ?? reg.days) - reg.reached[String(k)]);
    console.log(`${k} | ${fmt(lootR)} | ${fmt(lootC)} | ${fmt(cBot)} (housing ${housingCapacity(s, data)}) | ${fmt(cSug)} | ${fmt(netR)} | ${fmt(netC)} | ${fmt(lootR / 2)} | ${fmt(inc1(k))} | ${(netR / inc1(k) * 60).toFixed(0)} min | ${(br.raids / days).toFixed(2)} | ${binds[k]} | -`);
  }
}
