import { REPO, defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, run, mean } from './common.ts';
const { squadPlan } = await import(`${REPO}/src/gameplay/control/squadPlan`);
const { pointIntel } = await import(`${REPO}/src/gameplay/sim/battle/scout`);
// Which cheap, honest scouting metric predicts the best Infiltration Point? Within-base correlation with destruction.
const keep = Number(process.argv[2] ?? 10);
const corr = (xs: number[], ys: number[]) => { const mx = mean(xs), my = mean(ys); const c = mean(xs.map((x, k) => (x - mx) * (ys[k] - my))); const sx = Math.sqrt(mean(xs.map((x) => (x - mx) ** 2))), sy = Math.sqrt(mean(ys.map((y) => (y - my) ** 2))); return sx > 0 && sy > 0 ? c / (sx * sy) : NaN; };
for (const bias of [0.5, 1]) {
  const army = botArmy(keep, 1, data); const levels = levelsFor(army, keep); const hero = heroAtKeep(keep, data);
  const M: Record<string, { rho: number[]; pick: number[]; hit: number }> = {};
  const best: number[] = []; const avg: number[] = [];
  for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
    const base = generateOpponent(9900 + i * 7919 + keep * 131, keep, data, { levelBias: bias, layout });
    const setup = { seed: 1000 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, data);
    const pts = probe.entry.points;
    const d = pts.map((_: any, p: number) => {
      const dep = squadPlan(probe, { point: p, formation: 'together', order: 'tanks' }).map((st: any) => ({ tick: st.delay, troop: st.troop, x: st.x, y: st.y }));
      if (hero) dep.push({ tick: 5, troop: hero.id, x: Math.floor(pts[p].x), y: Math.floor(pts[p].y) });
      return run(setup, dep).r.destruction;
    });
    best.push(Math.max(...d)); avg.push(mean(d));
    const defs = probe.buildings.filter((b: any) => b.kind === 'defense' && b.combat);
    const dps = (b: any) => b.combat.damage * 10 / b.combat.fireIntervalTicks * (b.combat.splashRadius ? 3 : 1);
    const cen = (b: any) => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 });
    const hall = probe.buildings.find((b: any) => b.kind === 'hall'); const hc = cen(hall);
    const countable = probe.buildings.filter((b: any) => b.kind !== 'hedge' && b.kind !== 'trap');
    const metrics: Record<string, number[]> = {
      // live intel: fewer covering defences should be better -> negate so "higher = better" for every metric
      live_intel: pointIntel(pts, base, data).map((x: any) => -x.defenses),
      // threat near the landing: ground-capable defence DPS within (range + 4) tiles of the point
      landing_dps: pts.map((p: any) => -defs.filter((b: any) => b.combat.targets !== 'air' && Math.hypot(cen(b).x - p.x, cen(b).y - p.y) <= b.combat.range + 4).reduce((s: number, b: any) => s + dps(b), 0)),
      // nearest defence distance (farther = safer start)
      nearest_def: pts.map((p: any) => Math.min(...defs.map((b: any) => Math.hypot(cen(b).x - p.x, cen(b).y - p.y)))),
      // free buildings: countable buildings within 8 tiles of the point that no ground defence covers
      free_bldgs: pts.map((p: any) => countable.filter((b: any) => Math.hypot(cen(b).x - p.x, cen(b).y - p.y) <= 8 && !defs.some((q: any) => q.combat.targets !== 'air' && Math.hypot(cen(q).x - cen(b).x, cen(q).y - cen(b).y) <= q.combat.range)).length),
      // buildings near the point (anything to chew on close by)
      bldgs_8: pts.map((p: any) => countable.filter((b: any) => Math.hypot(cen(b).x - p.x, cen(b).y - p.y) <= 8).length),
      keep_dist: pts.map((p: any) => -Math.hypot(hc.x - p.x, hc.y - p.y)),
      walls_on_walk: pts.map((p: any) => { let n = 0; for (let s = 0; s <= 20; s++) { const x = Math.floor(p.x + (hc.x - p.x) * s / 20), y = Math.floor(p.y + (hc.y - p.y) * s / 20); if (probe.grid.cells[y * probe.grid.size + x] === 2) n++; } return -n; }),
    };
    for (const [name, xs] of Object.entries(metrics)) {
      const m = (M[name] ??= { rho: [], pick: [], hit: 0 });
      const r = corr(xs, d); if (!Number.isNaN(r)) m.rho.push(r);
      const top = Math.max(...xs); const picks = xs.map((x, k) => (x === top ? k : -1)).filter((k) => k >= 0);
      m.pick.push(mean(picks.map((k) => d[k])));
    }
  }
  console.log(`Keep ${keep} bias ${bias}: mean point ${mean(avg).toFixed(1)}%, best point ${mean(best).toFixed(1)}%`);
  for (const [name, m] of Object.entries(M)) console.log(`   ${name.padEnd(14)} corr ${mean(m.rho).toFixed(2)}  point it picks scores ${mean(m.pick).toFixed(1)}% (gain over mean ${(mean(m.pick) - mean(avg)).toFixed(1)})`);
}
