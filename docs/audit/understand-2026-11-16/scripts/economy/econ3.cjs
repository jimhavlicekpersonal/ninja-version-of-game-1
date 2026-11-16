// What-if for CU-5: top-up scale exponent, with the tool's own "rush must rise" rule; training-skip scale held to a 4.5x ratio.
const R = '/home/user/ninja-version-of-game-1/src/gameplay/data/';
const J = (f) => require(R + f + '.json');
const store = J('store'), battle = J('battle'), B = J('buildings'), hall = J('hall').levels;
const keep = B.elder_toadstool.levels;
function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; if (x <= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0); }
  const [x0, y0] = points[points.length - 2], [x1, y1] = points[points.length - 1];
  return y1 + ((x - x1) * (y1 - y0)) / (x1 - x0);
}
const topUp = (amount, scale) => (amount <= 0 ? 0 : Math.max(1, Math.ceil(interp(store.topUpCurve, amount / scale))));
const skip = (s) => (s <= 0 ? 0 : Math.max(1, Math.ceil(interp(store.skipCurve, s))));
const tplain = (s) => Math.max(1, Math.ceil(interp(store.trainingSkipCurve, s)));
const loot = battle.generatedLootByHall.map((r) => (r.min + r.max) / 2);
const prod = (k) => { const l = hall[k - 1].limits.acorn_orchard; return l.count * B.acorn_orchard.levels[l.maxLevel - 1].ratePerHour; };
for (const EXP of [0.5, 0.65, 0.75, 0.85]) {
  const scales = loot.map((l) => Math.round((l / loot[4]) ** EXP * 1e4) / 1e4);
  const rush = (k) => topUp(keep[k].cost.acorns ?? 0, scales[k - 1]) + skip(keep[k].buildSeconds);
  for (let k = 2; k < keep.length; k++) { let guard = 0; while (rush(k) <= rush(k - 1) && guard++ < 2000) scales[k - 1] = Math.round(scales[k - 1] * 0.99 * 1e4) / 1e4; }
  let total = 0; const rows = [];
  for (let k = 1; k <= 15; k++) {
    const perRaid = topUp(loot[k - 1], scales[k - 1]); const perHour = topUp(prod(k), scales[k - 1]);
    const r = k < 15 ? rush(k) : 0; total += r;
    const tScale = Math.max(1, perRaid / (4.5 * tplain(7200)));
    rows.push('K' + k + ': scale ' + scales[k - 1] + ' raid ' + perRaid + 'J  1h-income ' + perHour + 'J  rush ' + r + '  finish-2h-army ' + Math.ceil(tplain(7200) * tScale) + 'J (tScale ' + tScale.toFixed(2) + ')  offerKeep res each ' + Math.round(40000 * scales[k - 1]) + ' = ' + (40000 * scales[k - 1] / prod(k)).toFixed(2) + 'h prod');
  }
  console.log('\n== EXPONENT ' + EXP + ' == rush 1->15 total ' + total + ' Jade ($' + (total / 75).toFixed(0) + '-' + (total / 60).toFixed(0) + ')');
  console.log(rows.filter((_, i) => [0, 2, 4, 6, 7, 9, 11, 13, 14].includes(i)).join('\n'));
}
