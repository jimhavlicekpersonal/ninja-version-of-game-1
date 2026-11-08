/**
 * Dimension defence_math, step 2: marginal value per Coin of each defence investment.
 * Run: node scratch/run.mjs scratch/defence_math/marginal.ts [keeps=6,9,12,15] [baseSeeds=3] [entrySeeds=2]
 * Bases: generateOpponent at levelBias 0.5 (buildings one level under the Keep's caps), 5 LAYOUTS x baseSeeds.
 * Attacker: botArmy(K, 1) at the Keep's research caps, hero from Keep 7, bot deployment plan, entrySeeds sides.
 * Common random numbers: the same base seeds, battle seeds and entry seeds for every variant.
 */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS, totalLoot } from '../../src/gameplay/sim/battle/basegen';
import type { BaseBuilding, BaseLayout, BattleSetup } from '../../src/gameplay/sim/battle/types';
import { buildingDef, defaultData as data } from '../../src/gameplay/sim/data';
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
const countCapAt = (keep: number, type: string) => data.hall.levels[keep - 1].limits[type]?.count ?? 0;

interface Variant { id: string; name: string; apply: (base: BaseLayout, keep: number) => { base: BaseLayout; cost: number; changed: number } }

function clone(base: BaseLayout): BaseLayout {
  return { ...base, buildings: base.buildings.map((b) => ({ ...b, loot: b.loot ? { ...b.loot } : undefined })) };
}

function levelUp(types: string[]): Variant['apply'] {
  return (base, keep) => {
    const out = clone(base);
    let cost = 0;
    let changed = 0;
    for (const b of out.buildings) {
      if (!types.includes(b.type)) continue;
      if (b.level >= capAt(keep, b.type)) continue;
      b.level += 1;
      cost += levelCost(b.type, b.level);
      changed++;
    }
    return { base: out, cost, changed };
  };
}

function remove(types: string[]): Variant['apply'] {
  return (base) => {
    const out = clone(base);
    let cost = 0;
    let changed = 0;
    out.buildings = out.buildings.filter((b) => {
      if (!types.includes(b.type)) return true;
      cost -= cumCost(b.type, b.level);
      changed++;
      return false;
    });
    return { base: out, cost, changed };
  };
}

/** One more trap of each kind on the free tile nearest the centre (under the count cap). */
function addTraps(): Variant['apply'] {
  return (base, keep) => {
    const out = clone(base);
    const size = data.economy.mapSize;
    const occ = new Uint8Array(size * size);
    for (const b of out.buildings) {
      const s = buildingDef(data, b.type).size;
      for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) occ[y * size + x] = 1;
    }
    const c = size / 2;
    let cost = 0;
    let changed = 0;
    let id = 9000;
    for (const type of ['thorn_snare', 'sap_puddle']) {
      const have = out.buildings.filter((b) => b.type === type);
      if (have.length >= countCapAt(keep, type)) continue;
      const level = have.length ? have[0].level : Math.max(1, capAt(keep, type) - 1);
      let best: { x: number; y: number; d: number } | null = null;
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          if (occ[y * size + x]) continue;
          const d = (x + 0.5 - c) * (x + 0.5 - c) + (y + 0.5 - c) * (y + 0.5 - c);
          if (d < 9) continue; // not inside the Keep's own footprint margin
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      if (!best) continue;
      occ[best.y * size + best.x] = 1;
      out.buildings.push({ id: `v${id++}`, type, level, x: best.x, y: best.y });
      cost += cumCost(type, level);
      changed++;
    }
    return { base: out, cost, changed };
  };
}

const VARIANTS: Variant[] = [
  { id: 'a', name: 'Kunai +1', apply: levelUp(['acorn_cannon']) },
  { id: 'b', name: 'Shuriken +1', apply: levelUp(['wasp_nest']) },
  { id: 'c', name: 'Mortar +1', apply: levelUp(['pinecone_catapult']) },
  { id: 'd', name: 'SkyBow +1', apply: levelUp(['firefly_tower']) },
  { id: 'e', name: 'Ballista +1', apply: levelUp(['kite_cutter_ballista']) },
  { id: 'f', name: 'Yagura +1', apply: levelUp(['longbow_yagura']) },
  { id: 'g', name: 'Walls +1', apply: levelUp(['bramble_hedge']) },
  { id: 'h', name: 'Walls removed', apply: remove(['bramble_hedge']) },
  { id: 'i', name: '+Spike +Caltrop', apply: addTraps() },
  { id: 'j', name: 'Soft counters removed', apply: remove(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner']) },
  { id: 'k', name: 'Ballista+Yagura removed', apply: remove(['kite_cutter_ballista', 'longbow_yagura']) },
  { id: 'l', name: 'Collectors+storage +1 (HP filler)', apply: levelUp(['acorn_orchard', 'dewdrop_well', 'acorn_silo', 'dew_cistern']) },
  { id: 'm', name: 'All 6 shooting defences +1', apply: levelUp(['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura']) },
  { id: 'n', name: 'Traps +1 level', apply: levelUp(['thorn_snare', 'sap_puddle']) },
  { id: 'o', name: 'Soft counters +1', apply: levelUp(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner']) },
];

interface Fight { destruction: number; stars: number; lootFrac: number; ticks: number; entryShift: boolean }

function fight(base: BaseLayout, keep: number, army: Record<string, number>, levels: Record<string, number>, battleSeed: number, entrySeed: number, refEntry?: string): Fight {
  const hero = keep >= 7 ? heroAtKeep(keep, data) ?? undefined : undefined;
  const setup: BattleSetup = { seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const probe = createBattle(setup, data);
  const entryKey = probe.entry!.points.map((p) => `${p.x},${p.y}`).join(';');
  const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(entrySeed), data, levels, probe.entry);
  const { result } = runBattle(setup, plan, data);
  const tl = totalLoot(base);
  const total = (tl.acorns ?? 0) + (tl.dew ?? 0);
  const got = (result.loot.acorns ?? 0) + (result.loot.dew ?? 0);
  return { destruction: result.destruction, stars: result.stars, lootFrac: total ? got / total : 0, ticks: result.ticks, entryShift: refEntry !== undefined && refEntry !== entryKey };
}

function entryKeyOf(base: BaseLayout, keep: number, army: Record<string, number>, levels: Record<string, number>, battleSeed: number): string {
  const hero = keep >= 7 ? heroAtKeep(keep, data) ?? undefined : undefined;
  const probe = createBattle({ seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) }, data);
  return probe.entry!.points.map((p) => `${p.x},${p.y}`).join(';');
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);

export default function main(keepsArg = '6,9,12,15', baseSeedsArg = '3', entrySeedsArg = '2', biasArg = '0.5') {
  const keeps = keepsArg.split(',').map(Number);
  const nBase = Number(baseSeedsArg);
  const nEntry = Number(entrySeedsArg);
  const bias = Number(biasArg);
  const all: Record<string, unknown>[] = [];
  const t0 = Date.now();
  let battles = 0;
  for (const keep of keeps) {
    const army = botArmy(keep, 1, data);
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const rows: { layout: string; seed: number; variant: string; cost: number; changed: number; fights: Fight[] }[] = [];
    for (const L of LAYOUTS) {
      for (let s = 0; s < nBase; s++) {
        const baseSeed = 50000 + keep * 1000 + s * 97 + LAYOUTS.indexOf(L) * 13;
        const base = generateOpponent(baseSeed, keep, data, { levelBias: bias, layout: L });
        const battleSeeds = Array.from({ length: nEntry }, (_, e) => baseSeed * 7 + e * 101 + 3);
        const refKeys = battleSeeds.map((bs) => entryKeyOf(base, keep, army, levels, bs));
        const run = (variant: string, vb: BaseLayout, cost: number, changed: number) => {
          const fights = battleSeeds.map((bs, e) => fight(vb, keep, army, levels, bs, 1000 + e * 37 + s, refKeys[e]));
          battles += fights.length;
          rows.push({ layout: L.id, seed: s, variant, cost, changed, fights });
        };
        run('base', base, 0, 0);
        for (const v of VARIANTS) {
          const { base: vb, cost, changed } = v.apply(base, keep);
          if (changed === 0) { rows.push({ layout: L.id, seed: s, variant: v.id, cost: 0, changed: 0, fights: [] }); continue; }
          run(v.id, vb, cost, changed);
        }
      }
    }
    // Summaries per variant (over layouts and seeds where the variant changed something).
    const baseRows = rows.filter((r) => r.variant === 'base');
    const baseDest = mean(baseRows.flatMap((r) => r.fights.map((x) => x.destruction)));
    const base3 = mean(baseRows.flatMap((r) => r.fights.map((x) => (x.stars === 3 ? 1 : 0))));
    const baseHeld = mean(baseRows.flatMap((r) => r.fights.map((x) => (x.stars === 0 ? 1 : 0))));
    const baseLoot = mean(baseRows.flatMap((r) => r.fights.map((x) => x.lootFrac)));
    console.log(`\n== Keep ${keep}: bias ${bias}, ${LAYOUTS.length} layouts x ${nBase} base seeds x ${nEntry} entry seeds; army ${JSON.stringify(army)} levels ${JSON.stringify(levels)} hero ${keep >= 7 ? JSON.stringify(heroAtKeep(keep, data)) : 'none'}`);
    console.log(`baseline: destruction ${f(baseDest)} | 3-star ${f(base3 * 100, 0)}% | held ${f(baseHeld * 100, 0)}% | loot taken ${f(baseLoot * 100, 0)}%`);
    console.log(pad('var', 3), pad('name', 34), pad('bases', 5), pad('cost (res)', 11), pad('destr', 6), pad('dDest', 6), pad('3star', 5), pad('held', 5), pad('loot%', 5), pad('dDest/1M', 9), pad('dLoot%/1M', 9), pad('shift', 5));
    const summary: Record<string, unknown>[] = [];
    for (const v of VARIANTS) {
      const vr = rows.filter((r) => r.variant === v.id && r.changed > 0);
      if (!vr.length) { console.log(pad(v.id, 3), pad(v.name, 34), pad(0, 5), 'nothing to change at this Keep (cap or count reached, or none in layout)'); continue; }
      // Paired comparison: same base & seeds in baseline.
      let dSum = 0, dLoot = 0, n = 0, costSum = 0, s3 = 0, held = 0, dest = 0, shifts = 0, loot = 0;
      for (const r of vr) {
        const b = baseRows.find((x) => x.layout === r.layout && x.seed === r.seed)!;
        r.fights.forEach((fi, i) => {
          dSum += b.fights[i].destruction - fi.destruction;
          dLoot += b.fights[i].lootFrac - fi.lootFrac;
          dest += fi.destruction;
          s3 += fi.stars === 3 ? 1 : 0;
          held += fi.stars === 0 ? 1 : 0;
          loot += fi.lootFrac;
          shifts += fi.entryShift ? 1 : 0;
          n++;
        });
        costSum += r.cost;
      }
      const cost = costSum / vr.length;
      const dDest = dSum / n;
      const perM = cost !== 0 ? dDest / (Math.abs(cost) / 1e6) : NaN;
      const perMLoot = cost !== 0 ? (dLoot / n) * 100 / (Math.abs(cost) / 1e6) : NaN;
      console.log(pad(v.id, 3), pad(v.name, 34), pad(vr.length, 5), pad(Math.round(cost), 11), pad(f(dest / n), 6), pad((dDest >= 0 ? '+' : '') + f(dDest), 6), pad(f((s3 / n) * 100, 0) + '%', 5), pad(f((held / n) * 100, 0) + '%', 5), pad(f((loot / n) * 100, 0), 5), pad(f(perM, 2), 9), pad(f(perMLoot, 2), 9), pad(shifts, 5));
      summary.push({ keep, variant: v.id, name: v.name, bases: vr.length, cost, destruction: dest / n, dDest, threeStar: s3 / n, held: held / n, lootFrac: loot / n, dDestPerM: perM, dLootPctPerM: perMLoot, entryShifts: shifts, fights: n });
    }
    // Per layout: baseline and the main variants.
    console.log(pad('layout', 12), pad('base', 6), ...VARIANTS.map((v) => pad(v.id, 6)));
    for (const L of LAYOUTS) {
      const bl = mean(baseRows.filter((r) => r.layout === L.id).flatMap((r) => r.fights.map((x) => x.destruction)));
      const cells = VARIANTS.map((v) => {
        const vr = rows.filter((r) => r.variant === v.id && r.layout === L.id && r.changed > 0);
        if (!vr.length) return pad('-', 6);
        let d = 0, n = 0;
        for (const r of vr) {
          const b = baseRows.find((x) => x.layout === r.layout && x.seed === r.seed)!;
          r.fights.forEach((fi, i) => { d += b.fights[i].destruction - fi.destruction; n++; });
        }
        return pad((d / n >= 0 ? '+' : '') + f(d / n), 6);
      });
      console.log(pad(L.id, 12), pad(f(bl), 6), ...cells);
    }
    all.push({ keep, bias, army, levels, baseline: { destruction: baseDest, threeStar: base3, held: baseHeld, lootFrac: baseLoot }, variants: summary, rows: rows.map((r) => ({ ...r, fights: r.fights.map((x) => ({ d: x.destruction, s: x.stars, l: +x.lootFrac.toFixed(3), sh: x.entryShift ? 1 : 0 })) })) });
    console.log(`(${battles} battles so far, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  writeFileSync(`scratch/defence_math/marginal_${keepsArg.replace(/,/g, '-')}_b${biasArg}.json`, JSON.stringify(all));
  console.log(`\n${battles} battles in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
