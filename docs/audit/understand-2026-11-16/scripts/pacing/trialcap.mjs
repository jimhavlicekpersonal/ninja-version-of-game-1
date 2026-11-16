// Read-only: how far does a maxed Keep 15 army (bot mix, bot plan, with the Shadow Captain) get on the Trial ladder?
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const tm = await server.ssrLoadModule('/src/gameplay/sim/trials.ts');
  const bm = await server.ssrLoadModule('/src/gameplay/sim/battle/battle.ts');
  const df = await server.ssrLoadModule('/src/gameplay/sim/defense.ts');
  const rg = await server.ssrLoadModule('/src/gameplay/sim/rng.ts');
  const hm = await server.ssrLoadModule('/src/gameplay/sim/heroes.ts');
  const data = dm.defaultData;
  const keep = 15; const L = data.hall.levels[keep - 1];
  const cap = data.buildings.army_camp.levels[L.limits.army_camp.maxLevel - 1].housing * L.limits.army_camp.count;
  const mix = data.raids.botArmyMix[keep - 1];
  const army = {}; const levels = {};
  for (const t of Object.keys(data.troops)) levels[t] = Math.max(1, Math.min(data.troops[t].levels.length, L.troopLevelCap - (data.troops[t].levelCapOffset ?? 0)));
  for (const [t, s] of Object.entries(mix)) army[t] = Math.floor((cap * s) / data.troops[t].housing);
  const hero = hm.heroAtKeep(keep, data);
  console.log('army', JSON.stringify(army), 'hero', JSON.stringify(hero));
  for (const masteryBonus of [0, 0.3]) {
    const out = [];
    for (let tier = 53; tier <= 76; tier++) {
      let best = { stars: -1, destruction: 0 };
      for (let variant = 0; variant <= 4; variant++) {
        const base = tm.trialBase(tier, data, variant);
        const setup = { seed: rg.mixSeed(12345, tier * 8 + variant), base, army, levels, infiltration: true, ...(hero ? { hero } : {}), ...(masteryBonus ? { mastery: Object.fromEntries(Object.keys(army).map((t) => [t, masteryBonus])) } : {}) };
        const probe = bm.createBattle(setup, data);
        const dep = df.botDeployments(probe.deployable, probe.grid.size, army, rg.createRng(tier), data, levels, probe.entry);
        const r = bm.runBattle(setup, dep, data).result;
        if (r.stars > best.stars || (r.stars === best.stars && r.destruction > best.destruction)) best = { stars: r.stars, destruction: r.destruction };
      }
      out.push(`${tier}:${best.stars}★${Math.round(best.destruction)}%`);
    }
    console.log(`mastery +${masteryBonus * 100}% (best of 5 fortresses, bot plan): ` + out.join(' '));
  }
} finally { await server.close(); }
