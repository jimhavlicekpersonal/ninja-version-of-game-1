/**
 * Dimension defence_math: what each defence TYPE contributes when it fires, per Coin of its cumulative cost.
 * Method: "silence" every building of one type (BaseBuilding.upgrading = true: it neither fires nor runs its
 * effect, battle.ts createBattle via activeInBattle) while it keeps its HP, its tiles and its place in the
 * layout hash, so the Infiltration Points and the bot's path are unchanged (no entry-shift confound).
 * Walls cannot be silenced: they are set to level 1 instead (180 HP, hash unchanged).
 * Run: node scratch/run.mjs scratch/defence_math/contrib.ts [keeps=6,9,12,15] [baseSeeds=3] [entrySeeds=2] [bias=0.5]
 */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS, totalLoot } from '../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import { writeFileSync } from 'node:fs';

const costOf = (c: Record<string, number> | undefined) => Object.values(c ?? {}).reduce((a, b) => a + b, 0);
const cumCost = (type: string, level: number) => data.buildings[type].levels.slice(0, level).reduce((s, l) => s + costOf(l.cost as Record<string, number>), 0);
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);

const GROUPS: [string, string, string[]][] = [
  ['K', 'Kunai Towers silenced', ['acorn_cannon']],
  ['S', 'Shuriken Towers silenced', ['wasp_nest']],
  ['M', 'Mortars silenced', ['pinecone_catapult']],
  ['A', 'Sky Bows silenced', ['firefly_tower']],
  ['B', 'Ballistas silenced', ['kite_cutter_ballista']],
  ['Y', 'Yaguras silenced', ['longbow_yagura']],
  ['T', 'Traps silenced', ['thorn_snare', 'sap_puddle']],
  ['C', 'Soft counters silenced', ['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner']],
  ['W', 'Walls to level 1', ['bramble_hedge']],
  ['Z', 'Every defence silenced (towers, traps, counters) and walls L1', ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura', 'thorn_snare', 'sap_puddle', 'paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'bramble_hedge']],
];

function variant(base: BaseLayout, types: string[]): { base: BaseLayout; cost: number; n: number } {
  let cost = 0;
  let n = 0;
  const buildings = base.buildings.map((b) => {
    if (!types.includes(b.type)) return { ...b };
    n++;
    if (b.type === 'bramble_hedge') { cost += cumCost(b.type, b.level) - cumCost(b.type, 1); return { ...b, level: 1 }; }
    cost += cumCost(b.type, b.level);
    return { ...b, upgrading: true };
  });
  return { base: { ...base, buildings }, cost, n };
}

export default function main(keepsArg = '6,9,12,15', baseSeedsArg = '3', entrySeedsArg = '2', biasArg = '0.5') {
  const keeps = keepsArg.split(',').map(Number);
  const nBase = Number(baseSeedsArg);
  const nEntry = Number(entrySeedsArg);
  const bias = Number(biasArg);
  const t0 = Date.now();
  let battles = 0;
  const out: Record<string, unknown>[] = [];
  for (const keep of keeps) {
    const army = botArmy(keep, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const hero = keep >= 7 ? heroAtKeep(keep, data) ?? undefined : undefined;
    const fightOne = (base: BaseLayout, battleSeed: number, entrySeed: number) => {
      const setup: BattleSetup = { seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = createBattle(setup, data);
      const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(entrySeed), data, levels, probe.entry);
      const { result, sim } = runBattle(setup, plan, data);
      const tl = totalLoot(base);
      const total = (tl.acorns ?? 0) + (tl.dew ?? 0);
      const got = (result.loot.acorns ?? 0) + (result.loot.dew ?? 0);
      const dead = sim.troops.filter((t) => t.dead).length;
      battles++;
      return { d: result.destruction, s: result.stars, l: total ? got / total : 0, dead, troops: sim.troops.length };
    };
    const per: Record<string, { diffs: number[]; dest: number[]; held: number[]; s3: number[]; cost: number[]; dead: number[]; n: number[]; byLayout: Record<string, number[]> }> = {};
    const baseline = { dest: [] as number[], held: [] as number[], s3: [] as number[], dead: [] as number[], troops: [] as number[] };
    for (const L of LAYOUTS) {
      for (let s = 0; s < nBase; s++) {
        const baseSeed = 50000 + keep * 1000 + s * 97 + LAYOUTS.indexOf(L) * 13;
        const base = generateOpponent(baseSeed, keep, data, { levelBias: bias, layout: L });
        const seeds = Array.from({ length: nEntry }, (_, e) => [baseSeed * 7 + e * 101 + 3, 1000 + e * 37 + s] as const);
        const br = seeds.map(([bs, es]) => fightOne(base, bs, es));
        for (const r of br) { baseline.dest.push(r.d); baseline.held.push(r.s === 0 ? 1 : 0); baseline.s3.push(r.s === 3 ? 1 : 0); baseline.dead.push(r.dead); baseline.troops.push(r.troops); }
        for (const [id, , types] of GROUPS) {
          const v = variant(base, types);
          if (v.n === 0) continue;
          per[id] ??= { diffs: [], dest: [], held: [], s3: [], cost: [], dead: [], n: [], byLayout: {} };
          const vr = seeds.map(([bs, es]) => fightOne(v.base, bs, es));
          vr.forEach((r, i) => {
            per[id].diffs.push(r.d - br[i].d);
            per[id].dest.push(r.d);
            per[id].held.push(r.s === 0 ? 1 : 0);
            per[id].s3.push(r.s === 3 ? 1 : 0);
            per[id].dead.push(r.dead);
            (per[id].byLayout[L.id] ??= []).push(r.d - br[i].d);
          });
          per[id].cost.push(v.cost);
          per[id].n.push(v.n);
        }
      }
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const se = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, xs.length - 1) / xs.length); };
    console.log(`\n== Keep ${keep}, bias ${bias}: baseline destruction ${f(mean(baseline.dest))} held ${f(mean(baseline.held) * 100, 0)}% 3-star ${f(mean(baseline.s3) * 100, 0)}%; attackers killed ${f(mean(baseline.dead), 0)} of ${f(mean(baseline.troops), 0)}`);
    console.log(pad('id', 2), pad('silenced', 58), pad('n/base', 6), pad('cost', 11), pad('dest', 6), pad('+dest', 6), pad('se', 4), pad('held', 5), pad('3st', 4), pad('killed', 6), pad('pts/1M', 7), ...LAYOUTS.map((L) => pad(L.id.slice(0, 6), 7)));
    const rows: Record<string, unknown>[] = [];
    for (const [id, name] of GROUPS) {
      const p = per[id];
      if (!p) { console.log(pad(id, 2), pad(name, 58), 'none at this Keep'); continue; }
      const cost = mean(p.cost);
      const d = mean(p.diffs);
      console.log(pad(id, 2), pad(name, 58), pad(f(mean(p.n), 1), 6), pad(Math.round(cost), 11), pad(f(mean(p.dest)), 6), pad((d >= 0 ? '+' : '') + f(d), 6), pad(f(se(p.diffs)), 4), pad(f(mean(p.held) * 100, 0) + '%', 5), pad(f(mean(p.s3) * 100, 0) + '%', 4), pad(f(mean(p.dead), 0), 6), pad(f(d / (cost / 1e6), 2), 7), ...LAYOUTS.map((L) => pad(p.byLayout[L.id] ? f(mean(p.byLayout[L.id])) : '-', 7)));
      rows.push({ id, name, n: mean(p.n), cost, dest: mean(p.dest), dDest: d, se: se(p.diffs), held: mean(p.held), s3: mean(p.s3), killed: mean(p.dead), ptsPerM: d / (cost / 1e6), byLayout: Object.fromEntries(Object.entries(p.byLayout).map(([k, v]) => [k, mean(v)])) });
    }
    out.push({ keep, bias, baseline: { dest: mean(baseline.dest), held: mean(baseline.held), s3: mean(baseline.s3), killed: mean(baseline.dead), troops: mean(baseline.troops) }, rows });
    console.log(`(${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  writeFileSync(`scratch/defence_math/contrib_${keepsArg.replace(/,/g, '-')}_b${biasArg}.json`, JSON.stringify(out));
}
