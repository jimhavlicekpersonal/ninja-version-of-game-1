// Read-only: how far up the Shadow Trials does a maxed Keep-15 bot-mix army get with the bot plan?
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const L = (...a) => console.log(...a);
try {
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const mt = await server.ssrLoadModule('/tools/balance/matched.ts');
  const mm = await server.ssrLoadModule('/src/gameplay/sim/matchmaking.ts');
  const bt = await server.ssrLoadModule('/src/gameplay/sim/battle/battle.ts');
  const df = await server.ssrLoadModule('/src/gameplay/sim/defense.ts');
  const rg = await server.ssrLoadModule('/src/gameplay/sim/rng.ts');
  const tr = await server.ssrLoadModule('/src/gameplay/sim/trials.ts');
  const vm = await server.ssrLoadModule('/src/gameplay/sim/village.ts');
  const data = dm.defaultData;
  const tiers = (process.argv[2] ?? '60,61,62,63,64,66').split(',').map(Number);
  const seeds = Number(process.argv[3] ?? 2);
  const keep = Number(process.argv[4] ?? 15);
  const army = mm.botArmy(keep, 1, data);
  const state = mt.matchedVillage(keep, army, 0, data);
  const load = vm.battleLoadout(state, data);
  L('army', JSON.stringify(army), 'hero', JSON.stringify(load.hero ?? null));
  for (const tier of tiers) {
    const info = tr.trialInfo(tier, data);
    let best = { stars: -1, destruction: -1 }; const res = [];
    for (let v = 0; v <= 1; v++) {
      const base = tr.trialBase(tier, data, v);
      for (let i = 0; i < seeds; i++) {
        const t0 = Date.now();
        const setup = { seed: 77 + i, base, army: load.army, levels: load.levels, hero: load.hero, infiltration: true };
        const sim = bt.createBattle(setup, data);
        const byTick = bt.deploymentsByTick(df.botDeployments(sim.deployable, sim.grid.size, load.army, rg.createRng(13 + i), data, load.levels, sim.entry));
        while (!sim.ended) bt.step(sim, byTick.get(sim.tick));
        const r = bt.result(sim);
        res.push(`v${v}s${i}:${r.stars}★/${Math.round(r.destruction)}% (${Date.now() - t0}ms)`);
        if (r.stars > best.stars || (r.stars === best.stars && r.destruction > best.destruction)) best = r;
      }
    }
    L(`tier ${tier} (Keep ${info.hall}, ${info.layout.id}, power x${info.power.toFixed(2)}, wall x${info.wallPower}): ${res.join(' ')} => best ${best.stars}★ ${Math.round(best.destruction)}% ${best.stars >= data.trials.starsToClear ? 'CLEAR' : 'fail'}`);
  }
} finally {
  await server.close();
}
