import { open } from './load.mjs';
const s = await open();
try {
  const { defaultData: data } = await s.load('/src/gameplay/sim/data.ts');
  const { BattleSession } = await s.load('/src/gameplay/control/battleSession.ts');
  const { runBattle, createBattle } = await s.load('/src/gameplay/sim/battle/battle.ts');
  const { generateOpponent } = await s.load('/src/gameplay/sim/battle/basegen.ts');
  const { botArmy } = await s.load('/src/gameplay/sim/matchmaking.ts');
  const { botDeployments } = await s.load('/src/gameplay/sim/defense.ts');
  const { troopLevelCapAt } = await s.load('/src/gameplay/sim/research.ts');
  const { createRng } = await s.load('/src/gameplay/sim/rng.ts');
  const { heroAtKeep } = await s.load('/src/gameplay/sim/heroes.ts');
  const formations = ['together', 'pincer', 'file'], orders = ['tanks', 'rush', 'reserve'];
  const keeps = (process.env.KEEPS ?? '9,12').split(',').map(Number);
  const NB = Number(process.env.BASES ?? 3);
  for (const keep of keeps) {
    const army = botArmy(keep, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const size = Object.values(army).reduce((a, b) => a + b, 0);
    const agg = {}; let botSum = 0, bestSum = 0, worstSum = 0, dropped = 0, runs = 0, bestHandSum = 0;
    for (let bi = 0; bi < NB; bi++) {
      const base = generateOpponent(9000 + bi * 7919 + keep * 131, keep, data, { levelBias: 0.5 });
      const setup = { seed: 500 + bi, base, army, levels, infiltration: true };
      const probe = createBattle(setup, data);
      const deps = botDeployments(probe.deployable, probe.grid.size, army, createRng(13 + bi), data, levels, probe.entry);
      const bot = runBattle(setup, deps, data).result;
      botSum += bot.destruction;
      const n = probe.entry.points.length;
      let best = -1, worst = 999, bestKey = '', bestFixed = {};
      for (const f of formations) for (const o of orders) {
        let bestPoint = -1;
        for (let p = 0; p < n; p++) {
          const sess = new BattleSession(structuredClone(setup), data, 'live');
          const ordered = sess.orderSquad({ point: p, formation: f, order: o });
          for (let i = 0; i < 4000 && !sess.sim.ended; i++) sess.update(100);
          const r = sess.result();
          runs++; if (sess.deployments.length < size) dropped += size - sess.deployments.length;
          bestPoint = Math.max(bestPoint, r.destruction);
          if (r.destruction > best) { best = r.destruction; bestKey = `${f}/${o}@${p}`; }
          if (r.destruction < worst) worst = r.destruction;
          (agg[`${f}/${o}`] ??= []).push(r.destruction);
        }
        bestFixed[`${f}/${o}`] = bestPoint;
      }
      bestSum += best; worstSum += worst;
      console.log(`Keep ${keep} base ${bi} (${base.layout ?? '?'}; ${n} points): bot plan ${bot.destruction}%/${bot.stars}*  squad best ${best}% (${bestKey}) worst ${worst}% | best point per order: ${Object.entries(bestFixed).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    console.log(`Keep ${keep}: bot plan mean ${(botSum / NB).toFixed(1)}  best squad order mean ${(bestSum / NB).toFixed(1)}  worst ${(worstSum / NB).toFixed(1)}  dropped warriors ${dropped} in ${runs} runs`);
    console.log('  mean over all points: ' + Object.entries(agg).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' | '));
  }
} finally { await s.close(); }
