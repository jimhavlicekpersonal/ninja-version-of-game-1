// Read-only diagnostic: instrument the casual model player from day 0 to Keep 7.
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const pm = await server.ssrLoadModule('/tools/balance/playerModel.ts');
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const vm = await server.ssrLoadModule('/src/gameplay/sim/village.ts');
  const rm = await server.ssrLoadModule('/src/gameplay/sim/resources.ts');
  const baseData = dm.defaultData;
  const mode = process.argv[2] || 'casual';
  const maxDays = Number(process.argv[3] || 45);
  const patch = process.argv[4] ? JSON.parse(process.argv[4]) : null;
  const data = patch ? structuredClone(baseData) : baseData;
  if (patch) {
    for (const [path, val] of Object.entries(patch)) {
      const parts = path.split('.'); let o = data;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = val;
    }
  }
  const opts = mode.startsWith('casual') ? { raidsPerSession: 2, engaged: true } : { raidsPerSession: 2 };
  const p = new pm.ModelPlayer(data, opts);
  const tot = { collect: 0, raid: 0, stolen: 0, chest: 0, trial: 0, task: 0, spendBuild: {}, spendTrain: 0, spendResearch: 0, scout: 0, raids: 0, defs: 0 };
  let day = { ...tot, spendBuild: {} };
  const sum = (s) => (s.resources.acorns ?? 0) + (s.resources.dew ?? 0);
  const orig = p.run.bind(p);
  p.run = (cmd) => {
    const before = sum(p.state); const bA = p.state.resources.acorns;
    const ok = orig(cmd);
    if (!ok) return ok;
    const d = sum(p.state) - before;
    if (cmd.type === 'collect') day.collect += d;
    else if (cmd.type === 'openDailyChest') day.chest += d;
    else if (cmd.type === 'trialEnd') day.trial += d;
    else if (cmd.type === 'claimTask' || cmd.type === 'claimTier') day.task += d;
    else if (cmd.type === 'train') day.spendTrain += -d;
    else if (cmd.type === 'research') day.spendResearch += -d;
    else if (cmd.type === 'place' || cmd.type === 'upgrade') {
      const t = cmd.type === 'place' ? cmd.buildingType : p.state.buildings.find((b) => b.id === cmd.id)?.type;
      day.spendBuild[t] = (day.spendBuild[t] ?? 0) + -d;
    }
    return ok;
  };
  let raidIdx = 0, defIdx = 0;
  const k = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n)));
  const report = (dnum) => {
    const s = p.state; const hl = vm.hallLevel(s, data);
    const newRaids = p.raidLog.slice(raidIdx); raidIdx = p.raidLog.length;
    const newDefs = p.defenseLog.slice(defIdx); defIdx = p.defenseLog.length;
    day.raid = newRaids.reduce((a, r) => a + r.loot, 0); day.raids = newRaids.length;
    day.stolen = newDefs.reduce((a, r) => a + r.lost, 0); day.defs = newDefs.length;
    const cap = rm.capacity(s, data);
    const hall = s.buildings.find((b) => b.type === 'elder_toadstool');
    const lv = (t) => s.buildings.filter((b) => b.type === t).map((b) => b.level + (b.upgrade ? '^' : '')).join('/');
    const bs = vm.builderStatus(s, data, p.clock.now());
    const spend = Object.entries(day.spendBuild).map(([t, v]) => `${t}:${k(v)}`).join(' ');
    console.log(`d${String(dnum).padStart(3)} K${hl}${hall.upgrade ? '^' : ' '} coins ${k(s.resources.acorns).padStart(6)}/${k(cap.acorns).padStart(6)} prov ${k(s.resources.dew).padStart(6)}/${k(cap.dew).padStart(6)} | +coll ${k(day.collect).padStart(5)} +raid ${k(day.raid).padStart(5)}(${day.raids}) +chest ${k(day.chest)} +trial ${k(day.trial)} +task ${k(day.task)} -stolen ${k(day.stolen).padStart(5)}(${day.defs}) -train ${k(day.spendTrain)} -res ${k(day.spendResearch)} | bld free ${bs.free}/${bs.total} mint ${lv('acorn_orchard')} farm ${lv('dewdrop_well')} tres ${lv('acorn_silo')} store ${lv('dew_cistern')} camp ${lv('army_camp')} dojo ${lv('burrow_barracks')} | spent ${spend}`);
    for (const key of ['collect', 'raid', 'stolen', 'chest', 'trial', 'task', 'spendTrain', 'spendResearch', 'raids', 'defs']) tot[key] += day[key];
    for (const [t, v] of Object.entries(day.spendBuild)) tot.spendBuild[t] = (tot.spendBuild[t] ?? 0) + v;
    day = { collect: 0, raid: 0, stolen: 0, chest: 0, trial: 0, task: 0, spendBuild: {}, spendTrain: 0, spendResearch: 0, scout: 0, raids: 0, defs: 0 };
  };
  pm.activeHour(p, 60, 2);
  report(0);
  const step = mode.startsWith('casual') ? pm.casualDays : pm.normalDays;
  const stopKeep = Number(process.argv[5] || 7);
  for (let d = 1; d <= maxDays; d++) {
    step(p, 1);
    report(d);
    if (p.hallReachedAt[stopKeep] !== undefined) break;
  }
  console.log('reached', JSON.stringify(Object.fromEntries(Object.entries(p.hallReachedAt).map(([kk, v]) => [kk, +(v / 24).toFixed(1)]))));
  console.log('totals', JSON.stringify(tot));
} finally { await server.close(); }
