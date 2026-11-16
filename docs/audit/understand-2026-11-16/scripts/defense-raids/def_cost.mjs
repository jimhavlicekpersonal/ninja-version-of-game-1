// Cumulative Coins (and build seconds) of every defensive building at a Keep, at level 1, caps-2, caps-1 and caps.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = '/home/user/ninja-version-of-game-1/src/gameplay/data/';
const bd = require(R + 'buildings.json');
const hall = require(R + 'hall.json');
const battle = require(R + 'battle.json');
const raids = require(R + 'raids.json');
const DEF = new Set(['defense', 'trap', 'hedge', 'support']);
function cum(type, level) {
  let c = 0, s = 0, p = 0;
  for (let l = 1; l <= level; l++) {
    const lv = bd[type].levels[l - 1];
    if (!lv) break;
    c += lv.cost?.acorns ?? 0;
    p += lv.cost?.dew ?? 0;
    s += lv.buildSeconds ?? lv.seconds ?? lv.time ?? 0;
  }
  return { c, s, p };
}
console.log('level keys', Object.keys(bd.acorn_cannon.levels[3]));
const rows = [];
for (const K of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
  const lim = hall.levels[K - 1].limits;
  const tot = { l1: 0, m2: 0, m1: 0, cap: 0, sCap: 0, sM2: 0, walls: 0 };
  for (const [t, l] of Object.entries(lim)) {
    const d = bd[t];
    if (!d || !DEF.has(d.category)) continue;
    const n = l.count;
    const a = cum(t, 1), b = cum(t, Math.max(1, l.maxLevel - 2)), c = cum(t, Math.max(1, l.maxLevel - 1)), e = cum(t, l.maxLevel);
    tot.l1 += n * a.c; tot.m2 += n * b.c; tot.m1 += n * c.c; tot.cap += n * e.c;
    if (d.category === 'hedge') tot.walls += n * e.c; else { tot.sCap += n * e.s; tot.sM2 += n * b.s; }
  }
  const next = bd.elder_toadstool.levels[K]?.cost?.acorns ?? 0;
  rows.push({ K, ...tot, next });
  console.log(`K${K}: lvl1 ${(tot.l1 / 1e6).toFixed(2)}M | caps-2 ${(tot.m2 / 1e6).toFixed(1)}M | caps-1 ${(tot.m1 / 1e6).toFixed(1)}M | caps ${(tot.cap / 1e6).toFixed(1)}M (walls ${(tot.walls / 1e6).toFixed(1)}M) | builder-days to caps (no walls) ${(tot.sCap / 86400).toFixed(0)}, to caps-2 ${(tot.sM2 / 86400).toFixed(0)} | next Keep ${(next / 1e6).toFixed(2)}M | held reward today ${(2 * Math.floor(battle.generatedLootByHall[K - 1].min * raids.defenseWin.shareOfRaidLoot) / 1e3).toFixed(0)}k`);
}
// Incremental: bringing defenses from Keep K-1 caps-2 to Keep K caps-2
for (let i = 1; i < rows.length; i++) console.log(`K${rows[i].K}: incremental Coins caps-2(K-1) -> caps-2(K): ${((rows[i].m2 - rows[i - 1].m2) / 1e6).toFixed(1)}M; caps(K-1) -> caps(K): ${((rows[i].cap - rows[i - 1].cap) / 1e6).toFixed(1)}M; next Keep costs ${(rows[i].next / 1e6).toFixed(1)}M`);
