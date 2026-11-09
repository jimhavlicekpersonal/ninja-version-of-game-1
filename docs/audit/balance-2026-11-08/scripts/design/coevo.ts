/**
 * Co-evolution test of Tempering. (1) Search for the best army against EACH tempered profile (short coordinate
 * descent from the known best), so the attacker pool is not limited to a hand-picked panel. (2) Full matrix pool x
 * profiles (including heterogeneous bases: Kunai towers on one axis, Shuriken towers on another). (3) Universal-army
 * check: does some army stay within 5 points of the per-profile optimum against every profile? (4) Best-response
 * dynamics: defender answers the attacker, attacker answers the defender; does it cycle or settle?
 * node scratch/run.mjs scratch/design/coevo.ts <keep>
 */
import { createBattle, runBattle } from '../gp/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../gp/sim/battle/basegen';
import type { BaseLayout, BattleSetup } from '../gp/sim/battle/types';
import { defaultData } from '../gp/sim/data';
import { botDeployments } from '../gp/sim/defense';
import { heroAtKeep } from '../gp/sim/heroes';
import { troopLevelCapAt } from '../gp/sim/research';
import { createRng, next } from '../gp/sim/rng';
import type { GameData } from '../gp/sim/types';
import { troopKeep } from '../../tools/balance/armyLab';
import { maxHousingAtHall } from '../gp/sim/army';
import { writeFileSync } from 'node:fs';

type Army = Record<string, number>;
type W = { reach?: number; blast?: number; watch?: number };
const PANEL: Record<number, Record<string, Army>> = {
  12: {
    best_found: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    suggested: { moonblade_master: 117, chain_sickle_reaper: 78, mountain_shield: 18, fuse_master: 15 },
    blade_rush: { moonblade_master: 255, iron_monk: 12 },
    shadow: { void_walker: 157 },
    air: { thunder_kite: 78 },
    tanks_heal: { mountain_shield: 40, bell_warden: 10, spirit_caller: 20 },
    beasts: { bear_warrior: 70, boar_rider: 35 },
  },
  15: {
    best_found: { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    suggested: { storm_sovereign: 129, thousand_needle: 90, oni_breaker: 21, ghost_engineer: 18 },
    blade_rush: { storm_sovereign: 300, iron_monk: 12 },
    eclipse: { eclipse_ninja: 180 },
    air: { dragon_kite_armada: 90 },
    tanks_heal: { oni_breaker: 40, mountain_shield: 15, sage_of_clouds: 25 },
    beasts: { tiger_lord: 80, bear_warrior: 40 },
  },
};

/** Round-3 temper values; `per` lets Kunai and Shuriken towers take different axes (heterogeneous bases). */
function temper(d: GameData, per: Record<string, W>, airBuff: boolean) {
  const b = d.buildings as any;
  let blastSum = 0, watchSum = 0, n = 0;
  for (const [t, w] of Object.entries(per)) {
    const c = b[t].combat;
    const r = w.reach ?? 0, bl = w.blast ?? 0, s = w.watch ?? 0;
    blastSum += bl; watchSum += s; n++;
    c.range += 2 * r;
    if (r >= 0.5) b[t].effect = { kind: 'counter_artillery', prefersBeyond: 3.5 };
    if (t === 'acorn_cannon' && bl > 0) { c.splashRadius = 0.5 * bl; c.fireIntervalTicks = Math.round(c.fireIntervalTicks * (1 + 0.8 * bl)); }
    for (const lv of b[t].levels) lv.damage *= 1 - (0.2 * r + 0.2 * bl + 0.1 * s);
  }
  const blAvg = n ? blastSum / n : 0, sAvg = n ? watchSum / n : 0;
  if (blAvg > 0) for (const lv of b.pinecone_catapult.levels) lv.damage *= 1 + 0.15 * blAvg;
  if (sAvg > 0) {
    b.bitter_incense_burner.effect = { kind: 'anti_heal', radius: 3 + 2 * sAvg, healCutPct: 0.3 + 0.5 * sAvg, auraCutPct: 0.3 + 0.5 * sAvg };
    for (const lv of b.bitter_incense_burner.levels) lv.effect = { healCutPct: 0.3 + 0.5 * sAvg, auraCutPct: 0.3 + 0.5 * sAvg };
    for (const lv of b.firefly_tower.levels) lv.damage *= 1 + 0.3 * sAvg;
    b.firefly_tower.combat.fireIntervalTicks = Math.max(3, Math.round(b.firefly_tower.combat.fireIntervalTicks * (1 - 0.4 * sAvg)));
    for (const lv of b.thorn_snare.levels) lv.damage *= 1 + 1.0 * sAvg;
  }
  if (airBuff) for (const id of ['owl_bomber', 'crane_glider', 'lantern_balloon', 'thunder_kite']) for (const lv of (d.troops as any)[id].levels) { lv.hp *= 1.25; lv.damage *= 1.25; }
}
const both = (w: W): Record<string, W> => ({ acorn_cannon: w, wasp_nest: w });
const PROFILES: Record<string, Record<string, W>> = {
  today: both({}),
  reach: both({ reach: 1 }),
  blast: both({ blast: 1 }),
  watch: both({ watch: 1 }),
  reach_blast: both({ reach: 0.5, blast: 0.5 }),
  blast_watch: both({ blast: 0.5, watch: 0.5 }),
  reach_watch: both({ reach: 0.5, watch: 0.5 }),
  split_kunaiBlast_shurReach: { acorn_cannon: { blast: 1 }, wasp_nest: { reach: 1 } },
  split_kunaiReach_shurWatch: { acorn_cannon: { reach: 1 }, wasp_nest: { watch: 1 } },
};

function makeBases(K: number, d: GameData, seeds: number): BaseLayout[] {
  return LAYOUTS.flatMap((L) => Array.from({ length: seeds }, (_, s) => generateOpponent(96000 + K * 10 + s, K, d, { levelBias: 0.5, layout: L })));
}
function evalArmy(K: number, army: Army, d: GameData, bases: BaseLayout[], spread: boolean, entrySeeds = 1): number {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
  const hero = heroAtKeep(K, d);
  let dest = 0, n = 0;
  bases.forEach((base, i) => { for (let es = 1; es <= entrySeeds; es++) {
    const setup: BattleSetup = { seed: 400 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = createBattle(setup, d);
    let plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(es * 59 + i), d, levels, probe.entry);
    if (spread) {
      const e = probe.entry!; const used = e.points.map(() => 0); let k = 0; plan = [];
      for (const [t, cnt] of Object.entries(army)) for (let q = 0; q < cnt; q++) {
        const h = d.troops[t].housing; let tries = 0, idx = k % e.points.length;
        while (used[idx] + h > e.cover && tries < e.points.length) { k++; idx = k % e.points.length; tries++; }
        used[idx] += h; plan.push({ tick: Math.floor(q / 2), troop: t, x: Math.floor(e.points[idx].x), y: Math.floor(e.points[idx].y) }); k++;
      }
    }
    dest += runBattle(setup, plan, d).result.destruction; n++;
  } });
  return dest / n;
}
const housingOf = (a: Army, d: GameData) => Object.entries(a).reduce((s, [t, n]) => s + d.troops[t].housing * n, 0);
const desc = (a: Army) => Object.entries(a).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([t, n]) => `${n}×${t}`).join(' ');

/** Short coordinate descent against one tempered profile: move 10% of housing from one type to another. */
function climb(K: number, start: Army, d: GameData, bases: BaseLayout[], evals: number): { army: Army; score: number } {
  const H = maxHousingAtHall(K, d);
  const pool = Object.keys(d.troops).filter((t) => troopKeep(t, d) <= K);
  let cur: Army = { ...start };
  let curS = evalArmy(K, cur, d, bases, false);
  let used = 0;
  const rng = createRng(K * 7 + 3);
  while (used < evals) {
    let best: { army: Army; s: number } | null = null;
    const froms = Object.keys(cur).filter((t) => cur[t] > 0);
    for (let tries = 0; tries < 6 && used < evals; tries++) {
      const from = froms[Math.floor(next(rng) * froms.length)];
      const to = pool[Math.floor(next(rng) * pool.length)];
      if (to === from) continue;
      const moveH = Math.max(d.troops[from].housing, Math.round(H * 0.1 / d.troops[from].housing) * d.troops[from].housing);
      const nFrom = Math.min(cur[from], Math.round(moveH / d.troops[from].housing));
      const nTo = Math.floor((nFrom * d.troops[from].housing) / d.troops[to].housing);
      if (nTo < 1) continue;
      const cand: Army = { ...cur, [from]: cur[from] - nFrom, [to]: (cur[to] ?? 0) + nTo };
      if (cand[from] === 0) delete cand[from];
      const s = evalArmy(K, cand, d, bases, false); used++;
      if (!best || s > best.s) best = { army: cand, s };
    }
    if (best && best.s > curS + 0.3) { cur = best.army; curS = best.s; }
  }
  return { army: cur, score: curS };
}

export default function main(keepArg = '15') {
  const K = Number(keepArg);
  const L: string[] = [];
  const log = (s: string) => { L.push(s); console.log(s); };
  const pool: Record<string, Army> = { ...PANEL[K] };
  // (1) climb against each pure tempered profile and against today
  for (const pn of ['today', 'reach', 'blast', 'watch']) {
    const d = structuredClone(defaultData) as GameData;
    temper(d, PROFILES[pn], true);
    const bases = makeBases(K, d, 2);
    const r = climb(K, PANEL[K].best_found, d, bases, 36);
    pool[`climb_vs_${pn}`] = r.army;
    log(`climb vs ${pn}: ${r.score.toFixed(1)}  ${desc(r.army)}`);
  }
  // spread variants of the ranged lines
  const spreadOf: Record<string, string> = {};
  for (const an of Object.keys(pool)) if (an.startsWith('climb_') || an === 'best_found') { pool[`${an}_spread`] = pool[an]; spreadOf[`${an}_spread`] = an; }
  // (2) matrix
  const pns = Object.keys(PROFILES);
  const M: Record<string, Record<string, number>> = {};
  for (const pn of pns) {
    const d = structuredClone(defaultData) as GameData;
    temper(d, PROFILES[pn], true);
    const bases = makeBases(K, d, 2);
    M[pn] = {};
    for (const an of Object.keys(pool)) M[pn][an] = evalArmy(K, pool[an], d, bases, Boolean(spreadOf[an]), 2);
  }
  log(`\n== Keep ${K} matrix (mean destruction %, 10 bases x 2 entry seeds)`);
  log(['army'.padEnd(28), ...pns.map((p) => p.slice(0, 12).padStart(13))].join(' '));
  for (const an of Object.keys(pool)) log([an.padEnd(28), ...pns.map((p) => M[p][an].toFixed(1).padStart(13))].join(' '));
  // (3) universal army check
  log('\n== universal-army check: for each army, worst profile (min) and the gap to that profile\'s own best army');
  const bestPer = Object.fromEntries(pns.map((p) => [p, Math.max(...Object.values(M[p]))]));
  const rows = Object.keys(pool).map((an) => {
    const mins = pns.map((p) => [p, M[p][an], bestPer[p] - M[p][an]] as [string, number, number]);
    const worst = mins.reduce((a, b) => (b[1] < a[1] ? b : a));
    const maxGap = Math.max(...mins.map((m) => m[2]));
    return { an, min: worst[1], worstProfile: worst[0], maxGap };
  }).sort((a, b) => b.min - a.min);
  for (const r of rows.slice(0, 6)) log(`${r.an.padEnd(28)} worst ${r.min.toFixed(1)} vs ${r.worstProfile.padEnd(14)} largest gap to a profile's best army ${r.maxGap.toFixed(1)}`);
  log(`verdict: ${rows[0].maxGap <= 5 ? 'A UNIVERSAL ARMY EXISTS (within 5 of every profile\'s best): tempering did not remove the single answer' : 'no universal army: the safest army is ' + rows[0].maxGap.toFixed(1) + ' points below the best answer somewhere'}`);
  log(`defender side: best profile against the safest army ${rows[0].worstProfile}; profile minimizing the attacker's best response: ${pns.map((p) => [p, bestPer[p]] as [string, number]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([p, v]) => `${p} ${v.toFixed(1)}`).join(', ')}`);
  // (4) sequential best-response dynamics
  log('\n== best-response dynamics (defender answers the current army, attacker answers the new profile), 16 steps from (today, suggested)');
  let p = 'today', a = 'suggested';
  const seen: string[] = [];
  for (let step = 0; step < 16; step++) {
    const pBR = pns.reduce((x, y) => (M[y][a] < M[x][a] ? y : x));
    const aBR = Object.keys(pool).reduce((x, y) => (M[pBR][y] > M[pBR][x] ? y : x));
    log(`  step ${step}: attacker ${a.padEnd(26)} -> defender ${pBR.padEnd(26)} (${M[pBR][a].toFixed(1)}) -> attacker ${aBR.padEnd(26)} (${M[pBR][aBR].toFixed(1)})`);
    seen.push(`${pBR}|${aBR}`);
    p = pBR; a = aBR;
  }
  const uniq = new Set(seen);
  log(`distinct (profile, army) states visited: ${uniq.size} of 16 -> ${uniq.size <= 2 ? 'SETTLES on a fixed point (one answer)' : 'cycles among ' + uniq.size + ' states'}`);
  // fictitious play equilibrium
  const armies = Object.keys(pool);
  const cA = new Array(armies.length).fill(0), cP = new Array(pns.length).fill(0);
  let ai = 0, pi = 0;
  for (let t = 0; t < 100000; t++) {
    cA[ai]++; cP[pi]++;
    let ba = 0, bav = -Infinity; for (let i = 0; i < armies.length; i++) { let v = 0; for (let j = 0; j < pns.length; j++) v += M[pns[j]][armies[i]] * cP[j]; if (v > bav) { bav = v; ba = i; } }
    let bp = 0, bpv = Infinity; for (let j = 0; j < pns.length; j++) { let v = 0; for (let i = 0; i < armies.length; i++) v += M[pns[j]][armies[i]] * cA[i]; if (v < bpv) { bpv = v; bp = j; } }
    ai = ba; pi = bp;
  }
  const fmt = (names: string[], c: number[]) => names.map((n, i) => [n, c[i] / 100000] as [string, number]).filter(([, w]) => w > 0.03).sort((x, y) => y[1] - x[1]).map(([n, w]) => `${n} ${(w * 100).toFixed(0)}%`).join(', ');
  log(`mixed equilibrium: attacker {${fmt(armies, cA)}}; defender {${fmt(pns, cP)}}`);
  writeFileSync(`scratch/design/coevo_K${K}.out`, L.join('\n') + '\n');
}
