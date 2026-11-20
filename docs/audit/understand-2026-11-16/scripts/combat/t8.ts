import { REPO, defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, run, triples, mean, botDeployments, createRng } from './common.ts';
const { squadPlan } = await import(`${REPO}/src/gameplay/control/squadPlan`);
// Skill ceiling: the game's own bot plan (random side) vs every Infiltration Point x 9 squad orders.
const formations = ['together', 'pincer', 'file']; const orders = ['tanks', 'rush', 'reserve'];
for (const keep of [6, 10, 15]) {
  const army = botArmy(keep, 1, data); const levels = levelsFor(army, keep); const hero = heroAtKeep(keep, data);
  const bot: number[] = [], bestPt: number[] = [], bestAll: number[] = [], worstAll: number[] = [], botStars: number[] = [], bestStars: number[] = [];
  const byOrder: Record<string, number[]> = {}; const reasons: Record<string, number> = {};
  for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
    const base = generateOpponent(9900 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
    const setup = { seed: 1000 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, data);
    // the game's bot plan, 3 rng seeds (random side each), hero dropped with the first squad
    for (let s = 0; s < 3; s++) {
      const dep = botDeployments(probe.deployable, probe.grid.size, army, createRng(13 + s), data, levels, probe.entry);
      if (hero) dep.push({ tick: 5, troop: hero.id, x: dep[0].x, y: dep[0].y });
      const r = run(setup, dep).r; bot.push(r.destruction); botStars.push(r.stars); reasons[r.endReason] = (reasons[r.endReason] ?? 0) + 1;
    }
    let best = 0, worst = 100, bestS = 0; let bestTogetherTanks = 0;
    for (let p = 0; p < probe.entry.points.length; p++) for (const f of formations) for (const o of orders) {
      const steps = squadPlan(probe, { point: p, formation: f, order: o });
      const dep = steps.map((st: any) => ({ tick: st.delay, troop: st.troop, x: st.x, y: st.y }));
      if (hero) dep.push({ tick: 5, troop: hero.id, x: Math.floor(probe.entry.points[p].x), y: Math.floor(probe.entry.points[p].y) });
      const r = run(setup, dep).r;
      (byOrder[`${f}/${o}`] ??= []).push(r.destruction);
      if (r.destruction > best) best = r.destruction; if (r.destruction < worst) worst = r.destruction; if (r.stars > bestS) bestS = r.stars;
      if (f === 'together' && o === 'tanks' && r.destruction > bestTogetherTanks) bestTogetherTanks = r.destruction;
    }
    bestPt.push(bestTogetherTanks); bestAll.push(best); worstAll.push(worst); bestStars.push(bestS);
  }
  console.log(`Keep ${keep} (10 bases): game bot plan ${mean(bot).toFixed(1)}% ${mean(botStars).toFixed(2)}* | best point, default order ${mean(bestPt).toFixed(1)}% | best point+order ${mean(bestAll).toFixed(1)}% ${mean(bestStars).toFixed(2)}* | worst ${mean(worstAll).toFixed(1)}% | bot end reasons ${JSON.stringify(reasons)}`);
  console.log('   mean by order over all points: ' + Object.entries(byOrder).map(([k, v]) => `${k} ${mean(v).toFixed(0)}`).join(', '));
}
