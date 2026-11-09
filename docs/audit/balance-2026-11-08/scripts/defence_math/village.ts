/**
 * Dimension defence_math, step 3b: why is a model player's village weaker than a generated base of the same Keep?
 * Decomposes inventory (which buildings, at which levels) from placement (where) and walls.
 * Run: node scratch/run.mjs scratch/defence_math/village.ts [days=25]
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
import { activeHour, ModelPlayer, normalDays } from '../../tools/balance/playerModel';

const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const DEFENCE_CATS = ['defense', 'trap', 'hedge', 'support'];

function fight(base: BaseLayout, keep: number, battleSeed: number, entrySeed: number) {
  const army = botArmy(keep, 1, data);
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = keep >= 7 ? heroAtKeep(keep, data) ?? undefined : undefined;
  const setup: BattleSetup = { seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(entrySeed), data, levels, probe.entry);
  const { result } = runBattle(setup, plan, data);
  return { d: result.destruction, held: result.stars === 0 ? 1 : 0, s3: result.stars === 3 ? 1 : 0 };
}

function score(name: string, base: BaseLayout, keep: number) {
  const rs = [] as ReturnType<typeof fight>[];
  for (let s = 0; s < 4; s++) for (let e = 0; e < 3; e++) rs.push(fight(base, keep, 90000 + s * 13 + e, 700 + e * 5 + s));
  const nDef = base.buildings.filter((b) => buildingDef(data, b.type).category === 'defense').length;
  const nWall = base.buildings.filter((b) => buildingDef(data, b.type).category === 'hedge').length;
  const c = data.economy.mapSize / 2;
  const spread = mean(base.buildings.filter((b) => buildingDef(data, b.type).category === 'defense').map((b) => Math.max(Math.abs(b.x + 1.5 - c), Math.abs(b.y + 1.5 - c))));
  console.log(pad(name, 62), pad(f(mean(rs.map((r) => r.d))), 6), pad(f(mean(rs.map((r) => r.held)) * 100, 0) + '%', 5), pad(f(mean(rs.map((r) => r.s3)) * 100, 0) + '%', 4), pad(nDef, 4), pad(nWall, 5), pad(f(spread, 1), 6));
}

/** Every defence-side building of the village set to the Keep cap minus `below`. */
function atCap(base: BaseLayout, keep: number, below: number): BaseLayout {
  const lim = data.hall.levels[keep - 1].limits;
  return { ...base, buildings: base.buildings.map((b) => (DEFENCE_CATS.includes(buildingDef(data, b.type).category) ? { ...b, level: Math.max(1, (lim[b.type]?.maxLevel ?? b.level) - below), upgrading: false } : { ...b, upgrading: false })) };
}

/** A generated layout carrying exactly the village's defence inventory (same types, counts and levels), placed by the generator. */
function generatorPlacement(village: BaseLayout, keep: number, layoutIndex: number, seed: number, keepWalls: boolean): BaseLayout {
  const gen = generateOpponent(seed, keep, data, { levelBias: 1, layout: LAYOUTS[layoutIndex] });
  const want: Record<string, number[]> = {};
  for (const b of village.buildings) {
    const cat = buildingDef(data, b.type).category;
    if (!DEFENCE_CATS.includes(cat) || cat === 'hedge') continue;
    (want[b.type] ??= []).push(b.level);
  }
  const buildings = gen.buildings.filter((b) => {
    const cat = buildingDef(data, b.type).category;
    if (cat === 'hedge') return keepWalls;
    if (!DEFENCE_CATS.includes(cat)) return true;
    const lv = want[b.type];
    if (!lv || !lv.length) return false;
    b.level = lv.shift()!;
    return true;
  });
  return { ...gen, buildings };
}

export default function main(daysArg = '25') {
  const days = Number(daysArg);
  console.log(pad('base', 62), pad('dest', 6), pad('held', 5), pad('3st', 4), pad('#def', 4), pad('walls', 5), pad('spread', 6));
  for (const policy of ['raider', 'defender'] as const) {
    const p = new ModelPlayer(data, { raidsPerSession: 2, policy });
    activeHour(p, 60, 2);
    normalDays(p, days);
    const keep = hallLevel(p.state, data);
    const v = villageToBase(p.state, p.clock.now(), data);
    console.log(`\n-- regular ${policy} after ${days} days: Keep ${keep}, ${v.buildings.length} buildings`);
    score('village as is', v, keep);
    const vc = atCap(v, keep, 0);
    score('village inventory at cap, as placed by the model (spiral from the Keep)', vc, keep);
    score('same inventory at cap, generator placement (walled_keep rings), no walls', generatorPlacement(vc, keep, 1, 91000, false), keep);
    score('same inventory at cap, generator placement (walled_keep rings), with walls', generatorPlacement(vc, keep, 1, 91000, true), keep);
    score('same inventory at cap, generator placement (kunai_ring), no walls', generatorPlacement(vc, keep, 0, 91000, false), keep);
    score('same inventory at cap, generator placement (mortar_core), with walls', generatorPlacement(vc, keep, 2, 91000, true), keep);
    const full = generateOpponent(91000, keep, data, { levelBias: 1, layout: LAYOUTS[1] });
    score('generated walled_keep at cap (full inventory, walls)', full, keep);
    score('generated walled_keep at cap, walls removed', { ...full, buildings: full.buildings.filter((b) => buildingDef(data, b.type).category !== 'hedge') }, keep);
    score('generated walled_keep at cap, defences spread to the rim (r 10-14)', generateOpponent(91000, keep, data, { levelBias: 1, layout: { ...LAYOUTS[1], id: 'rim', name: 'rim', rings: { ...LAYOUTS[1].rings, defense: [10, 14], splash: [10, 14] } } }), keep);
    score('generated walled_keep at cap, defences spread to the rim, no walls', generateOpponent(91000, keep, data, { levelBias: 1, layout: { ...LAYOUTS[1], id: 'rim', name: 'rim', rings: { ...LAYOUTS[1].rings, defense: [10, 14], splash: [10, 14] }, wallRings: 0 } }), keep);
    // The village's positions, for the record.
    const c = data.economy.mapSize / 2;
    console.log('village defences (type@level x,y, Chebyshev from centre): ' + v.buildings.filter((b) => DEFENCE_CATS.includes(buildingDef(data, b.type).category) && buildingDef(data, b.type).category !== 'hedge').map((b) => `${b.type.split('_')[0]}@${b.level} ${b.x},${b.y} r${Math.max(Math.abs(b.x + 1.5 - c), Math.abs(b.y + 1.5 - c)).toFixed(0)}`).join('; '));
    console.log('village other buildings: ' + v.buildings.filter((b) => !DEFENCE_CATS.includes(buildingDef(data, b.type).category)).map((b) => `${b.type.split('_')[0]}@${b.level} ${b.x},${b.y}`).join('; '));
  }
}
