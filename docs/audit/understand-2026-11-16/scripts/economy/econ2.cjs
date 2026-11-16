// Second pass: armies, research, reward sizes in hours of production, free Jade, whale ceiling.
const R = '/home/user/ninja-version-of-game-1/src/gameplay/data/';
const J = (f) => require(R + f + '.json');
const store = J('store'), economy = J('economy'), hall = J('hall').levels, B = J('buildings'), battle = J('battle');
const raids = J('raids'), T = J('troops'), daily = J('daily'), pass = J('pass'), ranks = J('ranks'), social = J('social');
const trials = J('trials'), ach = J('achievements'), events = J('events'), cosmetics = J('cosmetics'), offers = J('offers');
function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; if (x <= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0); }
  const [x0, y0] = points[points.length - 2], [x1, y1] = points[points.length - 1];
  return y1 + ((x - x1) * (y1 - y0)) / (x1 - x0);
}
const skip = (s) => (s <= 0 ? 0 : Math.max(1, Math.ceil(interp(store.skipCurve, s))));
const tskip = (s, k) => (s <= 0 ? 0 : Math.max(1, Math.ceil(interp(store.trainingSkipCurve, s) * Math.max(1, store.trainingSkipScaleByHall[k - 1]))));
const topUp = (amt, k) => (amt <= 0 ? 0 : Math.max(1, Math.ceil(interp(store.topUpCurve, amt / store.topUpScaleByHall[k - 1]))));
const fmt = (n) => (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));
const rs = economy.rewardScaleByHall;
const prodAt = (k) => { const l = hall[k - 1].limits.acorn_orchard; return l.count * B.acorn_orchard.levels[l.maxLevel - 1].ratePerHour; };
const housingAt = (k) => { const l = hall[k - 1].limits.army_camp; return l.count * B.army_camp.levels[l.maxLevel - 1].housing; };
const dojoSpeed = (k) => { const l = hall[k - 1].limits.burrow_barracks; return B.burrow_barracks.levels[l.maxLevel - 1].trainingSpeed || 1; };
const capLv = (k, t) => Math.max(1, Math.min(T[t].levels.length, hall[k - 1].troopLevelCap - (T[t].levelCapOffset || 0)));

console.log('=== ARMY (bot mix at Keep cap level, full housing): cost in Provisions, train time, vs loot ===');
for (let k = 1; k <= 15; k++) {
  const mix = raids.botArmyMix[k - 1]; const H = housingAt(k);
  let cost = 0, secs = 0;
  for (const [t, share] of Object.entries(mix)) { const n = Math.floor((H * share) / T[t].housing); const lv = capLv(k, t); cost += n * (T[t].levels[lv - 1].cost.dew || 0); secs += n * T[t].trainSeconds; }
  const sp = dojoSpeed(k); const tsec = secs / sp;
  const gl = battle.generatedLootByHall[k - 1]; const avg = (gl.min + gl.max) / 2;
  const fee = battle.scoutFeeByHall[k - 1];
  console.log(String(k).padStart(2), 'housing', H, 'army cost', fmt(cost).padStart(8), 'Prov; train', (tsec / 3600).toFixed(2) + 'h (dojo x' + sp + ')', '| avg loot each res', fmt(avg), '| army/loot', (cost / avg).toFixed(2), '| net Prov/raid at 100%', fmt(avg - cost), '| at 60% loot', fmt(avg * 0.6 - cost), '| army = h of Prov prod', (cost / prodAt(k)).toFixed(2), '| finish army Jade', tskip(tsec, k), '| scoutFee', fee, '=', (fee / avg * 100).toFixed(1) + '% loot', '| loot/h-prod', (avg / prodAt(k)).toFixed(1));
}

console.log('\n=== RESEARCH: cost to bring bot-mix + every warrior to Keep cap, newly at each Keep (Provisions), lane-days ===');
let prevCap = {};
for (let k = 1; k <= 15; k++) {
  let mixCost = 0, mixSecs = 0, allCost = 0, allSecs = 0, coinCost = 0;
  const mix = raids.botArmyMix[k - 1];
  for (const [t, def] of Object.entries(T)) {
    if ((def.unlockKeep || 1) > k) continue;
    const to = capLv(k, t); const from = prevCap[t] || 1;
    for (let lv = from + 1; lv <= to; lv++) { const r = def.levels[lv - 1].research; if (!r) continue; const c = (r.cost.dew || 0); const cc = (r.cost.acorns || 0); allCost += c; coinCost += cc; allSecs += r.seconds; if (mix[t]) { mixCost += c + cc; mixSecs += r.seconds; } }
    prevCap[t] = to;
  }
  // mix troops of this keep that were newly unlocked need research from 1
  const lanes = hall[k - 1].researchLanes; const p = prodAt(k);
  console.log(String(k).padStart(2), 'mix research', fmt(mixCost).padStart(8), '=', (mixCost / (p * 24)).toFixed(1), 'd of Prov prod,', (mixSecs / 86400 / lanes).toFixed(1), 'lane-days/' + lanes, '| full roster', fmt(allCost).padStart(8), '(coins part ' + fmt(coinCost) + ') =', (allCost / (p * 24)).toFixed(1), 'd prod,', (allSecs / 86400 / lanes).toFixed(1), 'days at', lanes, 'lanes; skip all', '~' + fmt(allSecs / 86400 * 103), 'Jade');
}

console.log('\n=== REWARD SIZES in hours of own (maxed-collector) production of ONE resource ===');
const chestEV = (() => { const o = daily.chest.outcomes; const tw = o.reduce((s, x) => s + x.weight, 0); let a = 0, d = 0, j = 0; for (const x of o) { a += (x.reward.acorns || 0) * x.weight / tw; d += (x.reward.dew || 0) * x.weight / tw; j += (x.reward.moonstones || 0) * x.weight / tw; } return { a, d, j }; })();
console.log('chest EV base', chestEV);
const calRes = daily.calendar.days.reduce((s, d) => s + ((d.reward?.acorns || 0) + (d.reward?.dew || 0)), 0), calJade = daily.calendar.days.reduce((s, d) => s + (d.reward?.moonstones || 0), 0);
console.log('calendar 28-day totals: resources(base, both)', calRes, 'Jade', calJade, 'repeat', daily.calendar.repeatJade);
const passFree = pass.tiers.reduce((s, t) => s + (t.free.acorns || 0) + (t.free.dew || 0), 0), passPrem = pass.tiers.reduce((s, t) => s + (t.premium.acorns || 0) + (t.premium.dew || 0), 0);
console.log('pass free resources base', passFree, 'premium', passPrem);
const bounty = events.schedule.find((e) => e.goal).goal.ladder; const bountyRes = bounty.reduce((s, x) => s + (x.reward.acorns || 0) + (x.reward.dew || 0), 0), bountyJade = bounty.reduce((s, x) => s + (x.reward.moonstones || 0), 0);
console.log('bounty ladder base both res', bountyRes, 'Jade', bountyJade);
console.log('K | prod/h | chest EV (coins+prov) h-of-total-prod | streak7 chest | calendar avg day h | calendar 28d total h | pass free total h | pass prem total h (Jade equiv by topup) | bounty all h | war win h | trial reward(tier at keep) h | defenseWin h | rematch 3* h | league chest (Iron) h');
for (let k = 1; k <= 15; k++) {
  const p = prodAt(k) * 2; // both resources per hour
  const s = rs[k - 1];
  const chest = (chestEV.a + chestEV.d) * s;
  const calDay = calRes * s / 24; // 24 resource days
  const gl = battle.generatedLootByHall[k - 1];
  const trial = Math.floor(gl.min * trials.rewardShareOfRaidLoot * (1 + trials.rewardLog2Growth * Math.log2(k * 4))) * 2;
  const defWin = gl.min * raids.defenseWin.shareOfRaidLoot * 2;
  const rem = gl.min * raids.rematch.shareOfRaidLoot * 2;
  // premium pass resources as Jade by topup: per tier
  let premJadeEq = 0; for (const t of pass.tiers) { for (const r of ['acorns', 'dew']) if (t.premium[r]) premJadeEq += topUp(Math.round(t.premium[r] * s), k); }
  let freeJadeEq = 0; for (const t of pass.tiers) { for (const r of ['acorns', 'dew']) if (t.free[r]) freeJadeEq += topUp(Math.round(t.free[r] * s), k); }
  console.log(String(k).padStart(2), fmt(p / 2).padStart(7), '| chest', (chest / p).toFixed(2), '| x1.6', (chest * 1.6 / p).toFixed(2), '| calDay', (calDay / p).toFixed(2), '| cal28', (calRes * s / p).toFixed(1), '| passFree', (passFree * s / p).toFixed(1), '(' + freeJadeEq + 'J)', '| passPrem', (passPrem * s / p).toFixed(1), '(' + premJadeEq + 'J +340)', '| bounty', (bountyRes * s / p).toFixed(1), '| warWin', (300000 * s / p).toFixed(1), '| trial', (trial / p).toFixed(2), '| defWin', (defWin / p).toFixed(3), '| rematch', (rem / p).toFixed(2), '| leagueIron', (300000 * s / p).toFixed(1), '| raid(avg both)', ((gl.min + gl.max) / p).toFixed(1));
}

console.log('\n=== FREE JADE / 30 days (daily player) ===');
const chestJ = chestEV.j * 30, streakJ = (5 / 7) * 30;
const cal1 = calJade * 30 / 28, cal2 = (calJade + daily.calendar.repeatJade) * 30 / 28;
const passJ = pass.tiers.reduce((s, t) => s + (t.free.moonstones || 0), 0);
const passHalf = pass.tiers.filter((t) => t.tier <= 15).reduce((s, t) => s + (t.free.moonstones || 0), 0);
const bountyJ = bountyJade * 30 / 14;
const war = social.groveRaid.rewards; const warEV = (0.45 * war.win.moonstones + 0.1 * war.draw.moonstones + 0.45 * war.loss.moonstones) * 30 / 7;
console.log({ chestJ, streakJ, calFirstCycle: cal1, calLater: cal2, passFreeAll30: passJ, passFree15: passHalf, bountyBoth3Star: bountyJ, bounty2Star: 10 * 30 / 14, warEV, warAllWins: war.win.moonstones * 30 / 7, warAllLoss: war.loss.moonstones * 30 / 7 });
for (const [name, lg] of [['casual: Cedar, pass 15 tiers, bounty 2*, war losses', { lg: 25, pass: passHalf, b: 10 * 30 / 14, w: war.loss.moonstones * 30 / 7 }], ['regular: Iron, pass 30, bounty 3*, war EV', { lg: 50, pass: passJ, b: bountyJ, w: warEV }], ['engaged: Obsidian, pass 30, bounty 3*, war all wins', { lg: 100, pass: passJ, b: bountyJ, w: war.win.moonstones * 30 / 7 }], ['top: Kage', { lg: 200, pass: passJ, b: bountyJ, w: war.win.moonstones * 30 / 7 }]]) {
  const t1 = chestJ + streakJ + cal1 + lg.pass + lg.b + lg.w + lg.lg, t2 = chestJ + streakJ + cal2 + lg.pass + lg.b + lg.w + lg.lg;
  console.log(name, '=> first cycle', t1.toFixed(0), 'later', t2.toFixed(0), ' = $', (t2 / 60).toFixed(2), 'at Box rate; skip hours (7d rate 4.29 J/h):', (t2 / 4.29).toFixed(0), 'h');
}
console.log('one-time: start', economy.startingResources.moonstones, 'obstacles', 26 * 3.5, 'achievements', ach.reduce((s, a) => s + a.tiers.reduce((x, t) => x + t[1], 0), 0), 'trials(60 tiers)', 6 * trials.jadeReward);
const early = ach.map((a) => [a.id, a.tiers.slice(0, 2)]);
console.log('early achievement tiers', JSON.stringify(early));

console.log('\n=== JADE SINKS (complete list from code): builders, skins, skips, top-ups ===');
console.log('builders', economy.builderHutCosts, 'sum', economy.builderHutCosts.reduce((a, b) => a + b, 0));
console.log('skins', cosmetics.hallSkins.filter((s) => s.moonstones > 0).map((s) => `${s.id}:${s.moonstones}@K${s.minKeep || 1}`).join(' '), 'sum', cosmetics.hallSkins.reduce((a, s) => a + s.moonstones, 0));
// whale ceiling: skip every building timer + research timer
let bsec = 0, bJade = 0, n = 0; let prev = {};
for (let k = 1; k <= 15; k++) {
  const lim = hall[k - 1].limits; let kJ = 0, kS = 0;
  for (const [t, l] of Object.entries(lim)) { const def = B[t]; if (!def || def.category === 'decor' || def.category === 'builder') continue; const p = prev[t] || { count: 0, maxLevel: 0 };
    for (let i = 0; i < l.maxLevel; i++) { const L = def.levels[i]; if (!L) continue; const cnt = i < p.maxLevel ? l.count - p.count : l.count; if (cnt <= 0 || !L.buildSeconds) continue; kJ += cnt * skip(L.buildSeconds); kS += cnt * L.buildSeconds; n += cnt; } }
  const nk = B.elder_toadstool.levels[k]; if (nk) { kJ += skip(nk.buildSeconds); kS += nk.buildSeconds; }
  bJade += kJ; bsec += kS; prev = lim;
  console.log('Keep', k, 'skip every timer unlocked here:', fmt(kJ), 'Jade for', (kS / 86400).toFixed(1), 'builder-days  => $' + (kJ / 75).toFixed(0), 'at Hoard rate; with 5 builders', (kS / 86400 / 5).toFixed(1), 'days');
}
console.log('TOTAL building skips', fmt(bJade), 'Jade, builder-days', (bsec / 86400).toFixed(0), ' $', (bJade / 75).toFixed(0));
let rJ = 0, rS = 0; for (const def of Object.values(T)) for (const L of def.levels) if (L.research) { rJ += skip(L.research.seconds); rS += L.research.seconds; }
console.log('TOTAL research skips', fmt(rJ), 'Jade, lane-days', (rS / 86400).toFixed(0), ' $', (rJ / 75).toFixed(0));
console.log('longest research', Math.max(...Object.values(T).flatMap((d) => d.levels.map((L) => L.research?.seconds || 0))) / 3600, 'h');
