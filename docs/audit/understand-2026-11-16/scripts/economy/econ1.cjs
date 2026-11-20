// Economy arithmetic over the live data files. Read-only.
const R = '/home/user/ninja-version-of-game-1/src/gameplay/data/';
const J = (f) => require(R + f + '.json');
const store = J('store'), economy = J('economy'), hall = J('hall').levels, B = J('buildings'), battle = J('battle');
const raids = J('raids'), troops = J('troops'), daily = J('daily'), pass = J('pass'), ranks = J('ranks'), social = J('social');
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
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));

console.log('=== PACKS ===');
for (const p of store.packs) console.log(p.id, p.name, '$' + p.usd, p.moonstones, 'Jade', (p.moonstones / p.usd).toFixed(1), 'Jade/$');
const st = store.stipend; console.log('stipend $' + st.usd, st.payments * st.jadePerPayment, 'Jade', (st.payments * st.jadePerPayment / st.usd).toFixed(1), 'Jade/$');
const premJade = pass.tiers.reduce((s, t) => s + (t.premium.moonstones || 0), 0), freeJade = pass.tiers.reduce((s, t) => s + (t.free.moonstones || 0), 0);
console.log('pass premium Jade', premJade, '$' + pass.usd, (premJade / pass.usd).toFixed(1), 'Jade/$ (Jade only)  free-track Jade', freeJade);
for (const r of offers.rules) console.log('offer', r.id, '$' + r.usd, JSON.stringify(r.contents), r.retired ? 'RETIRED' : '', 'jade-only/$', ((r.contents.moonstones || 0) / r.usd).toFixed(1));

console.log('\n=== SKIP CURVES ===');
for (const [label, s] of [['1m', 60], ['10m', 600], ['30m', 1800], ['1h', 3600], ['2h', 7200], ['4h', 14400], ['8h', 28800], ['12h', 43200], ['1d', 86400], ['2d', 172800], ['3d', 259200], ['5d', 432000], ['7d', 604800], ['10d', 864000], ['14d', 1209600]])
  console.log(label.padStart(4), 'skip', String(skip(s)).padStart(5), 'Jade', (skip(s) / (s / 3600)).toFixed(2).padStart(6), 'Jade/h   trainSkip@K5', tskip(s, 5), '@K10', tskip(s, 10), '@K15', tskip(s, 15));

// per-Keep economy
const keepLv = B.elder_toadstool.levels;
const maxAt = (k, type) => hall[k - 1].limits[type] || { count: 0, maxLevel: 0 };
console.log('\n=== PER KEEP: production, storage, Keep cost ===');
console.log('K | prodCoins/h | prodProv/h | capCoins | capProv | nextKeep cost | time h | hrs of prod | cost/cap | collector8h/cap | loot avg | lootCap');
const rows = [];
for (let k = 1; k <= 15; k++) {
  const lim = hall[k - 1].limits;
  const prod = (t) => { const l = lim[t]; return l ? l.count * (B[t].levels[l.maxLevel - 1]?.ratePerHour || 0) : 0; };
  const cap = (res) => {
    let c = keepLv[k - 1].storage?.[res] || 0;
    for (const t of ['acorn_silo', 'dew_cistern']) { const l = lim[t]; if (l) c += l.count * (B[t].levels[l.maxLevel - 1]?.storage?.[res] || 0); }
    return c;
  };
  const pa = prod('acorn_orchard'), pd = prod('dewdrop_well'), ca = cap('acorns'), cd = cap('dew');
  const nk = keepLv[k]; const cost = nk ? (nk.cost.acorns || 0) + (nk.cost.dew || 0) : 0; const secs = nk ? nk.buildSeconds : 0;
  const gl = battle.generatedLootByHall[k - 1]; const lootAvg = (gl.min + gl.max) / 2;
  rows.push({ k, pa, pd, ca, cd, cost, secs, lootAvg, lootMin: gl.min, lootMax: gl.max });
  console.log(String(k).padStart(2), fmt(pa).padStart(8), fmt(pd).padStart(8), fmt(ca).padStart(8), fmt(cd).padStart(8), nk ? JSON.stringify(nk.cost).padStart(22) : '-'.padStart(22), (secs / 3600).toFixed(1).padStart(6), (cost / (pa || 1)).toFixed(1).padStart(6), (cost / ca).toFixed(2).padStart(5), ((pa * 8) / ca).toFixed(2).padStart(5), fmt(lootAvg).padStart(8), fmt(raids.storageLootCapByHall[k - 1]).padStart(8), 'gl', JSON.stringify(gl));
}

console.log('\n=== PER KEEP: new upgrade demand unlocked at this Keep (cost by currency, builder hours), most expensive single item vs storage ===');
let prevLim = {};
const cum = { acorns: 0, dew: 0, secs: 0 };
for (let k = 1; k <= 15; k++) {
  const lim = hall[k - 1].limits; const add = { acorns: 0, dew: 0, secs: 0 }; let maxItem = { c: 0, t: '' }; let maxSecs = { s: 0, t: '' };
  for (const [t, l] of Object.entries(lim)) {
    const def = B[t]; if (!def) continue; if (def.category === 'decor' || def.category === 'builder') continue;
    const p = prevLim[t] || { count: 0, maxLevel: 0 };
    // existing count p.count upgrade from p.maxLevel to l.maxLevel; new ones from 0 to l.maxLevel
    const lvCost = (from, to) => { let a = 0, d = 0, s = 0; for (let i = from; i < to; i++) { const L = def.levels[i]; if (!L) continue; a += L.cost.acorns || 0; d += L.cost.dew || 0; s += L.buildSeconds || 0; const c = (L.cost.acorns || 0) + (L.cost.dew || 0); if (c > maxItem.c) maxItem = { c, t: t + ' L' + (i + 1), res: L.cost.acorns ? 'acorns' : 'dew' }; if ((L.buildSeconds || 0) > maxSecs.s) maxSecs = { s: L.buildSeconds, t: t + ' L' + (i + 1) }; } return { a, d, s }; };
    const up = lvCost(p.maxLevel, l.maxLevel), nw = lvCost(0, l.maxLevel);
    add.acorns += up.a * p.count + nw.a * (l.count - p.count); add.dew += up.d * p.count + nw.d * (l.count - p.count); add.secs += up.s * p.count + nw.s * (l.count - p.count);
  }
  // keep upgrade itself
  const nk = keepLv[k]; if (nk) { add.acorns += nk.cost.acorns || 0; add.dew += nk.cost.dew || 0; add.secs += nk.buildSeconds; }
  cum.acorns += add.acorns; cum.dew += add.dew; cum.secs += add.secs;
  const r = rows[k - 1];
  console.log(String(k).padStart(2), 'coins', fmt(add.acorns).padStart(8), 'prov', fmt(add.dew).padStart(8), 'builder-days', (add.secs / 86400).toFixed(1).padStart(6), '| days of prod: coins', (add.acorns / (r.pa * 24 || 1)).toFixed(1).padStart(5), 'prov', (add.dew / (r.pd * 24 || 1)).toFixed(1).padStart(5), '| max item', maxItem.t, fmt(maxItem.c), '=', (maxItem.c / (maxItem.res === 'dew' ? r.cd : r.ca)).toFixed(2), 'of cap | longest', maxSecs.t, (maxSecs.s / 3600).toFixed(1) + 'h');
  prevLim = lim;
}
console.log('cumulative', fmt(cum.acorns), fmt(cum.dew), 'builder-days', (cum.secs / 86400).toFixed(0));

console.log('\n=== TOP-UP: Jade per hour of income; rush next Keep; Jade per raid of loot ===');
let rushTotal = 0, rushSkipOnly = 0;
for (const r of rows) {
  const k = r.k; const nk = keepLv[k];
  const perHour = topUp(r.pa, k);
  const rush = nk ? topUp(nk.cost.acorns || 0, k) + skip(nk.buildSeconds) : 0; rushTotal += rush; rushSkipOnly += nk ? skip(nk.buildSeconds) : 0;
  console.log(String(k).padStart(2), 'scale', store.topUpScaleByHall[k - 1], 'Jade/h-income', perHour, 'Jade/raid-loot', topUp(r.lootAvg, k), 'rush next Keep', rush, '(topup', nk ? topUp(nk.cost.acorns || 0, k) : 0, '+ skip', nk ? skip(nk.buildSeconds) : 0, ') 24h skip 180; Jade per 24h income via topup', topUp(r.pa * 24, k), 'starter-pack-equivalent: 100 Jade buys', '?');
}
console.log('rush all Keeps 1->15 Jade:', rushTotal, 'skip part', rushSkipOnly, ' $ at Hoard rate (75/$):', (rushTotal / 75).toFixed(0), ' at Box rate (60/$):', (rushTotal / 60).toFixed(0));

console.log('\n=== What 100/280/600/1300/7500 Jade buys at each Keep (resources via top-up inverse, hours of building skip) ===');
function invTopUp(jade, k) { // largest amount whose price <= jade
  let lo = 0, hi = 1e12; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (topUp(m, k) <= jade) lo = m; else hi = m; } return lo;
}
function invSkip(jade) { let lo = 0, hi = 1e9; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (skip(m) <= jade) lo = m; else hi = m; } return lo; }
for (const j of [45, 100, 280, 360, 600, 1300, 3500, 7500]) {
  let line = String(j).padStart(5) + ' Jade: skip ' + (invSkip(j) / 3600).toFixed(1) + 'h | topup hours-of-income:';
  for (const k of [1, 3, 5, 8, 10, 12, 15]) line += ' K' + k + ' ' + (invTopUp(j, k) / rows[k - 1].pa).toFixed(1) + 'h';
  console.log(line);
}
