// Keep-scaled top-up prices: writes `topUpScaleByHall` into store.json.
//
// Buying missing Coins or Provisions with Jade goes through one curve
// (`topUpCurve`, priced for a Keep 5 village). The amount is first divided by
// the buyer's Keep scale, so the price follows the economy instead of absolute
// numbers. Without it, one raid's worth of loot cost 19 Jade at Keep 1 and
// 33,557 at Keep 15 (a 1,700x swing): early Keeps were a giveaway (the 500
// starting Jade bought ~16 raids) and late Keeps a trap (~900x worse than
// skipping training and raiding).
//
//   scale(keep) = (average raid loot at keep / average raid loot at Keep 5) ^ EXPONENT   (0.75 since P3-08)
//
// With EXPONENT 0.5 one raid's worth costs about 70 Jade at Keep 1, 268 at
// Keep 5 and 2,400 at Keep 15. Then, Keep by Keep, the scale is lowered where
// needed so that rushing the next Keep (buy its Coins + skip its timer) still
// costs more at every Keep (balance fix #20). Idempotent: run it again after
// changing loot, Keep costs or the curves.
//
// It also writes `trainingSkipScaleByHall` for finishing army training with
// Jade (its own formula since P3-08: a raid's price over 4.5 two-hour skips),
// so skip-and-raid farming is no longer a far cheaper route from Jade to
// resources than a top-up.
//
//   node tools/balance/topup.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const REF_KEEP = 5;
// P3-08 (ECO-04, CU-5, 2026-11-18): 0.5 -> 0.75. An hour of income cost 15 Jade at Keep 1 and 550 at Keep 15, and
// Keep-scaled offers were hollow late.
const EXPONENT = 0.75;

const read = (f) => JSON.parse(readFileSync(`src/gameplay/data/${f}.json`, 'utf8'));
const store = read('store');
const battle = read('battle');
const keep = read('buildings').elder_toadstool.levels;

function interpolate(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  const [x0, y0] = points[points.length - 2];
  const [x1, y1] = points[points.length - 1];
  return y1 + ((x - x1) * (y1 - y0)) / (x1 - x0);
}
const topUp = (amount, scale) => (amount <= 0 ? 0 : Math.max(1, Math.ceil(interpolate(store.topUpCurve, amount / scale))));
const skip = (s) => (s <= 0 ? 0 : Math.max(1, Math.ceil(interpolate(store.skipCurve, s))));

const loot = battle.generatedLootByHall.map((r) => (r.min + r.max) / 2);
const scales = loot.map((l) => Math.round((l / loot[REF_KEEP - 1]) ** EXPONENT * 1e4) / 1e4);

// Rushing from Keep k to k + 1 is priced at the buyer's Keep (k).
const rush = (k) => topUp(keep[k].cost.acorns ?? 0, scales[k - 1]) + skip(keep[k].buildSeconds);
for (let k = 2; k < keep.length; k++) {
  while (rush(k) <= rush(k - 1)) scales[k - 1] = Math.round(scales[k - 1] * 0.99 * 1e4) / 1e4;
}
// P3-08: the second rule. At 0.75 a raid's loot priced at 830 Jade at Keep 14 and 790 at Keep 15, and
// tests/gameplay/economy/topup.test.ts requires that price never to fall with the Keep: lower a Keep's scale until its
// raid price is at least the previous Keep's.
const raidPrice = (k) => topUp(loot[k - 1], scales[k - 1]);
for (let k = 2; k <= loot.length; k++) {
  let guard = 0;
  while (raidPrice(k) < raidPrice(k - 1) && guard++ < 5000) scales[k - 1] = Math.round(scales[k - 1] * 0.995 * 1e4) / 1e4;
}

store.topUpScaleByHall = scales;
// Finishing army training with Jade is the other way to turn Jade into resources (skip, raid,
// repeat). At a flat time price a Keep 15 army cost ~37 Jade to finish and looted what a top-up
// sells for ~2,400, so it scales the same way, never below the plain price.
// P3-08: its own formula (scripts/economy/econ3.cjs): a raid's price over 4.5 two-hour training skips, at least 1, held
// at 1 through Keep 5 and never falling with the Keep (it used to copy the top-up scale on every run).
const trainPlain = (sec) => Math.max(1, Math.ceil(interpolate(store.trainingSkipCurve, sec)));
const tSkip = [];
for (let k = 1; k <= loot.length; k++) {
  const v = k <= 5 ? 1 : Math.max(1, raidPrice(k) / (4.5 * trainPlain(7200)));
  tSkip.push(Math.round(Math.max(v, tSkip[k - 2] ?? 1) * 1e4) / 1e4);
}
store.trainingSkipScaleByHall = tSkip;
writeFileSync('src/gameplay/data/store.json', `${JSON.stringify(store, null, 2)}\n`);
console.log('Keep | scale | Jade per raid | rush next Keep');
for (let k = 1; k <= loot.length; k++) {
  console.log(`${String(k).padStart(4)} | ${scales[k - 1].toFixed(4).padStart(7)} | ${String(topUp(loot[k - 1], scales[k - 1])).padStart(6)} | ${k < keep.length ? rush(k) : '-'}`);
}
