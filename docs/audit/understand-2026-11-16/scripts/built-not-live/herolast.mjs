// Same panel as tools/balance/preview.ts runHeroPreview, but the hero goes in LAST (after the army), to check
// that the "hero first" deployment in the preview tool is not what makes the planned heroes look weak.
import { open } from './load.mjs';
const s = await open();
try {
  const { defaultData } = await s.load('/src/gameplay/sim/data.ts');
  const { withPreview } = await s.load('/src/gameplay/sim/plannedContent.ts');
  const { createBattle, runBattle } = await s.load('/src/gameplay/sim/battle/battle.ts');
  const { generateOpponent, LAYOUTS } = await s.load('/src/gameplay/sim/battle/basegen.ts');
  const { botDeployments } = await s.load('/src/gameplay/sim/defense.ts');
  const { troopLevelCapAt } = await s.load('/src/gameplay/sim/research.ts');
  const { createRng } = await s.load('/src/gameplay/sim/rng.ts');
  const { heroAtKeep } = await s.load('/src/gameplay/sim/heroes.ts');
  const { maxHousingAtHall } = await s.load('/src/gameplay/sim/army.ts');
  const { newestInFamily } = await s.load('/tools/balance/armyLab.ts');
  const data = withPreview(defaultData);
  const layouts = ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'];
  const fam = { iron_matriarch: 'melee', sky_admiral: 'air', grand_sensei: 'support' };
  const focus = (troops, keep) => { const housing = maxHousingAtHall(keep, data); const army = {}; const add = (list, share) => { for (const t of list) { const n = Math.floor((housing * share) / list.length / data.troops[t].housing); if (n > 0) army[t] = (army[t] ?? 0) + n; } }; add(troops, 0.6); add(newestInFamily('melee', keep, 2, data), 0.4); return army; };
  const fight = (base, army, keep, seed, hero, when) => {
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const setup = { seed: 77 + seed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const sim = createBattle(setup, data);
    const deps = botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + seed), data, levels, sim.entry);
    if (hero && deps.length) {
      if (when === 'first') deps.unshift({ ...deps[0], troop: hero.id });
      else { const last = deps[deps.length - 1]; deps.push({ ...last, tick: last.tick + (when === 'last' ? 1 : 0), troop: hero.id }); }
    }
    return runBattle(setup, deps, data).result.destruction;
  };
  for (const [id, keeps] of [['sky_admiral', [11, 15]], ['iron_matriarch', [9, 15]], ['grand_sensei', [13, 15]]]) {
    const def = data.battle.heroes[id];
    for (const keep of keeps) {
      const hero = { id, level: Math.max(1, Math.min(def.levels.length, keep - def.unlockKeep + 1)) };
      const captain = heroAtKeep(keep, defaultData);
      const army = focus(newestInFamily(fam[id], keep, 3, data), keep);
      let none = 0, cf = 0, cl = 0, hf = 0, hl = 0, n = 0;
      for (const lid of layouts) for (let i = 0; i < 2; i++) {
        const base = generateOpponent(5000 + i * 7919 + keep * 131, keep, defaultData, { levelBias: 0.5, layout: LAYOUTS.find((l) => l.id === lid) });
        none += fight(base, army, keep, n, null); cf += fight(base, army, keep, n, captain, 'first'); cl += fight(base, army, keep, n, captain, 'last'); hf += fight(base, army, keep, n, hero, 'first'); hl += fight(base, army, keep, n, hero, 'last'); n++;
      }
      console.log(`${id.padEnd(15)} K${keep} own-family army, ${n} bases: none ${(none / n).toFixed(1)} | captain first ${(cf / n).toFixed(1)} last ${(cl / n).toFixed(1)} | hero first ${(hf / n).toFixed(1)} last ${(hl / n).toFixed(1)}  army=${JSON.stringify(army)}`);
    }
  }
} finally { await s.close(); }
