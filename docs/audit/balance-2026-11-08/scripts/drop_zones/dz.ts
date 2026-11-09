/**
 * Drop zones (Infiltration Points): (1) entry-side lever and whether the scout report predicts the best side;
 * (2) the closed-pair hash: moving ONE decor building flips which approaches are closed; how much that is worth.
 * node scratch/run.mjs scratch/drop_zones/dz.ts
 */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng, int } from '../../src/gameplay/sim/rng';
import { pointIntel } from '../../src/gameplay/sim/battle/scout';

function rngForSide(side: number, salt: number) {
  for (let s = salt * 1000; s < salt * 1000 + 5000; s++) {
    const r = createRng(s);
    if (int(r, 0, 3) === side) return createRng(s);
  }
  throw new Error('no seed');
}
function layoutHash(base: BaseLayout): number {
  let h = 0x811c9dc5;
  for (const b of base.buildings) {
    const s = `${b.type}@${b.x},${b.y};`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h;
}
function fight(base: BaseLayout, K: number, army: Record<string, number>, levels: Record<string, number>, side: number, seed: number) {
  const hero = heroAtKeep(K, data);
  const setup: BattleSetup = { seed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const plan = botDeployments(probe.deployable, probe.grid.size, army, rngForSide(side, seed % 97), data, levels, probe.entry);
  const { result } = runBattle(setup, plan, data);
  return { d: result.destruction, stars: result.stars, entry: probe.entry };
}

export default function main() {
  console.log('== (1) entry side lever, bot mix at caps + hero, bias 0.5, 5 layouts x 3 seeds');
  console.log('K | layout | mean per side 0..3 | best-worst spread (mean over bases) | least-covered side wins (hit rate) | rank corr(coverage, destruction) mean');
  for (const K of [6, 10, 15]) {
    const army = botArmy(K, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, data, t)]));
    let allSpread = 0, allHits = 0, allCorr = 0, n = 0;
    for (const L of LAYOUTS) {
      const sideMeans = [0, 0, 0, 0]; let spread = 0, hits = 0, corr = 0, m = 0;
      for (let s = 0; s < 3; s++) {
        const base = generateOpponent(50000 + K * 100 + s, K, data, { levelBias: 0.5, layout: L });
        const res = [0, 1, 2, 3].map((side) => fight(base, K, army, levels, side, 7 + s));
        const ds = res.map((r) => r.d);
        ds.forEach((d, i) => (sideMeans[i] += d / 3));
        spread += Math.max(...ds) - Math.min(...ds);
        // coverage of the 3 points nearest each side (as botDeployments ranks them)
        const entry = res[0].entry!;
        const intel = pointIntel(entry.points, base, data);
        const size = data.economy.mapSize;
        const cov = [0, 1, 2, 3].map((side) => {
          // side anchors as in botDeployments: 0 top (y=0), 1 right (x=size-1), 2 bottom, 3 left; use mid of edge
          const ex = side === 0 ? size / 2 : side === 1 ? size - 1 : side === 2 ? size / 2 : 0;
          const ey = side === 0 ? 0 : side === 1 ? size / 2 : side === 2 ? size - 1 : size / 2;
          const ranked = entry.points.map((p, i) => ({ i, d: (p.x - ex) ** 2 + (p.y - ey) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 3);
          return ranked.reduce((a, r) => a + ((intel[r.i] as any).defenses ?? (intel[r.i] as any).covering ?? (intel[r.i] as any).count ?? 0), 0);
        });
        const least = cov.indexOf(Math.min(...cov));
        if (ds[least] === Math.max(...ds)) hits++;
        // spearman over 4 sides
        const rank = (xs: number[]) => xs.map((x) => xs.filter((y) => y < x).length);
        const rc = rank(cov), rd = rank(ds);
        const mc = 1.5, md = 1.5;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < 4; i++) { num += (rc[i] - mc) * (rd[i] - md); da += (rc[i] - mc) ** 2; db += (rd[i] - md) ** 2; }
        corr += da && db ? num / Math.sqrt(da * db) : 0;
        m++;
      }
      console.log(`${K} | ${L.id.padEnd(12)} | ${sideMeans.map((x) => x.toFixed(0)).join(' / ')} | ${(spread / m).toFixed(1)} | ${hits}/${m} | ${(corr / m).toFixed(2)}`);
      allSpread += spread; allHits += hits; allCorr += corr; n += m;
    }
    console.log(`K${K} all: spread ${(allSpread / n).toFixed(1)}, least-covered-side-wins ${allHits}/${n}, mean rank corr ${(allCorr / n).toFixed(2)} (negative = less coverage, more destruction)`);
  }
  console.log('intel sample keys:', Object.keys((pointIntel(createBattle({ seed: 1, base: generateOpponent(1, 8, data, { levelBias: 0.5, layout: LAYOUTS[0] }), army: botArmy(8, 1, data), levels: {}, infiltration: true }, data).entry!.points, generateOpponent(1, 8, data, { levelBias: 0.5, layout: LAYOUTS[0] }), data)[0] as any)).join(','));

  console.log('\n== (2) closed pair flip by moving ONE Bonsai Planter (flower_bed): mean destruction over 4 sides x 2 seeds');
  for (const [K, li] of [[8, 0], [8, 1], [12, 1], [12, 3]] as [number, number][]) {
    const base0 = generateOpponent(61000 + K * 10 + li, K, data, { levelBias: 0.5, layout: LAYOUTS[li] });
    const army = botArmy(K, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, data, t)]));
    const size = data.economy.mapSize;
    const occupied = (x: number, y: number) => base0.buildings.some((b) => { const s = data.buildings[b.type].size; return x >= b.x - 1 && x < b.x + s + 1 && y >= b.y - 1 && y < b.y + s + 1; });
    const variants = new Map<number, BaseLayout>();
    for (let r = 2; r < 12 && variants.size < 4; r++) for (let x = 20 - r; x <= 20 + r && variants.size < 4; x++) for (let y = 20 - r; y <= 20 + r && variants.size < 4; y++) {
      if (Math.max(Math.abs(x - 20), Math.abs(y - 20)) !== r || occupied(x, y)) continue;
      const v: BaseLayout = { ...base0, buildings: [...base0.buildings, { id: 'decor', type: 'flower_bed', level: 1, x, y }] };
      const pair = layoutHash(v) % 4;
      if (!variants.has(pair)) variants.set(pair, v);
    }
    const rows: string[] = [];
    let best = -1, worst = 101;
    for (const [pair, v] of [...variants.entries()].sort((a, b) => a[0] - b[0])) {
      let sum = 0, m = 0;
      for (let s = 0; s < 2; s++) for (const side of [0, 1, 2, 3]) { sum += fight(v, K, army, levels, side, 11 + s).d; m++; }
      const mean = sum / m; best = Math.max(best, mean); worst = Math.min(worst, mean);
      const dec = v.buildings[v.buildings.length - 1];
      rows.push(`  closed pair ${pair} (planter at ${dec.x},${dec.y}): mean destruction ${mean.toFixed(1)}`);
    }
    console.log(`K${K} ${LAYOUTS[li].id}: hash%8 of the original = ${layoutHash(base0) % 8}`);
    rows.forEach((r) => console.log(r));
    console.log(`  spread best-worst closed pair: ${(best - worst).toFixed(1)} points`);
  }
}
