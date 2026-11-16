// Read-only retention measurements over the live data and sim modules.
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const ROOT = '/home/user/ninja-version-of-game-1';
const SCR = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: ROOT, configFile: false, cacheDir: SCR + '/vitecache', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const L = (...a) => console.log(...a);
try {
  const dm = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const rng = await server.ssrLoadModule('/src/gameplay/sim/rng.ts');
  const ev = await server.ssrLoadModule('/src/gameplay/sim/events.ts');
  const pass = await server.ssrLoadModule('/src/gameplay/sim/pass.ts');
  const eco = await server.ssrLoadModule('/src/gameplay/sim/economy.ts');
  const daily = await server.ssrLoadModule('/src/gameplay/sim/daily.ts');
  const trials = await server.ssrLoadModule('/src/gameplay/sim/trials.ts');
  const ranks = await server.ssrLoadModule('/src/gameplay/sim/ranks.ts');
  const data = dm.defaultData;
  const DAY = 86400000;
  const now = Date.UTC(2026, 10, 16);

  // ---------- A. task repetition (all templates eligible; real picker arithmetic) ----------
  const pick = (list, n, seed) => { const r = rng.createRng(seed); const pool = [...list]; const out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next(r) * pool.length), 1)[0]); return out; };
  const day0 = pass.dayIndex(now, data);
  for (const [label, list, n, mult, off, days] of [['daily', data.pass.dailyTasks, 3, 2, 1, 120], ['weekly', data.pass.weeklyChallenges, data.pass.weeklyCount, 2, 2, 26]]) {
    let sameAsPrev = 0, overlap2 = 0, total = 0, allSeenSum = 0, players = 400;
    const freq = {};
    for (let p = 0; p < players; p++) {
      const seed = rng.mixSeed(12345, p);
      let prev = null; const seen = new Set(); let allSeenAt = null;
      for (let d = 0; d < days; d++) {
        const idx = label === 'daily' ? day0 + d : Math.floor(day0 / 7) + d;
        const ids = pick(list, n, rng.mixSeed(seed, idx * mult + off)).map((t) => t.id).sort();
        for (const id of ids) { freq[id] = (freq[id] ?? 0) + 1; seen.add(id); }
        if (allSeenAt === null && seen.size === list.length) allSeenAt = d + 1;
        if (prev) { total++; const ov = ids.filter((x) => prev.includes(x)).length; if (ov === n) sameAsPrev++; if (ov >= 2) overlap2++; }
        prev = ids;
      }
      allSeenSum += allSeenAt ?? days;
    }
    L(`[tasks:${label}] templates=${list.length} pick=${n}; periods until every template seen (mean over ${players} players)=${(allSeenSum / players).toFixed(1)}; P(identical set as previous period)=${(sameAsPrev / total * 100).toFixed(1)}%; P(>=2 of ${n} repeat from previous period)=${(overlap2 / total * 100).toFixed(1)}%`);
  }
  L('[tasks] distinct stats used by daily:', [...new Set(data.pass.dailyTasks.map((t) => t.stat))].join(','), '| weekly:', [...new Set(data.pass.weeklyChallenges.map((t) => t.stat))].join(','));

  // ---------- A2. eligibility of timer tasks by Keep: share of newly-unlocked upgrade steps that fit a day / a week ----------
  const hallLevels = data.hall.levels;
  L('[tasks] upgrade steps newly allowed at each Keep (non-wall, non-decor): count, <=1 day, <=7 days, median hours; research steps: count, <=1d (per lane), median hours');
  for (let k = 1; k <= hallLevels.length; k++) {
    const lim = hallLevels[k - 1].limits; const prev = k > 1 ? hallLevels[k - 2].limits : {};
    const secs = [];
    for (const [type, l] of Object.entries(lim)) {
      const def = data.buildings[type]; if (!def || ['obstacle', 'decor', 'hedge'].includes(def.category)) continue;
      const pl = prev[type] ?? { count: 0, maxLevel: 0 };
      for (let lv = 1; lv <= l.maxLevel; lv++) {
        const isNew = lv > pl.maxLevel ? l.count : Math.max(0, l.count - pl.count);
        const ld = def.levels[lv - 1]; if (!ld) continue;
        for (let i = 0; i < isNew; i++) secs.push(ld.buildSeconds ?? 0);
      }
    }
    // the Keep's own next level
    const hallType = Object.keys(data.buildings).find((t) => data.buildings[t].category === 'hall');
    if (k < hallLevels.length) secs.push(data.buildings[hallType].levels[k].buildSeconds);
    secs.sort((a, b) => a - b);
    const cap = hallLevels[k - 1].troopLevelCap; const pcap = k > 1 ? hallLevels[k - 2].troopLevelCap : 1;
    const rs = [];
    for (const [t, def] of Object.entries(data.troops)) {
      if ((def.unlockKeep ?? 1) > k) continue;
      const off = def.levelCapOffset ?? 0;
      const lo = (def.unlockKeep ?? 1) === k ? 1 : Math.max(1, pcap - off);
      for (let lv = lo + 1; lv <= cap - off; lv++) { const r = def.levels[lv - 1]?.research; if (r) rs.push(r.seconds); }
    }
    rs.sort((a, b) => a - b);
    const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : 0);
    L(`  Keep ${k}: upgrades ${secs.length}, <=1d ${secs.filter((s) => s <= 86400).length}, <=7d ${secs.filter((s) => s <= 7 * 86400).length}, median ${(med(secs) / 3600).toFixed(1)}h, max ${(secs[secs.length - 1] / 3600).toFixed(0)}h | research ${rs.length}, <=1d ${rs.filter((s) => s <= 86400).length}, median ${(med(rs) / 3600).toFixed(1)}h, max ${((rs[rs.length - 1] ?? 0) / 3600).toFixed(0)}h, lanes ${hallLevels[k - 1].researchLanes}`);
  }

  // ---------- B. events over a year ----------
  const yr = ev.eventsBetween(now, now + 365 * DAY, data);
  const byId = {}; for (const e of yr) byId[e.id] = (byId[e.id] ?? 0) + 1;
  // union coverage by hour
  let covered = 0; const hours = 365 * 24;
  for (let hh = 0; hh < hours; hh++) { if (ev.activeEvents(now + hh * 3600000 + 1, data).length) covered++; }
  const names = new Set(data.events.schedule.map((e) => e.name));
  L(`[events] schedule entries=${data.events.schedule.length}, distinct names=${names.size} (${[...names].join(' | ')}), periodDays=${data.events.periodDays}; occurrences next 365 d: ${JSON.stringify(byId)}; share of hours with >=1 event active=${(covered / hours * 100).toFixed(1)}%`);
  const d0 = new Date(data.events.epoch); L('[events] epoch', d0.toUTCString());
  for (const e of data.events.schedule) { const s = new Date(data.events.epoch + e.startHour * 3600000); const en = new Date(data.events.epoch + (e.startHour + e.durationHours) * 3600000); L(`   ${e.id}: ${s.toUTCString().slice(0, 22)} -> ${en.toUTCString().slice(0, 22)}`); }
  const distinctEffects = new Set(data.events.schedule.map((e) => JSON.stringify(e.effect) + (e.goal ? e.goal.kind : '')));
  L('[events] distinct effect kinds:', distinctEffects.size);

  // ---------- C. Season Scroll pacing ----------
  const ppd = pass.passPointsPerDay(data);
  const need = data.pass.tiers.length * data.pass.pointsPerTier;
  L(`[pass] points/day at full completion=${ppd.toFixed(1)}; needed=${need}; days to finish=${(need / ppd).toFixed(1)} of ${data.pass.seasonDays}; season max points=${(ppd * data.pass.seasonDays).toFixed(0)} => ${((1 - need / (ppd * data.pass.seasonDays)) * 100).toFixed(0)}% of earnable points have no tier`);
  for (const share of [1, 0.75, 0.5, 0.33]) L(`   completing ${share * 100}% of tasks -> tier ${Math.min(30, Math.floor(ppd * share * 30 / 300))} by season end`);
  const sum = (track) => { const o = { acorns: 0, dew: 0, moonstones: 0, skins: 0 }; for (const t of data.pass.tiers) { const r = t[track]; o.acorns += r.acorns ?? 0; o.dew += r.dew ?? 0; o.moonstones += r.moonstones ?? 0; if (r.skin) o.skins++; } return o; };
  const free = sum('free'), prem = sum('premium');
  L('[pass] free track base totals', JSON.stringify(free), 'premium', JSON.stringify(prem));

  // ---------- D. reward relevance by Keep vs raid loot (CAMPAIGN regular: loot per raid) ----------
  const campaign = JSON.parse((await import('node:fs')).readFileSync(ROOT + '/docs/game-theory/campaign.json', 'utf8'));
  const reg = campaign.results.find((r) => /regular/i.test(r.id ?? r.name ?? '')) ?? campaign.results[0];
  L('[campaign] ids', campaign.results.map((r) => r.id).join(','), 'keys', Object.keys(reg).join(','));
  const perKeep = {}; for (const row of reg.keeps ?? reg.rows ?? reg.byKeep ?? []) perKeep[row.keep ?? row.hall] = row;
  const lootAt = (k) => (perKeep[k]?.loot ?? perKeep[k]?.avgLoot ?? null);
  const chestBaseEV = data.daily.chest.outcomes.reduce((s, o) => s + o.weight * ((o.reward.acorns ?? 0) + (o.reward.dew ?? 0)), 0) / data.daily.chest.outcomes.reduce((s, o) => s + o.weight, 0);
  const chestJadeEV = data.daily.chest.outcomes.reduce((s, o) => s + o.weight * (o.reward.moonstones ?? 0), 0) / 100;
  const calBase = data.daily.calendar.days.reduce((s, d) => s + (d.reward?.acorns ?? 0) + (d.reward?.dew ?? 0), 0);
  const calJade = data.daily.calendar.days.reduce((s, d) => s + (d.reward?.moonstones ?? 0), 0);
  L(`[chest] base EV resources=${chestBaseEV}, Jade EV/day=${chestJadeEV}; top streak x${data.daily.streak.steps.at(-1).bonus}; calendar cycle base resources=${calBase}, Jade=${calJade}`);
  const bounty = data.events.schedule.find((e) => e.goal); const bountyBase = bounty.goal.ladder.reduce((s, l) => s + (l.reward.acorns ?? 0) + (l.reward.dew ?? 0), 0); const bountyJade = bounty.goal.ladder.reduce((s, l) => s + (l.reward.moonstones ?? 0), 0);
  L(`[bounty] full ladder base resources=${bountyBase}, Jade=${bountyJade}, every ${data.events.periodDays} days`);
  // storage capacity at each Keep
  const storageCap = (k) => { const lim = hallLevels[k - 1].limits; const cap = { acorns: 0, dew: 0 }; for (const [type, l] of Object.entries(lim)) { const def = data.buildings[type]; if (!def) continue; const lv = def.levels[Math.min(def.levels.length, l.maxLevel) - 1]; const st = lv?.storage ?? lv?.capacity; if (st && typeof st === 'object') for (const r of ['acorns', 'dew']) cap[r] += (st[r] ?? 0) * (def.category === 'hall' ? 1 : l.count); } const hall = Object.values(data.buildings).find((b) => b.category === 'hall'); const hs = hall.levels[k - 1]?.storage; if (hs) for (const r of ['acorns', 'dew']) cap[r] += hs[r] ?? 0; return cap; };
  L('[sample building level keys]', Object.keys(Object.values(data.buildings).find((b) => b.category === 'storage')?.levels?.[0] ?? {}).join(','), '| hall level keys', Object.keys(Object.values(data.buildings).find((b) => b.category === 'hall').levels[0]).join(','));
  L('Keep | scale | raid loot (regular) | chest EV top streak (xraid) | free pass season (xraid) | premium res (xraid) | calendar cycle (xraid) | bounty ladder (xraid) | trial tier reward at Keep (xraid) | league winBonus 3* at model honor (share of raid) | Keep upgrade cost (raids)');
  const hallType = Object.keys(data.buildings).find((t) => data.buildings[t].category === 'hall');
  for (let k = 2; k <= 15; k++) {
    const sc = eco.rewardScale(k, data); const loot = lootAt(k); if (!loot) { L(`  Keep ${k}: no campaign row`); continue; }
    const chest = chestBaseEV * sc * data.daily.streak.steps.at(-1).bonus;
    const fr = (free.acorns + free.dew) * sc; const pr = (prem.acorns + prem.dew) * sc; const cal = calBase * sc; const bo = bountyBase * sc;
    const tr = trials.trialReward(k * data.trials.tiersPerHall, data); const trT = (tr.acorns ?? 0) + (tr.dew ?? 0);
    const honor = perKeep[k]?.honor ?? 0; const wb = ranks.leagueFor(honor, data).winBonus; const wbT = (wb.acorns ?? 0) + (wb.dew ?? 0);
    const kc = k < 15 ? Object.values(data.buildings[hallType].levels[k].cost).reduce((a, b) => a + b, 0) : 0;
    L(`  ${k} | ${sc.toFixed(2)} | ${Math.round(loot).toLocaleString()} | ${Math.round(chest).toLocaleString()} (${(chest / loot).toFixed(2)}) | ${Math.round(fr).toLocaleString()} (${(fr / loot).toFixed(1)}) | ${Math.round(pr).toLocaleString()} (${(pr / loot).toFixed(1)}) | ${Math.round(cal).toLocaleString()} (${(cal / loot).toFixed(1)}) | ${Math.round(bo).toLocaleString()} (${(bo / loot).toFixed(1)}) | ${trT.toLocaleString()} (${(trT / loot).toFixed(2)}) | ${ranks.leagueFor(honor, data).name} ${wbT.toLocaleString()} (${(wbT / loot * 100).toFixed(1)}%) | ${kc.toLocaleString()} (${(kc / loot).toFixed(1)})`);
  }

  // ---------- E. achievements ----------
  let totalJade = 0; for (const a of data.achievements) for (const t of a.tiers) totalJade += t[1];
  L(`[achievements] ${data.achievements.length} achievements, ${data.achievements.reduce((s, a) => s + a.tiers.length, 0)} tiers, total Jade ${totalJade}; stats used: ${data.achievements.map((a) => a.stat).join(',')}`);
  // total upgrades available through Keep 15 (non-wall/decor/obstacle), total research steps
  const lim15 = hallLevels[14].limits; let upg = 0, walls = 0;
  for (const [type, l] of Object.entries(lim15)) { const def = data.buildings[type]; if (!def) continue; if (def.category === 'hedge') { walls += l.count * l.maxLevel; continue; } if (['obstacle', 'decor'].includes(def.category)) continue; upg += l.count * l.maxLevel; }
  upg += 14; // Keep levels 2..15
  let res = 0; for (const [t, def] of Object.entries(data.troops)) { const top = hallLevels[14].troopLevelCap - (def.levelCapOffset ?? 0); for (let lv = 2; lv <= Math.min(top, def.levels.length); lv++) if (def.levels[lv - 1]?.research) res++; }
  L(`[achievements] upgrade steps to max Keep 15 (buildings incl. placement as level 1, + Keep) ~${upg}; wall segments x levels=${walls}; research steps to max all 50 warriors=${res}; obstacles in a village=${data.economy.obstacles.count}`);
  // trials
  L('[trials] tier -> hall, power (incl. modifiers/layout), reward');
  for (const t of [1, 4, 20, 40, 56, 60, 61, 62, 65, 70, 80, 100]) { const i = trials.trialInfo(t, data); const r = trials.trialReward(t, data); L(`   tier ${t}: Keep ${i.hall}, layout ${i.layout.id}, power x${i.power.toFixed(2)}, wall x${i.wallPower}, mods ${i.modifiers.map((m) => m.id).join('+') || '-'}, reward ${JSON.stringify(r)}`); }
  let trJade = 0; for (let t = 1; t <= 60; t++) trJade += trials.trialReward(t, data).moonstones ?? 0; L('[trials] Jade over tiers 1..60 =', trJade);
  // leagues
  L('[leagues]', data.ranks.leagues.map((l) => `${l.name}>=${l.min}`).join(', '), '| season reset floor', data.ranks.seasonResetFloor);
  for (const h of [1000, 2200, 3200, 4300, 5200]) L(`   ${h} honor -> after season reset ${data.ranks.seasonResetFloor + Math.floor((h - data.ranks.seasonResetFloor) / 2)} (${ranks.leagueFor(h, data).name} -> ${ranks.leagueFor(data.ranks.seasonResetFloor + Math.floor((h - data.ranks.seasonResetFloor) / 2), data).name})`);
} finally {
  await server.close();
}
