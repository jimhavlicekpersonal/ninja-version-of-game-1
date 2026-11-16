import { open } from './load.mjs';
const s = await open();
try {
  const { defaultData: data } = await s.load('/src/gameplay/sim/data.ts');
  const { runBattle, createBattle } = await s.load('/src/gameplay/sim/battle/battle.ts');
  const { generateOpponent, LAYOUTS } = await s.load('/src/gameplay/sim/battle/basegen.ts');
  const { botArmy } = await s.load('/src/gameplay/sim/matchmaking.ts');
  const { botDeployments } = await s.load('/src/gameplay/sim/defense.ts');
  const { troopLevelCapAt } = await s.load('/src/gameplay/sim/research.ts');
  const { createRng } = await s.load('/src/gameplay/sim/rng.ts');
  const { heroAtKeep } = await s.load('/src/gameplay/sim/heroes.ts');
  const layouts = ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'];
  for (const keep of [6, 9, 12, 15]) {
    const army = botArmy(keep, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const hero = heroAtKeep(keep, data);
    const out = [];
    for (const bonus of [0, 0.1023, 0.1697, 0.2141, 0.2434]) {
      let d = 0, st = 0, three = 0, n = 0;
      for (const lid of layouts) for (let i = 0; i < 2; i++) {
        const layout = LAYOUTS.find((l) => l.id === lid);
        const base = generateOpponent(5000 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
        const mastery = bonus ? Object.fromEntries(Object.keys(army).map((t) => [t, bonus])) : undefined;
        const setup = { seed: 77 + n, base, army, levels, infiltration: true, ...(hero ? { hero } : {}), ...(mastery ? { mastery } : {}) };
        const probe = createBattle(setup, data);
        const deps = botDeployments(probe.deployable, probe.grid.size, army, createRng(13 + n), data, levels, probe.entry);
        if (hero && deps.length) deps.unshift({ ...deps[0], troop: hero.id });
        const r = runBattle(setup, deps, data).result;
        d += r.destruction; st += r.stars; three += r.stars === 3 ? 1 : 0; n++;
      }
      out.push(`+${(bonus * 100).toFixed(0)}%: ${(d / n).toFixed(1)}% ${(st / n).toFixed(2)}* 3*=${Math.round(100 * three / n)}%`);
    }
    console.log(`Keep ${keep} raid-bot army, 12 bases, bot plan | ` + out.join(' | '));
  }
} finally { await s.close(); }
