// Read-only reproductions: pass rollover, duplicate pass look, trial modifiers vs layouts, storage vs league chest, collectors.
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const L = (...a) => console.log(...a);
try {
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const vm = await server.ssrLoadModule('/src/gameplay/sim/village.ts');
  const pass = await server.ssrLoadModule('/src/gameplay/sim/pass.ts');
  const eco = await server.ssrLoadModule('/src/gameplay/sim/economy.ts');
  const trials = await server.ssrLoadModule('/src/gameplay/sim/trials.ts');
  const ranks = await server.ssrLoadModule('/src/gameplay/sim/ranks.ts');
  const obj = await server.ssrLoadModule('/src/gameplay/sim/objective.ts');
  const data = dm.defaultData;
  const DAY = 86400000;
  const t0 = Date.UTC(2026, 10, 16, 12);

  // 1. Season Scroll rollover: unlocked-but-unclaimed tiers
  {
    let s = vm.createNewVillage(t0, data);
    s.pass.points = 3000; // 10 tiers unlocked, none claimed
    const before = { ...s.resources };
    const end = pass.passSeasonEndsAt(t0, data);
    const after = vm.advance(s, end + 1000, data).state;
    L(`[pass rollover] before: season ${s.pass.season}, points ${s.pass.points}, unlocked ${pass.unlockedTier(s, data)}, claimedFree ${s.pass.claimedFree.length}; after season end: season ${after.pass.season}, points ${after.pass.points}, claimedFree ${after.pass.claimedFree.length}; resources before ${JSON.stringify(before)} after ${JSON.stringify(after.resources)} => unclaimed tiers ${JSON.stringify(after.resources) === JSON.stringify(before) ? 'LOST (nothing granted)' : 'granted'}`);
  }
  // 2. Duplicate pass look in a later season
  {
    let s = vm.createNewVillage(t0, data);
    s.pass.points = 15 * data.pass.pointsPerTier; s.pass.premium = true; s.cosmetics.owned.push('lantern_elder');
    const r = vm.applyCommand(s, { type: 'claimTier', tier: 15, track: 'premium' }, t0 + 1000, data);
    L(`[pass look twice] claimTier 15 premium with lantern_elder already owned -> ok=${r.ok}, events=${JSON.stringify(r.ok ? r.events : r)}`);
    const v = pass.passPremiumValue(s, t0, data);
    L(`[pass look twice] passPremiumValue.skins for an owner = ${JSON.stringify(v.skins)} total≈${v.total} Jade`);
  }
  // 3. Trial modifier tiers and layouts
  {
    const rows = [];
    for (const t of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]) {
      const i = trials.trialInfo(t, data); const b = trials.trialBase(t, data);
      const walls = b.buildings.filter((x) => data.buildings[x.type]?.category === 'hedge').length;
      rows.push(`${t}:${i.layout.id}:mods=${i.modifiers.map((m) => m.id).join('+')}:walls=${walls}`);
    }
    L('[trials] modifier tiers -> layout and wall count:', rows.join(' | '));
    const other = [];
    for (const t of [1, 2, 3, 4, 57, 58, 59]) { const b = trials.trialBase(t, data); other.push(`${t}:${trials.trialInfo(t, data).layout.id}:walls=${b.buildings.filter((x) => data.buildings[x.type]?.category === 'hedge').length}`); }
    L('[trials] other tiers:', other.join(' | '));
    const alt = trials.trialBase(60, data, 1); L('[trials] tier 60 alternate 1 layout', trials.trialInfo(60, data, 1).layout.id, 'walls', alt.buildings.filter((x) => data.buildings[x.type]?.category === 'hedge').length);
  }
  // 4. Storage capacity per Keep (all storage at the Keep's cap) vs league chest scaled, and chest/calendar overflow
  {
    const hallType = Object.keys(data.buildings).find((t) => data.buildings[t].category === 'hall');
    const capAt = (k) => { const lim = data.hall.levels[k - 1].limits; const cap = { acorns: 0, dew: 0 }; for (const [type, l] of Object.entries(lim)) { const def = data.buildings[type]; if (!def || def.category === 'hall') continue; const lv = def.levels[Math.min(def.levels.length, l.maxLevel) - 1]; if (lv?.storage) for (const r of ['acorns', 'dew']) cap[r] += (lv.storage[r] ?? 0) * l.count; } const hs = data.buildings[hallType].levels[k - 1]?.storage; if (hs) for (const r of ['acorns', 'dew']) cap[r] += hs[r] ?? 0; return cap; };
    const camp = JSON.parse((await import('node:fs')).readFileSync(ROOT + '/docs/game-theory/campaign.json', 'utf8')).results.find((r) => r.id === 'regular');
    L('[campaign row keys]', Object.keys(camp.byKeep[5] ?? camp.byKeep['5'] ?? {}).join(','));
    L('Keep | max storage (coins) | league at model honor | league chest coins scaled | chest/storage | Kage chest scaled/storage');
    for (let k = 4; k <= 15; k++) {
      const cap = capAt(k); const row = Array.isArray(camp.byKeep) ? camp.byKeep.find((r) => r.keep === k || r.hall === k) : camp.byKeep[k];
      const honor = row?.honor ?? row?.avgHonor ?? 0; const lg = ranks.leagueFor(honor, data); const ch = ranks.leagueChest(lg, k, data);
      const kage = ranks.leagueChest(data.ranks.leagues.at(-1), k, data);
      L(`  ${k} | ${cap.acorns.toLocaleString()} | ${lg.name} (${Math.round(honor)}) | ${(ch.acorns ?? 0).toLocaleString()} | ${((ch.acorns ?? 0) / cap.acorns).toFixed(2)} | ${((kage.acorns ?? 0) / cap.acorns).toFixed(2)}`);
    }
    // 5. collectors: coins per day at each Keep with every mint at cap level
    const out = [];
    for (let k = 1; k <= 15; k++) { const lim = data.hall.levels[k - 1].limits; let perHour = 0; for (const [type, l] of Object.entries(lim)) { const def = data.buildings[type]; if (def?.produces !== 'acorns') continue; perHour += (def.levels[Math.min(def.levels.length, l.maxLevel) - 1]?.ratePerHour ?? 0) * l.count; } out.push(`${k}:${Math.round(perHour * 24).toLocaleString()}/d`); }
    L('[collectors] max Coins/day by Keep (all mints at cap, collected every 8h):', out.join(' '));
  }
  // 6. nextObjective for a village with nothing to do but wait
  {
    let s = vm.createNewVillage(t0, data);
    s.daily.lastDay = pass.dayIndex(t0, data); s.calendar = { claimed: 1, lastDay: 1e9, cycles: 0 };
    L('[objective] fresh village after chest:', JSON.stringify(obj.nextObjective(vm.advance(s, t0, data).state, t0, data)));
    L('[objective] kinds in type: chest, raid, upgrade, save, research, train, builders, none (no task/tier/achievement claim, no Trials, no Bounty, no Alliance War, no league)');
  }
} finally {
  await server.close();
}
