/**
 * Dimension defence_math, gap (b): what is anti-air worth against the army it exists for?
 * Same bases as contrib.ts / marginal.ts (5 LAYOUTS x baseSeeds at levelBias, same seeds), hero of the Keep,
 * bot deployment plan, but the attacker is a chosen army (default: the pure air army the army search found strong,
 * 90 x dragon_kite_armada at Keep 15). Variants: silence one defence class (BaseBuilding.upgrading = true keeps HP,
 * tiles and the layout hash: no entry shift) or raise one class by a level (marginal.ts levelUp, capped at the Keep).
 * Run: node scratch/run.mjs scratch/defence_math/antiair.ts [keep=15] [army=dragon_kite_armada:90] [baseSeeds=3] [entrySeeds=2] [bias=0.5]
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
const levelCost = (type: string, level: number) => costOf(data.buildings[type].levels[level - 1]?.cost as Record<string, number>);
const cumCost = (type: string, level: number) => data.buildings[type].levels.slice(0, level).reduce((s, l) => s + costOf(l.cost as Record<string, number>), 0);
const capAt = (keep: number, type: string) => data.hall.levels[keep - 1].limits[type]?.maxLevel ?? 0;
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const se = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, xs.length - 1) / xs.length); };

type Apply = (base: BaseLayout, keep: number) => { base: BaseLayout; cost: number; n: number };

function silence(types: string[]): Apply {
  return (base) => {
    let cost = 0; let n = 0;
    const buildings = base.buildings.map((b) => {
      if (!types.includes(b.type)) return { ...b };
      n++;
      if (b.type === 'bramble_hedge') { cost += cumCost(b.type, b.level) - cumCost(b.type, 1); return { ...b, level: 1 }; }
      cost += cumCost(b.type, b.level);
      return { ...b, upgrading: true };
    });
    return { base: { ...base, buildings }, cost, n };
  };
}
function levelUp(types: string[]): Apply {
  return (base, keep) => {
    let cost = 0; let n = 0;
    const buildings = base.buildings.map((b) => {
      if (!types.includes(b.type) || b.level >= capAt(keep, b.type)) return { ...b };
      n++; cost += levelCost(b.type, b.level + 1);
      return { ...b, level: b.level + 1 };
    });
    return { base: { ...base, buildings }, cost, n };
  };
}

const AA = ['firefly_tower', 'kite_cutter_ballista'];
const VARIANTS: [string, string, Apply][] = [
  ['A', 'Sky Bows silenced', silence(['firefly_tower'])],
  ['B', 'Ballistas silenced', silence(['kite_cutter_ballista'])],
  ['AB', 'Sky Bows + Ballistas silenced', silence(AA)],
  ['S', 'Shuriken Towers silenced', silence(['wasp_nest'])],
  ['ABS', 'All anti-air silenced (Sky Bow, Ballista, Shuriken)', silence([...AA, 'wasp_nest'])],
  ['M', 'Mortars silenced (control: ground only)', silence(['pinecone_catapult'])],
  ['K', 'Kunai Towers silenced (control: hits grounded flyers only)', silence(['acorn_cannon'])],
  ['Y', 'Yaguras silenced (control)', silence(['longbow_yagura'])],
  ['C', 'Soft counters silenced', silence(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner'])],
  ['Z', 'Every defence silenced, walls L1', silence(['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura', 'thorn_snare', 'sap_puddle', 'paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'bramble_hedge'])],
  ['d', 'SkyBow +1 level', levelUp(['firefly_tower'])],
  ['e', 'Ballista +1 level', levelUp(['kite_cutter_ballista'])],
  ['b', 'Shuriken +1 level', levelUp(['wasp_nest'])],
  ['c', 'Mortar +1 level (control)', levelUp(['pinecone_catapult'])],
  ['a', 'Kunai +1 level (control)', levelUp(['acorn_cannon'])],
];

export default function main(keepArg = '15', armyArg = 'dragon_kite_armada:90', baseSeedsArg = '3', entrySeedsArg = '2', biasArg = '0.5') {
  const keep = Number(keepArg);
  const nBase = Number(baseSeedsArg);
  const nEntry = Number(entrySeedsArg);
  const bias = Number(biasArg);
  const army: Record<string, number> = armyArg === 'bot' ? botArmy(keep, 1, data) : Object.fromEntries(armyArg.split(',').map((p) => { const [t, n] = p.split(':'); return [t, Number(n)]; }));
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = keep >= 7 ? heroAtKeep(keep, data) ?? undefined : undefined;
  const t0 = Date.now();
  let battles = 0;
  const fightOne = (base: BaseLayout, battleSeed: number, entrySeed: number) => {
    const setup: BattleSetup = { seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = createBattle(setup, data);
    const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(entrySeed), data, levels, probe.entry);
    const { result, sim } = runBattle(setup, plan, data);
    const tl = totalLoot(base);
    const total = (tl.acorns ?? 0) + (tl.dew ?? 0);
    const got = (result.loot.acorns ?? 0) + (result.loot.dew ?? 0);
    battles++;
    return { d: result.destruction, s: result.stars, l: total ? got / total : 0, dead: sim.troops.filter((t) => t.dead).length, troops: sim.troops.length };
  };
  const per: Record<string, { diffs: number[]; dLoot: number[]; dest: number[]; held: number[]; s3: number[]; cost: number[]; dead: number[]; n: number[]; byLayout: Record<string, number[]> }> = {};
  const baseline = { dest: [] as number[], held: [] as number[], s3: [] as number[], loot: [] as number[], dead: [] as number[], troops: [] as number[], byLayout: {} as Record<string, number[]> };
  for (const L of LAYOUTS) {
    for (let s = 0; s < nBase; s++) {
      const baseSeed = 50000 + keep * 1000 + s * 97 + LAYOUTS.indexOf(L) * 13;
      const base = generateOpponent(baseSeed, keep, data, { levelBias: bias, layout: L });
      const seeds = Array.from({ length: nEntry }, (_, e) => [baseSeed * 7 + e * 101 + 3, 1000 + e * 37 + s] as const);
      const br = seeds.map(([bs, es]) => fightOne(base, bs, es));
      for (const r of br) { baseline.dest.push(r.d); baseline.held.push(r.s === 0 ? 1 : 0); baseline.s3.push(r.s === 3 ? 1 : 0); baseline.loot.push(r.l); baseline.dead.push(r.dead); baseline.troops.push(r.troops); (baseline.byLayout[L.id] ??= []).push(r.d); }
      for (const [id, , apply] of VARIANTS) {
        const v = apply(base, keep);
        if (v.n === 0) continue;
        per[id] ??= { diffs: [], dLoot: [], dest: [], held: [], s3: [], cost: [], dead: [], n: [], byLayout: {} };
        const vr = seeds.map(([bs, es]) => fightOne(v.base, bs, es));
        vr.forEach((r, i) => {
          per[id].diffs.push(r.d - br[i].d);
          per[id].dLoot.push(r.l - br[i].l);
          per[id].dest.push(r.d); per[id].held.push(r.s === 0 ? 1 : 0); per[id].s3.push(r.s === 3 ? 1 : 0); per[id].dead.push(r.dead);
          (per[id].byLayout[L.id] ??= []).push(r.d - br[i].d);
        });
        per[id].cost.push(v.cost); per[id].n.push(v.n);
      }
    }
  }
  console.log(`\n== Keep ${keep}, bias ${bias}, army ${JSON.stringify(army)} levels ${JSON.stringify(levels)} hero ${JSON.stringify(hero ?? null)}`);
  console.log(`baseline: destruction ${f(mean(baseline.dest))} (se ${f(se(baseline.dest))}) held ${f(mean(baseline.held) * 100, 0)}% 3-star ${f(mean(baseline.s3) * 100, 0)}% loot taken ${f(mean(baseline.loot) * 100, 0)}%; attackers killed ${f(mean(baseline.dead), 0)} of ${f(mean(baseline.troops), 0)}; by layout ${LAYOUTS.map((L) => `${L.id} ${f(mean(baseline.byLayout[L.id]))}`).join(', ')}`);
  console.log('silenced: +dest = destruction added when the class does not fire (its value); +1 level: +dest = destruction removed by the upgrade (negative = the upgrade hurt). pts/1M = |+dest| per 1M Coins of the class (silenced) or of the upgrade (+1).');
  console.log(pad('id', 3), pad('variant', 56), pad('n/base', 6), pad('cost', 11), pad('dest', 6), pad('+dest', 6), pad('se', 4), pad('t', 5), pad('dLoot%', 6), pad('held', 5), pad('3st', 4), pad('killed', 6), pad('pts/1M', 7), ...LAYOUTS.map((L) => pad(L.id.slice(0, 6), 7)));
  const rows: Record<string, unknown>[] = [];
  for (const [id, name] of VARIANTS) {
    const p = per[id];
    if (!p) { console.log(pad(id, 3), pad(name, 56), 'none at this Keep'); continue; }
    const cost = mean(p.cost); const d = mean(p.diffs); const sd = se(p.diffs);
    const up = /^[a-e]$/.test(id);
    const eff = up ? -d : d;
    console.log(pad(id, 3), pad(name, 56), pad(f(mean(p.n), 1), 6), pad(Math.round(cost), 11), pad(f(mean(p.dest)), 6), pad((d >= 0 ? '+' : '') + f(d), 6), pad(f(sd), 4), pad(f(sd > 0 ? d / sd : 0), 5), pad(f(mean(p.dLoot) * 100), 6), pad(f(mean(p.held) * 100, 0) + '%', 5), pad(f(mean(p.s3) * 100, 0) + '%', 4), pad(f(mean(p.dead), 0), 6), pad(f(eff / (cost / 1e6), 2), 7), ...LAYOUTS.map((L) => pad(p.byLayout[L.id] ? f(mean(p.byLayout[L.id])) : '-', 7)));
    rows.push({ id, name, n: mean(p.n), cost, dest: mean(p.dest), dDest: d, se: sd, dLoot: mean(p.dLoot), held: mean(p.held), s3: mean(p.s3), killed: mean(p.dead), ptsPerM: eff / (cost / 1e6), byLayout: Object.fromEntries(Object.entries(p.byLayout).map(([k, v]) => [k, mean(v)])) });
  }
  console.log(`(${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  writeFileSync(`scratch/defence_math/antiair_K${keep}_${armyArg.replace(/[:,]/g, '_')}_b${biasArg}.json`, JSON.stringify({ keep, bias, army, levels, hero, baseline: { dest: mean(baseline.dest), se: se(baseline.dest), held: mean(baseline.held), s3: mean(baseline.s3), loot: mean(baseline.loot), killed: mean(baseline.dead), troops: mean(baseline.troops), byLayout: Object.fromEntries(Object.entries(baseline.byLayout).map(([k, v]) => [k, mean(v)])) }, rows }));
}
