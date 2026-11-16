// Read-only: the model player's first 90 minutes (a session every 2 minutes), raid times and Keep times.
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const pm = await server.ssrLoadModule('/tools/balance/playerModel.ts');
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const variants = [
    { name: 'baseline', patch: {} },
    { name: 'Dojo L1-L4 trainingSpeed 2/2/1.6/1.3', patch: { 'buildings.burrow_barracks.levels.0.trainingSpeed': 2, 'buildings.burrow_barracks.levels.1.trainingSpeed': 2, 'buildings.burrow_barracks.levels.2.trainingSpeed': 1.6, 'buildings.burrow_barracks.levels.3.trainingSpeed': 1.3 } },
    { name: 'Keep 2 build 240s -> 60s', patch: { 'buildings.elder_toadstool.levels.1.buildSeconds': 60 } },
  ];
  for (const v of variants) {
    const data = structuredClone(dm.defaultData);
    for (const [path, val] of Object.entries(v.patch)) { const parts = path.split('.'); let o = data; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = val; }
    const p = new pm.ModelPlayer(data, { raidsPerSession: 2 });
    const raidAt = []; let seen = 0;
    for (let m = 0; m < 90; m += 2) {
      p.session();
      while (seen < p.raidLog.length) { const r = p.raidLog[seen++]; raidAt.push(`${m}m:K${r.hall}:${r.stars}★`); }
      p.wait(2 * 60_000);
    }
    const reached = Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, x]) => [k, Math.round(x * 60) + 'm']));
    console.log(`## ${v.name}\n   Keeps ${JSON.stringify(reached)}\n   raids (${raidAt.length}): ${raidAt.join(' ')}\n   first 30 min raids: ${raidAt.filter((s) => parseInt(s) < 30).length}, first 60: ${raidAt.filter((s) => parseInt(s) < 60).length}`);
  }
} finally { await server.close(); }
