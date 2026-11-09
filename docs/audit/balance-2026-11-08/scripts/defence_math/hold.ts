/**
 * Dimension defence_math, step 3: can a base hold at all?
 * Run: node scratch/run.mjs scratch/defence_math/hold.ts a          (generated bases, bias 0.5 vs 1.0, Keeps 3-15 x 5 layouts)
 *      node scratch/run.mjs scratch/defence_math/hold.ts b [days]   (model villages after `days` of play vs generated bases of the same Keep)
 */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, BattleSetup } from '../../src/gameplay/sim/battle/types';
import { buildingDef, defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments, villageToBase } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import { hallLevel } from '../../src/gameplay/sim/village';
import { activeHour, casualDays, ModelPlayer, normalDays } from '../../tools/balance/playerModel';

const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function attacker(keep: number) {
  const army = botArmy(keep, 1, data);
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = keep >= 7 ? heroAtKeep(keep, data) ?? undefined : undefined;
  return { army, levels, hero };
}

function fight(base: BaseLayout, keep: number, battleSeed: number, entrySeed: number) {
  const { army, levels, hero } = attacker(keep);
  const setup: BattleSetup = { seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(entrySeed), data, levels, probe.entry);
  const { result, sim } = runBattle(setup, plan, data);
  const trapEvents = sim.buildings.filter((b) => b.kind === 'trap' && b.destroyed).length;
  return { destruction: result.destruction, stars: result.stars, traps: trapEvents, trapsTotal: sim.buildings.filter((b) => b.kind === 'trap').length };
}

function partA() {
  console.log('== Hold test: generated bases, bias 0.5 (one level under caps) vs 1.0 (maxed), capped bot mix + hero, 2 base seeds x 2 entry seeds per cell');
  console.log(pad('K', 2), pad('layout', 12), pad('b.5 dest', 8), pad('held', 5), pad('3st', 4), pad('| b1 dest', 9), pad('held', 5), pad('3st', 4), pad('| traps sprung/placed', 20));
  const agg: Record<string, { d: number[]; h: number[]; s: number[] }> = {};
  for (let keep = 3; keep <= 15; keep++) {
    for (const L of LAYOUTS) {
      const cells: Record<string, { d: number[]; h: number[]; s: number[]; tr: number[]; tt: number[] }> = {};
      for (const bias of [0.5, 1]) {
        const c = { d: [] as number[], h: [] as number[], s: [] as number[], tr: [] as number[], tt: [] as number[] };
        for (let s = 0; s < 2; s++) {
          const seed = 70000 + keep * 1000 + s * 131 + LAYOUTS.indexOf(L) * 17;
          const base = generateOpponent(seed, keep, data, { levelBias: bias, layout: L });
          for (let e = 0; e < 2; e++) {
            const r = fight(base, keep, seed * 3 + e * 7, 500 + e * 11 + s);
            c.d.push(r.destruction);
            c.h.push(r.stars === 0 ? 1 : 0);
            c.s.push(r.stars === 3 ? 1 : 0);
            c.tr.push(r.traps);
            c.tt.push(r.trapsTotal);
          }
        }
        cells[String(bias)] = c;
        const k = `${bias}`;
        agg[k] ??= { d: [], h: [], s: [] };
        agg[k].d.push(...c.d);
        agg[k].h.push(...c.h);
        agg[k].s.push(...c.s);
      }
      const a = cells['0.5'];
      const b = cells['1'];
      console.log(pad(keep, 2), pad(L.id, 12), pad(f(mean(a.d)), 8), pad(f(mean(a.h) * 100, 0) + '%', 5), pad(f(mean(a.s) * 100, 0) + '%', 4), pad(f(mean(b.d)), 9), pad(f(mean(b.h) * 100, 0) + '%', 5), pad(f(mean(b.s) * 100, 0) + '%', 4), pad(`${f(mean(a.tr), 1)}/${f(mean(a.tt), 0)}`, 20));
    }
  }
  for (const k of ['0.5', '1']) console.log(`all Keeps 3-15, bias ${k}: destruction ${f(mean(agg[k].d))}, held ${f(mean(agg[k].h) * 100, 0)}%, 3-star ${f(mean(agg[k].s) * 100, 0)}%`);
}

function describe(base: BaseLayout, keep: number): string {
  const lim = data.hall.levels[keep - 1].limits;
  const by: Record<string, { n: number; lv: number[]; up: number }> = {};
  for (const b of base.buildings) {
    const d = buildingDef(data, b.type);
    if (!['defense', 'trap', 'hedge', 'support'].includes(d.category)) continue;
    by[b.type] ??= { n: 0, lv: [], up: 0 };
    by[b.type].n++;
    by[b.type].lv.push(b.level);
    if (b.upgrading) by[b.type].up++;
  }
  const parts: string[] = [];
  for (const t of ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura', 'thorn_snare', 'sap_puddle', 'paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'bramble_hedge']) {
    const l = lim[t];
    if (!l) continue;
    const have = by[t];
    parts.push(`${t.split('_')[0]}:${have ? have.n : 0}/${l.count}@${have ? f(mean(have.lv), 1) : '-'}/${l.maxLevel}${have?.up ? `(${have.up}upg)` : ''}`);
  }
  // Spread: mean Chebyshev distance of defences from the map centre.
  const c = data.economy.mapSize / 2;
  const ds = base.buildings.filter((b) => buildingDef(data, b.type).category === 'defense').map((b) => Math.max(Math.abs(b.x + 1.5 - c), Math.abs(b.y + 1.5 - c)));
  parts.push(`defence spread ${f(mean(ds), 1)} tiles from centre`);
  return parts.join(' ');
}

/** The village with every defence, trap, counter and wall at the Keep's cap minus `below`. */
function levelled(base: BaseLayout, keep: number, below: number): BaseLayout {
  const lim = data.hall.levels[keep - 1].limits;
  return { ...base, buildings: base.buildings.map((b) => {
    const d = buildingDef(data, b.type);
    if (!['defense', 'trap', 'hedge', 'support'].includes(d.category)) return { ...b, upgrading: false };
    return { ...b, level: Math.max(1, (lim[b.type]?.maxLevel ?? b.level) - below), upgrading: false };
  }) };
}

function partB(days: number) {
  const runs: { name: string; p: ModelPlayer }[] = [];
  for (const [name, policy, casual] of [['regular raider', 'raider', false], ['regular defender', 'defender', false], ['casual raider', 'raider', true]] as const) {
    const t0 = Date.now();
    const p = new ModelPlayer(data, { raidsPerSession: 2, policy });
    activeHour(p, 60, 2);
    (casual ? casualDays : normalDays)(p, days);
    console.log(`${name}: ${days} days in ${((Date.now() - t0) / 1000).toFixed(0)} s, Keep ${hallLevel(p.state, data)}, ${p.defenseLog.length} raids against it, held ${f(mean(p.defenseLog.map((d) => (d.stars === 0 ? 1 : 0))) * 100, 0)}%, mean destruction ${f(mean(p.defenseLog.map((d) => d.destruction)))}`);
    runs.push({ name, p });
  }
  console.log('\n== Model villages vs generated bases of the same Keep (same attacker: capped bot mix + hero of that Keep; 4 battle seeds x 2 entry seeds)');
  console.log(pad('village', 44), pad('dest', 6), pad('held', 5), pad('3st', 4), pad('traps', 6));
  for (const { name, p } of runs) {
    const keep = hallLevel(p.state, data);
    const now = p.clock.now();
    const base = villageToBase(p.state, now, data);
    console.log(`\n${name} at Keep ${keep}: ${describe(base, keep)}`);
    const variants: [string, BaseLayout][] = [
      ['as is (villageToBase, upgrades paused)', base],
      ['as is, nothing upgrading', { ...base, buildings: base.buildings.map((b) => ({ ...b, upgrading: false })) }],
      ['defences/walls at cap-1 (like bias 0.5)', levelled(base, keep, 1)],
      ['defences/walls at cap (like bias 1)', levelled(base, keep, 0)],
      ['walls removed, at cap-1', { ...levelled(base, keep, 1), buildings: levelled(base, keep, 1).buildings.filter((b) => buildingDef(data, b.type).category !== 'hedge') }],
    ];
    for (const [vn, vb] of variants) {
      const rs = [] as ReturnType<typeof fight>[];
      for (let s = 0; s < 4; s++) for (let e = 0; e < 2; e++) rs.push(fight(vb, keep, 90000 + s * 13 + e, 700 + e * 5 + s));
      console.log(pad(vn, 44), pad(f(mean(rs.map((r) => r.destruction))), 6), pad(f(mean(rs.map((r) => (r.stars === 0 ? 1 : 0))) * 100, 0) + '%', 5), pad(f(mean(rs.map((r) => (r.stars === 3 ? 1 : 0))) * 100, 0) + '%', 4), pad(`${f(mean(rs.map((r) => r.traps)), 1)}/${f(mean(rs.map((r) => r.trapsTotal)), 0)}`, 6));
    }
    for (const bias of [0.5, 1]) {
      const rs = [] as ReturnType<typeof fight>[];
      for (const L of LAYOUTS) for (let s = 0; s < 2; s++) {
        const gb = generateOpponent(91000 + s * 17 + LAYOUTS.indexOf(L), keep, data, { levelBias: bias, layout: L });
        for (let e = 0; e < 2; e++) rs.push(fight(gb, keep, 90000 + s * 13 + e, 700 + e * 5 + s));
      }
      console.log(pad(`generated Keep ${keep} bases, bias ${bias} (5 layouts x 2)`, 44), pad(f(mean(rs.map((r) => r.destruction))), 6), pad(f(mean(rs.map((r) => (r.stars === 0 ? 1 : 0))) * 100, 0) + '%', 5), pad(f(mean(rs.map((r) => (r.stars === 3 ? 1 : 0))) * 100, 0) + '%', 4), pad(`${f(mean(rs.map((r) => r.traps)), 1)}/${f(mean(rs.map((r) => r.trapsTotal)), 0)}`, 6));
    }
    const sample = generateOpponent(91000, keep, data, { levelBias: 0.5, layout: LAYOUTS[1] });
    console.log(`generated sample (walled_keep, bias 0.5): ${describe(sample, keep)}`);
  }
}

export default function main(part = 'a', daysArg = '25') {
  if (part === 'a') partA();
  else partB(Number(daysArg));
}
