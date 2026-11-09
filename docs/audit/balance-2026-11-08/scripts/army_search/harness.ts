/**
 * Army search harness (balance audit, dimension army_search). READ-ONLY on the game:
 * it only reads src/ and tools/ and writes under scratch/army_search/.
 *
 * node scratch/run.mjs scratch/army_search/harness.ts <mode> <keep> [...]
 *   baselines K            9 COMPOSITIONS, bot mix, Suggested army, named degenerate candidates (entry seed 1)
 *   screen K               marginal screen: +10% housing of each trainable troop on top of the bot mix
 *   climb K <start> [max]  hill climb over housing shares; start = bot | support_light | random
 *   final K                top-10 distinct + baselines re-fought with entry seed 2; breakdowns; peakedness
 *   hero K                 same armies with and without setup.hero
 *   smoke K                a few candidates with three Smoke Bombs added to the bot plan
 */
import { createBattle, deploymentsByTick, result as battleResult, step } from '../../src/gameplay/sim/battle/battle';
import { LAYOUTS, generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, BaseLayout, Deployment } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng, next } from '../../src/gameplay/sim/rng';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { COMPOSITIONS, buildArmy, troopKeep, familyOf } from '../../tools/balance/armyLab';
import { suggestedShares } from '../../src/gameplay/sim/suggest';
import roster from '../../src/gameplay/data/roster.json';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const DIR = 'scratch/army_search';
const ROLE_OF: Record<string, string> = Object.fromEntries((roster.warriors as { role: string; tier: number; liveTroop?: string }[]).filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.role]));
const TIER_OF: Record<string, number> = Object.fromEntries((roster.warriors as { role: string; tier: number; liveTroop?: string }[]).filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.tier]));

export type Army = Record<string, number>;
interface BaseCase { base: BaseLayout; layout: string; bias: number; seed: number }
interface Eval { mean: number; stars: number; one: number; three: number; d: number[]; st: number[] }

const h = (t: string) => data.troops[t].housing;
export const armyKey = (a: Army) => Object.entries(a).filter(([, n]) => n > 0).sort().map(([t, n]) => `${t}:${n}`).join(',');
const housingOf = (a: Army) => Object.entries(a).reduce((s, [t, n]) => s + h(t) * n, 0);

export function basesFor(K: number): BaseCase[] {
  const out: BaseCase[] = [];
  LAYOUTS.forEach((L, li) => {
    [0.5, 1].forEach((bias, bi) => {
      for (let s = 0; s < 2; s++) {
        const seed = 70000 + K * 100 + li * 20 + bi * 10 + s;
        out.push({ base: generateOpponent(seed, K, data, { levelBias: bias, layout: L }), layout: L.id, bias, seed });
      }
    });
  });
  return out;
}

export function levelsFor(K: number, army: Army): Record<string, number> {
  return Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, data, t)]));
}

export function pool(K: number): string[] {
  return Object.keys(data.troops).filter((t) => troopKeep(t, data) <= K).sort();
}

/** Shares (sum 1) -> counts filling the housing; leftover filled by the smallest-housing troop in the mix. */
export function render(shares: Record<string, number>, H: number): Army {
  const tot = Object.values(shares).reduce((a, b) => a + b, 0);
  const army: Army = {};
  let used = 0;
  const present = Object.entries(shares).filter(([, s]) => s > 1e-9);
  for (const [t, s] of present) {
    const n = Math.floor((H * s) / tot / h(t));
    if (n > 0) { army[t] = n; used += n * h(t); }
  }
  const fillers = present.map(([t]) => t).sort((a, b) => h(a) - h(b) || shares[b] - shares[a]);
  for (const t of fillers) {
    const n = Math.floor((H - used) / h(t));
    if (n > 0) { army[t] = (army[t] ?? 0) + n; used += n * h(t); }
  }
  return army;
}
export function sharesOf(army: Army, H: number): Record<string, number> {
  return Object.fromEntries(Object.entries(army).filter(([, n]) => n > 0).map(([t, n]) => [t, (n * h(t)) / H]));
}

// ---------- cache ----------
let cache: Record<string, Eval> = {};
let cacheFile = '';
let dirty = 0;
function loadCache(K: number) {
  cacheFile = `${DIR}/cache_K${K}.json`;
  cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
}
function saveCache() { if (dirty) { writeFileSync(cacheFile, JSON.stringify(cache)); dirty = 0; } }
function log(K: number, phase: string, label: string, army: Army, entrySeed: number, e: Eval, extra: Record<string, unknown> = {}) {
  appendFileSync(`${DIR}/log_K${K}.jsonl`, JSON.stringify({ K, phase, label, entrySeed, key: armyKey(army), army, mean: e.mean, stars: e.stars, one: e.one, three: e.three, d: e.d, ...extra }) + '\n');
}

export interface Ctx { K: number; H: number; bases: BaseCase[]; hero: { id: string; level: number } | null; evals: number; }
export function ctxFor(K: number): Ctx {
  loadCache(K);
  return { K, H: maxHousingAtHall(K, data), bases: basesFor(K), hero: K >= 7 ? heroAtKeep(K, data) : null, evals: 0 };
}

/** Three Smoke Bombs: on the defenses nearest the first squad's point, thrown as the squads arrive (crude static plan). */
function smokePlan(base: BaseLayout, plan: Deployment[]): Deployment[] {
  if (!plan.length) return [];
  const p0 = plan[0];
  const defs = base.buildings.filter((b) => data.buildings[b.type].category === 'defense' && !b.upgrading)
    .map((b) => ({ b, d: (b.x - p0.x) ** 2 + (b.y - p0.y) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 3);
  return defs.map((x, i) => ({ tick: 15 + i * 45, troop: 'smoke_bomb', x: x.b.x + 1, y: x.b.y + 1 }));
}

export function evaluate(ctx: Ctx, army: Army, entrySeed = 1, opts: { hero?: boolean; smoke?: boolean; phase?: string; label?: string } = {}): Eval {
  const useHero = opts.hero ?? true;
  const key = `${entrySeed}|${useHero ? 'H' : 'h'}|${opts.smoke ? 'S' : 's'}|${armyKey(army)}`;
  if (cache[key]) return cache[key];
  const levels = levelsFor(ctx.K, army);
  const d: number[] = [];
  const st: number[] = [];
  ctx.bases.forEach((b, i) => {
    const hero = useHero ? ctx.hero : null;
    const setup: BattleSetup = { seed: 4000 + ctx.K * 50 + i, base: b.base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const sim = createBattle(setup, data);
    let plan = botDeployments(sim.deployable, sim.grid.size, army, createRng(entrySeed * 7919 + i), data, levels, sim.entry);
    if (hero && plan.length) plan = [{ tick: 0, troop: hero.id, x: plan[0].x, y: plan[0].y }, ...plan];
    if (opts.smoke) plan = [...plan, ...smokePlan(b.base, plan)];
    const byTick = deploymentsByTick(plan);
    while (!sim.ended) step(sim, byTick.get(sim.tick));
    const r = battleResult(sim);
    d.push(r.destruction);
    st.push(r.stars);
  });
  const n = d.length;
  const e: Eval = { mean: d.reduce((a, b) => a + b, 0) / n, stars: st.reduce((a, b) => a + b, 0) / n, one: st.filter((s) => s >= 1).length / n, three: st.filter((s) => s === 3).length / n, d, st };
  cache[key] = e;
  dirty++;
  ctx.evals++;
  if (dirty >= 8) saveCache();
  log(ctx.K, opts.phase ?? 'misc', opts.label ?? '', army, entrySeed, e, { hero: useHero, smoke: Boolean(opts.smoke) });
  return e;
}

// ---------- baselines ----------
function newestRole(role: string, K: number): string | null {
  let best: string | null = null;
  for (const t of pool(K)) if (ROLE_OF[t] === role && (!best || TIER_OF[t] > TIER_OF[best])) best = t;
  return best;
}
/** sim/suggest.ts suggestedArmy for a village at Keep K with maxed camps and Dojo. */
export function suggestedAt(K: number): Army {
  const cap = maxHousingAtHall(K, data);
  const shares = suggestedShares(K, data);
  const picks: [string, number][] = [];
  for (const [role, share] of Object.entries(shares)) { const t = newestRole(role, K); if (t) picks.push([t, share]); }
  const total = picks.reduce((a, [, v]) => a + v, 0);
  const army: Army = {};
  let used = 0;
  for (const [t, share] of picks) { const n = Math.floor((cap * share) / total / h(t)); if (n > 0) { army[t] = n; used += n * h(t); } }
  const filler = picks.map(([t]) => t).sort((a, b) => h(a) - h(b))[0];
  if (filler) { const extra = Math.floor((cap - used) / h(filler)); if (extra > 0) army[filler] = (army[filler] ?? 0) + extra; }
  return army;
}
function roleShares(K: number, spec: Record<string, number>): Army {
  // spec: role -> share, newest troop of each role
  const shares: Record<string, number> = {};
  for (const [role, s] of Object.entries(spec)) { const t = role.includes(':') ? role.split(':')[1] : newestRole(role, K); if (t && troopKeep(t, data) <= K) shares[t] = (shares[t] ?? 0) + s; }
  return render(shares, maxHousingAtHall(K, data));
}
export function degenerates(K: number): [string, Army][] {
  const out: [string, Army][] = [];
  out.push(['sabo_heavy', roleShares(K, { saboteur: 0.6, blade: 0.4 })]);
  out.push(['sabo_mid', roleShares(K, { saboteur: 0.3, blade: 0.4, thrower: 0.3 })]);
  if (K >= 7) out.push(['warden_heal', roleShares(K, { 'x:bell_warden': 0.35, guardian: 0.15, mystic: 0.25, blade: 0.25 })]);
  out.push(['guard_heal', roleShares(K, { guardian: 0.5, mystic: 0.25, blade: 0.25 })]);
  out.push(['pure_stalker', roleShares(K, { 'x:shadow_stalker': 1 })]);
  out.push(['pure_shadow_newest', roleShares(K, { shadow: 1 })]);
  out.push(['throw_guard', roleShares(K, { thrower: 0.7, guardian: 0.3 })]);
  out.push(['throw_guard_55', roleShares(K, { thrower: 0.5, guardian: 0.5 })]);
  out.push(['infil_heavy', roleShares(K, { infiltrator: 0.7, blade: 0.3 })]);
  out.push(['pure_beast', roleShares(K, { beast: 1 })]);
  out.push(['pure_blade', roleShares(K, { blade: 1 })]);
  out.push(['pure_thrower', roleShares(K, { thrower: 1 })]);
  out.push(['pure_guardian', roleShares(K, { guardian: 1 })]);
  out.push(['pure_sky', roleShares(K, { sky: 1 })]);
  out.push(['pure_siege', roleShares(K, { siege: 1 })]);
  out.push(['pure_mystic', roleShares(K, { mystic: 1 })]);
  out.push(['pure_infil', roleShares(K, { infiltrator: 1 })]);
  out.push(['pure_sabo', roleShares(K, { saboteur: 1 })]);
  out.push(['blade_thrower_50', roleShares(K, { blade: 0.5, thrower: 0.5 })]);
  out.push(['bot_roles_t1', roleShares(K, Object.fromEntries(Object.entries(suggestedShares(K, data)).map(([r, s]) => [`x:${tierTroop(r, 1)}`, s])))]);
  return out;
}
function tierTroop(role: string, tier: number): string { return Object.keys(ROLE_OF).find((t) => ROLE_OF[t] === role && TIER_OF[t] === tier)!; }

export function baselines(K: number): [string, Army][] {
  const out: [string, Army][] = [];
  for (const c of COMPOSITIONS) { const a = buildArmy(c, K, data); if (a) out.push([`lab:${c.id}`, a]); }
  out.push(['bot_mix', botArmy(K, 1, data)]);
  out.push(['suggested', suggestedAt(K)]);
  return out;
}

const fmt = (e: Eval) => `${e.mean.toFixed(1).padStart(5)}  st ${e.stars.toFixed(2)}  1* ${(e.one * 100).toFixed(0).padStart(3)}%  3* ${(e.three * 100).toFixed(0).padStart(3)}%`;
const describe = (a: Army) => Object.entries(a).filter(([, n]) => n > 0).sort((x, y) => y[1] * h(y[0]) - x[1] * h(x[0])).map(([t, n]) => `${n}×${t}`).join(' ');

function runBaselines(K: number) {
  const ctx = ctxFor(K);
  console.log(`# Keep ${K} baselines (housing ${ctx.H}, hero ${ctx.hero ? `${ctx.hero.id} L${ctx.hero.level}` : 'none'}, 20 bases, entry seed 1)`);
  const t0 = Date.now();
  for (const [label, army] of [...baselines(K), ...degenerates(K)]) {
    if (!Object.keys(army).length) { console.log(`${label.padEnd(20)} (not available at this Keep)`); continue; }
    const e = evaluate(ctx, army, 1, { phase: 'baseline', label });
    console.log(`${label.padEnd(20)} ${fmt(e)}  h=${housingOf(army)}  ${describe(army)}`);
  }
  saveCache();
  console.log(`evals ${ctx.evals} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

function runScreen(K: number) {
  const ctx = ctxFor(K);
  const base = botArmy(K, 1, data);
  const s0 = sharesOf(base, ctx.H);
  const e0 = evaluate(ctx, base, 1, { phase: 'screen', label: 'bot_mix' });
  console.log(`# Keep ${K} marginal screen: bot mix ${fmt(e0)}; each row = 10% of housing moved proportionally from the mix to the troop`);
  const rows: [string, number, Eval][] = [];
  const t0 = Date.now();
  for (const t of pool(K)) {
    const s: Record<string, number> = {};
    for (const [k, v] of Object.entries(s0)) s[k] = v * 0.9;
    s[t] = (s[t] ?? 0) + 0.1;
    const army = render(s, ctx.H);
    const e = evaluate(ctx, army, 1, { phase: 'screen', label: `+${t}` });
    rows.push([t, e.mean - e0.mean, e]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  for (const [t, dm, e] of rows) console.log(`${t.padEnd(22)} ${ROLE_OF[t].padEnd(11)} t${TIER_OF[t]} L${troopLevelCapAt(K, data, t).toString().padEnd(2)} Δ ${dm >= 0 ? '+' : ''}${dm.toFixed(1).padStart(5)}  ${fmt(e)}`);
  saveCache();
  console.log(`evals ${ctx.evals} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

function screenRanks(K: number): string[] {
  const f = `${DIR}/log_K${K}.jsonl`;
  if (!existsSync(f)) return [];
  const rows = readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.phase === 'screen' && r.label.startsWith('+'));
  rows.sort((a, b) => b.mean - a.mean);
  return rows.map((r) => r.label.slice(1));
}

function startShares(K: number, name: string, H: number): Record<string, number> {
  if (name === 'bot') return sharesOf(botArmy(K, 1, data), H);
  if (name === 'support_light') return sharesOf(buildArmy(COMPOSITIONS.find((c) => c.id === 'support_light')!, K, data)!, H);
  if (name === 'suggested') return sharesOf(suggestedAt(K), H);
  if (name === 'best') { const all = [...distinctSeed1(K).values()].sort((a, b) => b.mean - a.mean); return sharesOf(all[0].army, H); }
  if (name.startsWith('random')) {
    const rng = createRng(K * 31 + 7 + (Number(name.slice(6)) || 0) * 101);
    const p = pool(K);
    const s: Record<string, number> = {};
    for (let i = 0; i < 5; i++) { const t = p[Math.floor(next(rng) * p.length)]; s[t] = (s[t] ?? 0) + 0.5 + next(rng); }
    return s;
  }
  throw new Error(`unknown start ${name}`);
}

function runClimb(K: number, start: string, maxRounds = 8, movesPerRound = 12) {
  const ctx = ctxFor(K);
  const ranked = screenRanks(K);
  const p = pool(K);
  const rng = createRng(K * 977 + start.length * 13 + 5);
  let cur = startShares(K, start, ctx.H);
  let curArmy = render(cur, ctx.H);
  let curE = evaluate(ctx, curArmy, 1, { phase: `climb:${start}`, label: 'start' });
  console.log(`# Keep ${K} climb from ${start}: ${fmt(curE)}  ${describe(curArmy)}`);
  let delta = 0.1;
  let fails = 0;
  const t0 = Date.now();
  for (let round = 0; round < maxRounds; round++) {
    const support = Object.keys(cur).filter((t) => cur[t] > 1e-9);
    const tried = new Set<string>([armyKey(curArmy)]);
    const cands: { s: Record<string, number>; army: Army; desc: string }[] = [];
    let guard = 0;
    while (cands.length < movesPerRound && guard++ < 400) {
      const from = support[Math.floor(next(rng) * support.length)];
      let to: string;
      if (ranked.length && next(rng) < 0.5) to = ranked[Math.floor(next(rng) * Math.min(8, ranked.length))];
      else to = p[Math.floor(next(rng) * p.length)];
      if (to === from) continue;
      const s = { ...cur };
      const amt = Math.min(delta, s[from]);
      s[from] -= amt;
      if (s[from] < 1e-9) delete s[from];
      s[to] = (s[to] ?? 0) + amt;
      const army = render(s, ctx.H);
      const key = armyKey(army);
      if (tried.has(key)) continue;
      tried.add(key);
      cands.push({ s, army, desc: `${from}→${to} ${amt.toFixed(2)}` });
    }
    let best: { s: Record<string, number>; army: Army; desc: string; e: Eval } | null = null;
    for (const c of cands) {
      const e = evaluate(ctx, c.army, 1, { phase: `climb:${start}`, label: c.desc });
      if (!best || e.mean > best.e.mean) best = { ...c, e };
    }
    if (best && best.e.mean > curE.mean + 0.05) {
      cur = best.s; curArmy = best.army; curE = best.e; fails = 0;
      console.log(`round ${round} Δ${delta} accept ${best.desc}: ${fmt(curE)}  ${describe(curArmy)}`);
    } else {
      fails++;
      console.log(`round ${round} Δ${delta} no improvement (best ${best ? best.e.mean.toFixed(1) : '-'})`);
      if (fails >= 2) { if (delta > 0.05) { delta = 0.05; fails = 0; } else break; }
    }
    saveCache();
    if ((Date.now() - t0) / 1000 > 560) { console.log('time budget reached'); break; }
  }
  saveCache();
  console.log(`END ${start}: ${fmt(curE)}  ${describe(curArmy)}  (evals ${ctx.evals}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

interface LogRow { K: number; phase: string; label: string; entrySeed: number; key: string; army: Army; mean: number; stars: number; one: number; three: number; d: number[]; hero?: boolean; smoke?: boolean }
function readLog(K: number): LogRow[] {
  const f = `${DIR}/log_K${K}.jsonl`;
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
}
function distinctSeed1(K: number): Map<string, LogRow> {
  const m = new Map<string, LogRow>();
  for (const r of readLog(K)) if (r.entrySeed === 1 && r.hero !== false && !r.smoke) m.set(r.key, r);
  return m;
}

function runFinal(K: number) {
  const ctx = ctxFor(K);
  const all = [...distinctSeed1(K).values()].sort((a, b) => b.mean - a.mean);
  if (!all.length) { console.log('no log'); return; }
  const best1 = all[0];
  const within3 = all.filter((r) => r.mean >= best1.mean - 3);
  console.log(`# Keep ${K} final. Distinct compositions evaluated (seed 1): ${all.length}; within 3 pts of best (${best1.mean.toFixed(1)}): ${within3.length} (${((within3.length / all.length) * 100).toFixed(0)}%)`);
  // candidates: top 10 + baselines + per-layout/bias bests
  const picks = new Map<string, { label: string; army: Army }>();
  all.slice(0, 10).forEach((r, i) => picks.set(r.key, { label: `top${i + 1}`, army: r.army }));
  for (const [label, army] of baselines(K)) picks.set(armyKey(army), { label, army });
  const layoutIds = LAYOUTS.map((l) => l.id);
  const perLayoutBest: Record<string, LogRow> = {};
  const perBiasBest: Record<string, LogRow> = {};
  const sub = (r: LogRow, f: (b: BaseCase) => boolean) => { const xs = r.d.filter((_, i) => f(ctx.bases[i])); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  for (const L of layoutIds) { let b: LogRow | null = null; for (const r of all) if (!b || sub(r, (x) => x.layout === L) > sub(b, (x) => x.layout === L)) b = r; perLayoutBest[L] = b!; }
  for (const B of [0.5, 1]) { let b: LogRow | null = null; for (const r of all) if (!b || sub(r, (x) => x.bias === B) > sub(b, (x) => x.bias === B)) b = r; perBiasBest[String(B)] = b!; }
  for (const [L, r] of Object.entries(perLayoutBest)) if (!picks.has(r.key)) picks.set(r.key, { label: `best@${L}`, army: r.army });
  for (const [B, r] of Object.entries(perBiasBest)) if (!picks.has(r.key)) picks.set(r.key, { label: `best@bias${B}`, army: r.army });

  console.log('\n## Final table (entry seed 1 | entry seed 2 | mean of both), 20 bases each');
  const rows: { label: string; army: Army; e1: Eval; e2: Eval; avg: number }[] = [];
  for (const [, { label, army }] of picks) {
    const e1 = evaluate(ctx, army, 1, { phase: 'final', label });
    const e2 = evaluate(ctx, army, 2, { phase: 'final', label });
    rows.push({ label, army, e1, e2, avg: (e1.mean + e2.mean) / 2 });
  }
  rows.sort((a, b) => b.avg - a.avg);
  for (const r of rows) console.log(`${r.label.padEnd(18)} s1 ${r.e1.mean.toFixed(1).padStart(5)} | s2 ${r.e2.mean.toFixed(1).padStart(5)} | avg ${r.avg.toFixed(1).padStart(5)}  st ${((r.e1.stars + r.e2.stars) / 2).toFixed(2)} 1* ${(((r.e1.one + r.e2.one) / 2) * 100).toFixed(0).padStart(3)}% 3* ${(((r.e1.three + r.e2.three) / 2) * 100).toFixed(0).padStart(3)}%  ${describe(r.army)}`);
  const top = rows[0];
  console.log(`\nBEST ${top.label}: ${top.avg.toFixed(1)} = ${describe(top.army)} (types ${Object.keys(top.army).length})`);
  const sugg = rows.find((r) => r.label === 'suggested')!;
  const bot = rows.find((r) => r.label === 'bot_mix')!;
  console.log(`margin over suggested ${(top.avg - sugg.avg).toFixed(1)}, over bot_mix ${(top.avg - bot.avg).toFixed(1)}`);
  for (const r of rows.filter((x) => x.label.startsWith('lab:'))) console.log(`margin over ${r.label}: ${(top.avg - r.avg).toFixed(1)}`);

  // Per-layout and per-bias breakdown of the best vs per-layout best (both seeds)
  console.log('\n## Best composition by layout and bias (avg of the two entry seeds); per-layout best from the log, re-fought with seed 2');
  const both = (army: Army, f: (b: BaseCase) => boolean) => { const e1 = evaluate(ctx, army, 1); const e2 = evaluate(ctx, army, 2); const xs = [...e1.d.filter((_, i) => f(ctx.bases[i])), ...e2.d.filter((_, i) => f(ctx.bases[i]))]; return xs.reduce((a, b) => a + b, 0) / xs.length; };
  for (const L of layoutIds) {
    const pb = perLayoutBest[L];
    console.log(`${L.padEnd(12)} global best ${both(top.army, (b) => b.layout === L).toFixed(1).padStart(5)} | layout best ${both(pb.army, (b) => b.layout === L).toFixed(1).padStart(5)} (${picks.get(pb.key)?.label ?? pb.label}: ${describe(pb.army)})`);
  }
  for (const B of [0.5, 1]) {
    const pb = perBiasBest[String(B)];
    console.log(`bias ${B}     global best ${both(top.army, (b) => b.bias === B).toFixed(1).padStart(5)} | bias best ${both(pb.army, (b) => b.bias === B).toFixed(1).padStart(5)} (${picks.get(pb.key)?.label ?? pb.label}: ${describe(pb.army)})`);
  }
  // Suggested and bot by layout
  console.log('\n## Suggested / bot mix / best by layout (avg both seeds)');
  for (const L of layoutIds) console.log(`${L.padEnd(12)} best ${both(top.army, (b) => b.layout === L).toFixed(1).padStart(5)}  suggested ${both(sugg.army, (b) => b.layout === L).toFixed(1).padStart(5)}  bot ${both(bot.army, (b) => b.layout === L).toFixed(1).padStart(5)}`);
  for (const B of [0.5, 1]) console.log(`bias ${B}     best ${both(top.army, (b) => b.bias === B).toFixed(1).padStart(5)}  suggested ${both(sugg.army, (b) => b.bias === B).toFixed(1).padStart(5)}  bot ${both(bot.army, (b) => b.bias === B).toFixed(1).padStart(5)}`);

  // Roles in near-optima (seed-1 log, within 3 of best)
  console.log('\n## Roles in near-optima (seed 1, within 3 pts of best, by housing share)');
  const roleCount: Record<string, number> = {};
  const roleShareSum: Record<string, number> = {};
  const troopCount: Record<string, number> = {};
  for (const r of within3) {
    const seen = new Set<string>();
    for (const [t, n] of Object.entries(r.army)) { if (n <= 0) continue; const role = ROLE_OF[t]; roleShareSum[role] = (roleShareSum[role] ?? 0) + (n * h(t)) / ctx.H; troopCount[t] = (troopCount[t] ?? 0) + 1; if (!seen.has(role)) { seen.add(role); roleCount[role] = (roleCount[role] ?? 0) + 1; } }
  }
  const roles = ['blade', 'thrower', 'guardian', 'saboteur', 'infiltrator', 'sky', 'mystic', 'siege', 'beast', 'shadow'];
  for (const role of roles) console.log(`${role.padEnd(12)} in ${(roleCount[role] ?? 0).toString().padStart(3)}/${within3.length} near-optima, mean share ${(((roleShareSum[role] ?? 0) / within3.length) * 100).toFixed(1)}%`);
  console.log('troops in near-optima: ' + Object.entries(troopCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' '));
  console.log('\n## Near-optima list (seed 1)');
  for (const r of within3.slice(0, 25)) console.log(`${r.mean.toFixed(1).padStart(5)} [${r.phase}] ${describe(r.army)}`);
  saveCache();
  console.log(`evals this run ${ctx.evals}`);
}

function runHero(K: number) {
  const ctx = ctxFor(K);
  if (!ctx.hero) { console.log('no hero at this Keep'); return; }
  const all = [...distinctSeed1(K).values()].sort((a, b) => b.mean - a.mean);
  const cands: [string, Army][] = [['bot_mix', botArmy(K, 1, data)], ['suggested', suggestedAt(K)]];
  if (all.length) cands.push(['best_found', all[0].army]);
  const sl = buildArmy(COMPOSITIONS.find((c) => c.id === 'support_light')!, K, data); if (sl) cands.push(['lab:support_light', sl]);
  console.log(`# Keep ${K} hero ${ctx.hero.id} L${ctx.hero.level}: with vs without setup.hero (same bases; both entry seeds)`);
  for (const [label, army] of cands) {
    const w1 = evaluate(ctx, army, 1, { hero: true, phase: 'hero', label }); const w2 = evaluate(ctx, army, 2, { hero: true, phase: 'hero', label });
    const n1 = evaluate(ctx, army, 1, { hero: false, phase: 'hero', label }); const n2 = evaluate(ctx, army, 2, { hero: false, phase: 'hero', label });
    const w = (w1.mean + w2.mean) / 2, n = (n1.mean + n2.mean) / 2;
    console.log(`${label.padEnd(18)} with ${w.toFixed(1).padStart(5)} (st ${((w1.stars + w2.stars) / 2).toFixed(2)}) without ${n.toFixed(1).padStart(5)} (st ${((n1.stars + n2.stars) / 2).toFixed(2)})  hero Δ ${(w - n >= 0 ? '+' : '')}${(w - n).toFixed(1)}`);
  }
  saveCache();
}

function runSmoke(K: number) {
  const ctx = ctxFor(K);
  const all = [...distinctSeed1(K).values()].sort((a, b) => b.mean - a.mean);
  const cands: [string, Army][] = [['bot_mix', botArmy(K, 1, data)], ['suggested', suggestedAt(K)]];
  if (all.length) cands.push(['best_found', all[0].army]);
  for (const [l, a] of degenerates(K)) if (['sabo_heavy', 'pure_shadow_newest', 'pure_stalker'].includes(l) && Object.keys(a).length) cands.push([l, a]);
  console.log(`# Keep ${K}: bot plan vs bot plan + 3 Smoke Bombs on the nearest defenses (both entry seeds)`);
  for (const [label, army] of cands) {
    const a = (evaluate(ctx, army, 1, { phase: 'smoke', label }).mean + evaluate(ctx, army, 2, { phase: 'smoke', label }).mean) / 2;
    const b = (evaluate(ctx, army, 1, { smoke: true, phase: 'smoke', label }).mean + evaluate(ctx, army, 2, { smoke: true, phase: 'smoke', label }).mean) / 2;
    console.log(`${label.padEnd(20)} plain ${a.toFixed(1).padStart(5)}  +smoke ${b.toFixed(1).padStart(5)}  Δ ${(b - a >= 0 ? '+' : '')}${(b - a).toFixed(1)}`);
  }
  saveCache();
}

export default function main(mode = 'baselines', keepArg = '5', a3 = '', a4 = '') {
  const K = Number(keepArg);
  if (mode === 'baselines') runBaselines(K);
  else if (mode === 'screen') runScreen(K);
  else if (mode === 'climb') runClimb(K, a3 || 'bot', a4 ? Number(a4) : 8);
  else if (mode === 'final') runFinal(K);
  else if (mode === 'hero') runHero(K);
  else if (mode === 'smoke') runSmoke(K);
  else if (mode === 'pool') { console.log(pool(K).map((t) => `${t}(${ROLE_OF[t]} t${TIER_OF[t]} h${h(t)} L${troopLevelCapAt(K, data, t)} ${familyOf(data.troops[t])})`).join('\n')); console.log('suggested', describe(suggestedAt(K)), 'bot', describe(botArmy(K, 1, data))); }
  else console.log('unknown mode');
}
