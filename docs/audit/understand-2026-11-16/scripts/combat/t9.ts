import { REPO, defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, run, mean } from './common.ts';
const { squadPlan } = await import(`${REPO}/src/gameplay/control/squadPlan`);
const { pointIntel } = await import(`${REPO}/src/gameplay/sim/battle/scout`);
// Does the scout's per-point intel (defences covering the walk) predict the best point? And maxed bases (bias 1).
const keep = Number(process.argv[2] ?? 10);
for (const bias of [0.5, 1]) {
  const army = botArmy(keep, 1, data); const levels = levelsFor(army, keep); const hero = heroAtKeep(keep, data);
  let hit = 0, n = 0; const best: number[] = [], meanD: number[] = [], intelPick: number[] = [], stars: number[] = []; const rhos: number[] = [];
  for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
    const base = generateOpponent(9900 + i * 7919 + keep * 131, keep, data, { levelBias: bias, layout });
    const setup = { seed: 1000 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, data);
    const intel = pointIntel(probe.entry.points, base, data);
    const res = probe.entry.points.map((_: any, p: number) => {
      const dep = squadPlan(probe, { point: p, formation: 'together', order: 'tanks' }).map((st: any) => ({ tick: st.delay, troop: st.troop, x: st.x, y: st.y }));
      if (hero) dep.push({ tick: 5, troop: hero.id, x: Math.floor(probe.entry.points[p].x), y: Math.floor(probe.entry.points[p].y) });
      return run(setup, dep).r;
    });
    const d = res.map((r: any) => r.destruction);
    const bestI = d.indexOf(Math.max(...d));
    const minDef = Math.min(...intel.map((x: any) => x.defenses));
    const picks = intel.map((x: any, k: number) => (x.defenses === minDef ? k : -1)).filter((k: number) => k >= 0);
    intelPick.push(mean(picks.map((k: number) => d[k])));
    if (picks.includes(bestI)) hit += 1 / picks.length; n++;
    best.push(Math.max(...d)); meanD.push(mean(d)); stars.push(Math.max(...res.map((r: any) => r.stars)));
    // Spearman-ish: correlation between defence count and destruction
    const xs = intel.map((x: any) => x.defenses); const mx = mean(xs), my = mean(d);
    const cov = mean(xs.map((x: number, k: number) => (x - mx) * (d[k] - my))); const sx = Math.sqrt(mean(xs.map((x: number) => (x - mx) ** 2))), sy = Math.sqrt(mean(d.map((y: number) => (y - my) ** 2)));
    if (sx > 0 && sy > 0) rhos.push(cov / (sx * sy));
  }
  console.log(`Keep ${keep} bias ${bias}: mean point ${mean(meanD).toFixed(1)}%, best point ${mean(best).toFixed(1)}% (${mean(stars).toFixed(2)}*), point the scout intel favours (fewest covering defences) ${mean(intelPick).toFixed(1)}%; intel picks the best point ${(100 * hit / n).toFixed(0)}% (chance ${(100 / 6).toFixed(0)}%); corr(defences on the walk, destruction) ${mean(rhos).toFixed(2)}`);
}
