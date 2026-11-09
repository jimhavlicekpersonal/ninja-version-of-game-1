/**
 * CU loops and arbitrage: run real commands (applyCommand) on crafted villages.
 * Run: node scratch/run.mjs scratch/currencies/loops.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, advance, topUpQuote, dismissPreview, passTierReward, type Command } from '../../src/gameplay/sim/village';
import { findFreeSpot } from '../../src/gameplay/sim/grid';
import { capacity, collectorAmount } from '../../src/gameplay/sim/resources';
import { topUpOne, rewardScale } from '../../src/gameplay/sim/economy';
import { eventsBetween, eventEffect } from '../../src/gameplay/sim/events';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import type { VillageState } from '../../src/gameplay/sim/types';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 20, 12);
const B = data.buildings as Record<string, any>;
const H = data.hall.levels;
const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(3) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

function run(s: VillageState, cmd: Command, t: number): VillageState {
  const r = applyCommand(s, cmd, t, data);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.code} ${r.message}`);
  return r.state;
}
function tryRun(s: VillageState, cmd: Command, t: number) {
  return applyCommand(s, cmd, t, data);
}

/** A village at `keep` with every storage, camp, Dojo and collector at that Keep's cap, built (no obstacles). */
function craft(keep: number, res: Partial<Record<string, number>>, t = T0, opts: { collectorsBelowMax?: number } = {}): VillageState {
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
  addB('acorn_silo', lim.acorn_silo.maxLevel, lim.acorn_silo.count);
  addB('dew_cistern', lim.dew_cistern.maxLevel, lim.dew_cistern.count);
  addB('burrow_barracks', lim.burrow_barracks.maxLevel, 1);
  addB('army_camp', lim.army_camp.maxLevel, lim.army_camp.count);
  const below = opts.collectorsBelowMax ?? 0;
  addB('acorn_orchard', Math.max(1, lim.acorn_orchard.maxLevel - below), lim.acorn_orchard.count);
  addB('dewdrop_well', Math.max(1, lim.dewdrop_well.maxLevel - below), lim.dewdrop_well.count);
  s.resources = { ...s.resources, ...res } as any;
  s.tutorial = { step: 99, done: true };
  return s;
}

/** The most expensive (Provisions per housing) troop trainable in this village. */
function priciestTroop(s: VillageState, keep: number): string {
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

export default function main() {
  console.log('== (c) topUp train then cancelTraining: Jade -> Provisions in storage, no action required');
  console.log('K | troop | n queued | Prov bought | Jade paid | Jade per 1k Prov | intended top-up price per 1k (same curve) | refund == bought? | storage cap | max Prov per command');
  for (const keep of [1, 2, 3, 5, 8, 10, 12, 15]) {
    const s0 = craft(keep, { acorns: 0, dew: 0, moonstones: 10_000_000 });
    const troop = priciestTroop(s0, keep);
    const action = { type: 'train', troop, count: 200 } as const;
    const q = topUpQuote(s0, action, T0, data);
    if (!q) { console.log(`${keep} | ${troop} | no quote`); continue; }
    const s1 = run(s0, { type: 'topUp', then: action }, T0);
    const n = s1.training.length;
    const jade = s0.resources.moonstones - s1.resources.moonstones;
    const s2 = run(s1, { type: 'cancelTraining', index: n - 1, troop, count: n }, T0);
    const bought = q.missing.dew ?? 0;
    const cap = capacity(s0, data).dew;
    console.log(`${keep} | ${troop} | ${n} | ${fmt(bought)} | ${jade} | ${(jade / bought * 1000).toFixed(2)} | ${(topUpOne(1000, data, keep)).toFixed(0)} (1k) ${(topUpOne(bought, data, keep) / bought * 1000).toFixed(2)} (this amount) | ${s2.resources.dew === bought && s2.training.length === 0 ? 'yes, 100%' : 'NO ' + s2.resources.dew} | ${fmt(cap)} | ${fmt(bought)}`);
  }
  // Repeat to fill the storage at Keep 5 and Keep 10: how many commands, total Jade, and the Jade per 1k.
  for (const keep of [5, 10, 15]) {
    let s = craft(keep, { acorns: 0, dew: 0, moonstones: 10_000_000 });
    const troop = priciestTroop(s, keep);
    const cap = capacity(s, data).dew;
    let cmds = 0;
    const jade0 = s.resources.moonstones;
    while (cmds < 400) {
      const action = { type: 'train', troop, count: 200 } as const;
      const r = tryRun(s, { type: 'topUp', then: action }, T0);
      if (!r.ok) break;
      s = r.state;
      const n = s.training.length;
      s = run(s, { type: 'cancelTraining', index: n - 1, troop, count: n }, T0);
      cmds++;
    }
    const jade = jade0 - s.resources.moonstones;
    console.log(`fill storage at K${keep}: ${cmds} commands, ${fmt(s.resources.dew)} of ${fmt(cap)} Prov for ${jade} Jade (${(jade / s.resources.dew * 1000).toFixed(2)} Jade/1k); one top-up of the same total would cost ${topUpOne(s.resources.dew, data, keep)} Jade; hours of Keep-max production bought: ${(s.resources.dew / (H[keep - 1].limits.acorn_orchard.count * B.acorn_orchard.levels[H[keep - 1].limits.acorn_orchard.maxLevel - 1].ratePerHour)).toFixed(1)} h; 24 h skip costs 180 Jade`);
  }

  console.log('\n== (a) topUp upgrade then cancel: Jade -> Coins at 2x the top-up price (cancelRefundFraction 0.5)');
  console.log('K | building | upgrade cost Coins | player Coins before | Jade paid | refund | Jade per 1k Coins achieved | top-up price per 1k | allowed from 0?');
  for (const keep of [1, 3, 5, 8, 12, 15]) {
    const s0 = craft(keep, { acorns: 0, dew: 0, moonstones: 10_000_000 }, T0, { collectorsBelowMax: 1 });
    const well = s0.buildings.find((b) => b.type === 'dewdrop_well')!;
    const cost = B.dewdrop_well.levels[well.level].cost.acorns as number;
    const action = { type: 'upgrade', id: well.id } as const;
    const q = topUpQuote(s0, action, T0, data);
    if (!q) { console.log(`${keep} | well L${well.level}->${well.level + 1} | ${fmt(cost)} | no quote (cost ${fmt(cost)} > cap ${fmt(capacity(s0, data).acorns)}?)`); continue; }
    const s1 = run(s0, { type: 'topUp', then: action }, T0);
    const jade = s0.resources.moonstones - s1.resources.moonstones;
    const s2 = run(s1, { type: 'cancel', id: well.id }, T0);
    console.log(`${keep} | well L${well.level}->${well.level + 1} | ${fmt(cost)} | 0 | ${jade} | ${fmt(s2.resources.acorns)} | ${(jade / s2.resources.acorns * 1000).toFixed(2)} | ${(topUpOne(cost, data, keep) / cost * 1000).toFixed(2)} | yes`);
  }

  console.log('\n== (b) topUp research then cancelResearch: refund fraction');
  for (const keep of [2, 5, 10]) {
    const s0 = craft(keep, { acorns: 0, dew: 0, moonstones: 10_000_000 });
    const troop = 'hedgehog_roller';
    const action = { type: 'research', troop } as const;
    const q = topUpQuote(s0, action, T0, data);
    if (!q) { console.log(`K${keep}: no quote`); continue; }
    const s1 = run(s0, { type: 'topUp', then: action }, T0);
    const jade = s0.resources.moonstones - s1.resources.moonstones;
    const s2 = run(s1, { type: 'cancelResearch', troop }, T0);
    console.log(`K${keep}: research cost ${fmt(q.missing.dew ?? 0)} Prov for ${jade} Jade; cancel refunds ${fmt(s2.resources.dew)} (${(s2.resources.dew / (q.missing.dew ?? 1) * 100).toFixed(0)}%) -> ${(jade / s2.resources.dew * 1000).toFixed(2)} Jade/1k vs train loop ${(jade / (q.missing.dew ?? 1) * 1000).toFixed(2)}`);
  }

  console.log('\n== (d) Swift Feet Training (-25%): train, then dismiss or cancel');
  const evs = eventsBetween(T0, T0 + 28 * DAY, data);
  const swift = evs.find((e) => e.id === 'swift_paws')!;
  const harvest = evs.find((e) => e.id === 'harvest_moon')!;
  const raidsEv = evs.filter((e) => e.id.startsWith('raiders_moon'));
  const tS = swift.start + 3_600_000;
  {
    const s0 = craft(5, { acorns: 100_000, dew: 100_000, moonstones: 0 }, tS);
    const troop = 'beetle_brute';
    const full = (data.troops as any)[troop].levels[0].cost.dew as number;
    const s1 = run(s0, { type: 'train', troop, count: 1 }, tS);
    const paid = s0.resources.dew - s1.resources.dew;
    const prev = dismissPreview(s1, troop, 1, data);
    const s2 = run(s1, { type: 'cancelTraining', index: 0, troop, count: 1 }, tS);
    console.log(`discount active: ${eventEffect(tS, data).trainingDiscount}; ${troop} full price ${full}, paid ${paid}; cancelTraining refunds ${s2.resources.dew - s1.resources.dew} (${((s2.resources.dew - s1.resources.dew) / paid * 100).toFixed(0)}% of paid); dismiss would refund ${prev.refund.dew} = ${((prev.refund.dew ?? 0) / paid * 100).toFixed(0)}% of paid (0.5 x undiscounted level cost, village.ts dismissPreview)`);
    // Appreciation: dismiss values warriors at the CURRENT research level's price.
    const l1 = (data.troops as any).hedgehog_roller.levels[0].cost.dew, l20 = (data.troops as any).hedgehog_roller.levels[19].cost.dew;
    console.log(`appreciation: a Shinobi trained at level 1 (${l1} Prov) dismissed after research to level 20 (${l20}) refunds ${Math.floor(l20 * 0.5)} = ${(Math.floor(l20 * 0.5) / l1).toFixed(0)}x what was paid; 360 housing of them = ${fmt(360 * Math.floor(l20 * 0.5))} Prov, ${(360 * Math.floor(l20 * 0.5) / 1781742).toFixed(2)} h of Keep 15 production`);
  }

  console.log('\n== (e) Harvest Festival +30% on collect with the 8 h collector cap');
  {
    const tH = harvest.start + 3_600_000;
    const s0 = craft(5, { acorns: 0, dew: 0, moonstones: 0 }, tH - 20 * 3_600_000);
    // 20 h since accrueFrom: the collector holds only 8 h.
    const orchard = s0.buildings.find((b) => b.type === 'acorn_orchard')!;
    const held = collectorAmount(orchard, tH, data);
    const s1 = run(s0, { type: 'collect', id: orchard.id }, tH);
    const rate = B.acorn_orchard.levels[orchard.level - 1].ratePerHour;
    console.log(`Keep 5 Coin Mint L${orchard.level} (${rate}/h): after 20 h it holds ${held} (= ${held / rate} h, cap ${data.economy.collectorHoursCap} h); collecting in the Festival gives ${s1.resources.acorns} (+${s1.resources.acorns - held} = ${((s1.resources.acorns - held) / held * 100).toFixed(0)}%)`);
    const perEvent = (sessionsPerDay: number, hoursCollected: number) => 0.3 * hoursCollected;
    console.log(`per 48 h Festival (both currencies, hours of Keep-max production gained): 1 session/day collects 2x8 h -> +${perEvent(1, 16).toFixed(1)} h; 2 sessions -> +${perEvent(2, 32).toFixed(1)} h; 4 sessions (22 h/day) -> +${perEvent(4, 44).toFixed(1)} h; continuous -> +${perEvent(0, 48).toFixed(1)} h. Over a 14-day period that is ${(0.3 * 44 / (14 * 22) * 100).toFixed(1)}% of a 4-session player's production and ${(0.3 * 16 / (14 * 8) * 100).toFixed(1)}% of a 1-session player's.`);
    console.log(`holding collectors full until the Festival starts: at most 8 h x 0.3 = 2.4 h of production per collector per event (collectors cap at 8 h).`);
  }

  console.log('\n== (f) Night of Raids +20% (bankRaidLoot: floor(loot x 0.2) on top, storage-capped, won attacks only)');
  console.log(`schedule: ${raidsEv.map((e) => `${e.id} ${(e.end - e.start) / 3_600_000} h`).join(', ')} per ${data.events.periodDays}-day period -> ${(96 / 336 * 100).toFixed(1)}% of all time; average loot uplift for a player who raids uniformly: ${(0.2 * 96 / 336 * 100).toFixed(1)}%; a player who saves army/raids for the 96 h (4 raids/day x 4 days = 16 raids) gets +20% on those: at Keep 10 (campaign 700k/raid) = +${fmt(16 * 0.2 * 700_465)} per period = ${(16 * 0.2 * 700_465 / (149_274 * 2)).toFixed(1)} h of Keep 10 production.`);

  console.log('\n== (g) full storage: refunds and rewards silently lost (addCapped)');
  {
    const s0 = craft(5, { acorns: 0, dew: 0, moonstones: 0 }, T0, { collectorsBelowMax: 1 });
    const well = s0.buildings.find((b) => b.type === 'dewdrop_well')!;
    const cost = B.dewdrop_well.levels[well.level].cost.acorns as number;
    const cap = capacity(s0, data);
    s0.resources.acorns = cost; // exactly enough
    const s1 = run(s0, { type: 'upgrade', id: well.id }, T0);
    s1.resources.acorns = cap.acorns; // storage refilled to the brim meanwhile
    const s2 = run(s1, { type: 'cancel', id: well.id }, T0);
    console.log(`cancel at full storage: upgrade cost ${fmt(cost)} Coins, refund due ${fmt(Math.floor(cost * 0.5))}, received ${fmt(s2.resources.acorns - s1.resources.acorns)} (lost ${fmt(Math.floor(cost * 0.5) - (s2.resources.acorns - s1.resources.acorns))}); the command still succeeds (village.ts cancel -> addCapped).`);
    // Daily chest at full storage
    const s3 = craft(5, { acorns: cap.acorns, dew: cap.dew, moonstones: 0 }, T0);
    const r = applyCommand(s3, { type: 'openDailyChest' }, T0, data);
    if (r.ok) {
      const ev: any = r.events.find((e: any) => e.kind === 'daily_chest');
      console.log(`daily chest at full storage: outcome ${ev.outcome}, granted ${JSON.stringify(ev.grants)}, overflow ${JSON.stringify(ev.overflow ?? {})} (chest consumed for the day)`);
    }
    // dismiss at full storage
    const s4 = craft(5, { acorns: cap.acorns, dew: cap.dew - 250, moonstones: 0 }, T0);
    const s5 = run(s4, { type: 'train', troop: 'beetle_brute', count: 1 }, T0);
    const s6 = advance(s5, T0 + 3_600_000, data).state;
    s6.resources.dew = cap.dew;
    const s7 = run(s6, { type: 'dismiss', troop: 'beetle_brute', count: 1 }, T0 + 3_600_000);
    console.log(`dismiss at full storage: refund due ${dismissPreview(s6, 'beetle_brute', 1, data).refund.dew}, received ${s7.resources.dew - s6.resources.dew}`);
  }

  console.log('\n== (h) Season Scroll and 28-day calendar: fixed rewards scaled by the Keep AT CLAIM TIME (rewardScaleByHall)');
  {
    const tiers = data.pass.tiers as any[];
    const sum = (track: 'free' | 'premium', keep: number) => tiers.reduce((a, t) => { const r = passTierReward({ ...craft(keep, {}), } as any, t.tier, track, data)!; return a + (r.acorns ?? 0) + (r.dew ?? 0); }, 0);
    const jade = (track: 'free' | 'premium') => tiers.reduce((a, t) => a + (t[track].moonstones ?? 0), 0);
    console.log(`pass tiers: ${tiers.length}; free track Jade ${jade('free')}, premium Jade ${jade('premium')}`);
    console.log('K | scale | free track Coins+Prov | premium Coins+Prov | hours of Keep-max production (free) | (premium) | calendar 28 days Coins+Prov | hours');
    const cal = (data.daily as any).calendar.days as any[];
    const calBase = cal.reduce((a, d) => a + ((d.reward?.acorns ?? 0) + (d.reward?.dew ?? 0)), 0);
    for (const keep of [3, 5, 6, 8, 10, 12, 15]) {
      const inc = 2 * H[keep - 1].limits.acorn_orchard.count * B.acorn_orchard.levels[H[keep - 1].limits.acorn_orchard.maxLevel - 1].ratePerHour;
      const f = sum('free', keep), p = sum('premium', keep), c = calBase * rewardScale(keep, data);
      console.log(`${keep} | ${rewardScale(keep, data)} | ${fmt(f)} | ${fmt(p)} | ${(f / inc).toFixed(1)} h | ${(p / inc).toFixed(1)} h | ${fmt(c)} | ${(c / inc).toFixed(1)} h`);
    }
    // Verify claimTier scaling with a real claim at Keep 5 then at Keep 8 (same points).
    const mk = (keep: number) => { const s = craft(keep, { acorns: 0, dew: 0 }); s.pass.points = tiers.length * data.pass.pointsPerTier; return s; };
    const a = run(mk(5), { type: 'claimTier', tier: 2, track: 'free' }, T0);
    const b = run(mk(8), { type: 'claimTier', tier: 2, track: 'free' }, T0);
    console.log(`claimTier(2, free) = ${JSON.stringify(tiers[1].free)} base: at Keep 5 -> ${a.resources.acorns} Coins, at Keep 8 -> ${b.resources.acorns} Coins (${(b.resources.acorns / a.resources.acorns).toFixed(2)}x); regular model is Keep 5 on day 4 and Keep 8 on day 23 of the same 30-day season.`);
  }

  console.log('\n== (i) obstacle clearing: Jade for resources and builder time');
  {
    let jade = 0, acorns = 0, dew = 0, secs = 0, n = 0;
    const kinds: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      const s = createNewVillage(T0 + i * 977_777, data);
      for (const b of s.buildings) {
        const def = B[b.type];
        if (def.category !== 'obstacle') continue;
        n++; kinds[b.type] = (kinds[b.type] ?? 0) + 1;
        jade += def.clear.moonstones; acorns += def.clear.cost.acorns ?? 0; dew += def.clear.cost.dew ?? 0; secs += def.clear.seconds;
      }
    }
    console.log(`20 new villages: ${(n / 20).toFixed(1)} obstacles each (${JSON.stringify(kinds)}), ${(jade / 20).toFixed(1)} Jade for ${(acorns / 20).toFixed(0)} Coins + ${(dew / 20).toFixed(0)} Prov and ${(secs / 20 / 60).toFixed(1)} builder-minutes; one-time (no respawn in sim/obstacles.ts). Price: ${(acorns / jade).toFixed(0)} Coins + ${(dew / jade).toFixed(0)} Prov per Jade; the Keep 1 top-up sells 1 Jade for ${(1000 / topUpOne(1000, data, 1)).toFixed(0)} resources, so clearing is ${(1000 / topUpOne(1000, data, 1) / ((acorns + dew) / jade)).toFixed(1)}x better than the top-up's rate in the other direction (a one-time 90 Jade, 18% of the starting 500).`);
  }

  console.log('\n== (j) is a top-up offered at 0 resources, and what caps it');
  {
    const s0 = craft(5, { acorns: 0, dew: 0, moonstones: 100_000 });
    const keep = s0.buildings.find((b) => b.type === 'elder_toadstool')!;
    const q = topUpQuote(s0, { type: 'upgrade', id: keep.id }, T0, data);
    console.log(`Keep 5 -> 6 (500k Coins, storage ${fmt(capacity(s0, data).acorns)}) from 0 Coins: quote ${q ? q.moonstones + ' Jade for ' + fmt(q.missing.acorns ?? 0) : 'null'}; rule: shortfallQuote returns null only when the FULL cost exceeds storage (village.ts shortfallQuote), so 100% of a cost can be bought.`);
  }
}
