// Read-only what-if runs: patch a deep copy of the data in memory, play casual and regular model players.
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
import { readFileSync } from 'node:fs';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const pm = await server.ssrLoadModule('/tools/balance/playerModel.ts');
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const variants = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const stopKeep = Number(process.argv[3] || 7);
  const which = (process.argv[4] || 'casual,regular').split(',');
  const extra = process.argv[5] ? JSON.parse(process.argv[5]) : {};
  for (const v of variants) {
    const data = structuredClone(dm.defaultData);
    for (const [path, val] of Object.entries(v.patch || {})) {
      const parts = path.split('.'); let o = data;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      if (typeof val === 'string' && val.startsWith('*')) o[parts[parts.length - 1]] = Math.round(o[parts[parts.length - 1]] * Number(val.slice(1)));
      else o[parts[parts.length - 1]] = val;
    }
    if (v.capEcon) for (const id of ['acorn_orchard','dewdrop_well','acorn_silo','dew_cistern']) for (const lv of data.buildings[id].levels) if ((lv.buildSeconds ?? 0) > v.capEcon) lv.buildSeconds = v.capEcon;
    const out = [];
    for (const mode of which) {
      const casual = mode.startsWith('casual');
      const opts = casual ? { raidsPerSession: 2, engaged: true, ...extra } : { raidsPerSession: 2, ...extra };
      const p = new pm.ModelPlayer(data, opts);
      pm.activeHour(p, 60, 2);
      const step = casual ? pm.casualDays : pm.normalDays;
      const maxDays = process.env.MAXD ? Number(process.env.MAXD) : casual ? 140 : 60;
      for (let d = 1; d <= maxDays; d++) { step(p, 1); if (p.hallReachedAt[stopKeep] !== undefined) break; }
      const reached = Object.fromEntries(Object.entries(p.hallReachedAt).filter(([k]) => +k >= 4).map(([kk, x]) => [kk, +(x / 24).toFixed(1)]));
      const at5 = p.raidLog.filter((r) => r.hall === 5); const d5 = p.defenseLog.filter((r) => r.hall === 5);
      out.push(`${mode}: ${JSON.stringify(reached)} K5: raids ${at5.length} loot/raid ${Math.round(at5.reduce((a, r) => a + r.loot, 0) / Math.max(1, at5.length))} raided ${d5.length} stolen/raid ${Math.round(d5.reduce((a, r) => a + r.lost, 0) / Math.max(1, d5.length))}`);
    }
    console.log(`## ${v.name}\n   ${out.join('\n   ')}`);
  }
} finally { await server.close(); }
