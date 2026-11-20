import { defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, run, triples, mean } from './common.ts';
// Entry-side lever: same army, same base, six "sides" (a point plus its two neighbours).
const t0 = Date.now();
for (const keep of [6, 10, 15]) {
  const army = botArmy(keep, 1, data); const levels = levelsFor(army, keep);
  const hero = heroAtKeep(keep, data);
  const spreads: number[] = []; const bests: number[] = []; const means: number[] = []; const worsts: number[] = []; const starsBest: number[] = []; const starsMean: number[] = [];
  for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
    const base = generateOpponent(9000 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
    const setup = { seed: 500 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, data);
    const res = triples(probe).map((pts) => run(setup, planFrom(probe, army, levels, pts, data, hero?.id)).r);
    const d = res.map((r) => r.destruction);
    spreads.push(Math.max(...d) - Math.min(...d)); bests.push(Math.max(...d)); means.push(mean(d)); worsts.push(Math.min(...d));
    starsBest.push(Math.max(...res.map((r) => r.stars))); starsMean.push(mean(res.map((r) => r.stars)));
  }
  console.log(`Keep ${keep}: n=${spreads.length} bases; mean side ${mean(means).toFixed(1)}%, best side ${mean(bests).toFixed(1)}%, worst ${mean(worsts).toFixed(1)}%, spread ${mean(spreads).toFixed(1)} pts; stars mean ${mean(starsMean).toFixed(2)} best ${mean(starsBest).toFixed(2)}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
}
