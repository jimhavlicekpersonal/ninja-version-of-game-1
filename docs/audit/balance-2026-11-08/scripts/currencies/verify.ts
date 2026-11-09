/**
 * CU verification with real code: (1) loot a real village offers (villageToBase) vs a generated base of the
 * same Keep (generateOpponent + totalLoot); (2) the shield drops on the player's own attack (battleEnd)
 * but not on a Shadow Trial; (3) a bot raid's destruction against a crafted, defended village.
 * Run: node scratch/run.mjs scratch/currencies/verify.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, battleArmy } from '../../src/gameplay/sim/village';
import { villageToBase, botDeployments, raidVillage } from '../../src/gameplay/sim/defense';
import { generateOpponent, totalLoot } from '../../src/gameplay/sim/battle/basegen';
import { createBattle } from '../../src/gameplay/sim/battle/battle';
import { opponentFor } from '../../src/gameplay/sim/matchmaking';
import { troopLevels } from '../../src/gameplay/sim/research';
import { trialBase, trialVariant } from '../../src/gameplay/sim/trials';
import { createRng, mixSeed } from '../../src/gameplay/sim/rng';
import { findFreeSpot } from '../../src/gameplay/sim/grid';
import { capacity } from '../../src/gameplay/sim/resources';
import type { VillageState } from '../../src/gameplay/sim/types';

const T0 = Date.UTC(2026, 10, 20, 12);
const H = data.hall.levels; const B = data.buildings as any;
const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

function craft(keep: number, fill: number, hoursSinceCollect: number, withDefense = false): VillageState {
  const s = createNewVillage(T0 - hoursSinceCollect * 3_600_000, data);
  s.buildings = s.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle');
  s.buildings.find((b) => b.type === 'elder_toadstool')!.level = keep;
  const lim = H[keep - 1].limits as Record<string, { count: number; maxLevel: number }>;
  const addB = (type: string, level: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const spot = findFreeSpot(s, data, type, 20, 20); if (!spot) return;
      s.buildings.push({ id: `b${s.nextId++}`, type, level, x: spot.x, y: spot.y, upgrade: null, collector: B[type].produces ? { stored: 0, accrueFrom: T0 - hoursSinceCollect * 3_600_000 } : null });
    }
  };
  for (const t of ['acorn_silo', 'dew_cistern', 'burrow_barracks', 'army_camp', 'acorn_orchard', 'dewdrop_well']) addB(t, lim[t].maxLevel, lim[t].count);
  if (withDefense) for (const t of ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'thorn_snare', 'sap_puddle']) if (lim[t]) addB(t, lim[t].maxLevel, lim[t].count);
  const cap = capacity(s, data);
  s.resources = { ...s.resources, acorns: Math.floor(cap.acorns * fill), dew: Math.floor(cap.dew * fill) };
  s.lastSeenAt = T0 - hoursSinceCollect * 3_600_000; s.raidCheckAt = s.lastSeenAt; s.shieldUntil = 0;
  s.stats.defensesFaced = 10;
  return s;
}

export default function main() {
  console.log('== (1) loot on offer: real village (full storage / 25% / 5%, collectors after 8 h or 0 h) vs generated base, Coins+Provisions');
  console.log('K | gen avg (6 seeds, bias 0.5) | real full+8h | real 25%+8h | real 5%+8h | real full+0h | real full+8h / gen');
  for (const k of [3, 5, 7, 8, 10, 12, 15]) {
    let g = 0; for (let i = 0; i < 6; i++) { const l = totalLoot(generateOpponent(1000 + i * 7919, k, data, { levelBias: 0.5 })); g += (l.acorns ?? 0) + (l.dew ?? 0); } g /= 6;
    const real = (fill: number, h: number) => { const l = totalLoot(villageToBase(craft(k, fill, h), T0, data)); return (l.acorns ?? 0) + (l.dew ?? 0); };
    console.log(`${k} | ${fmt(g)} | ${fmt(real(1, 8))} | ${fmt(real(0.25, 8))} | ${fmt(real(0.05, 8))} | ${fmt(real(1, 0))} | ${(real(1, 8) / g).toFixed(2)}`);
  }

  console.log('\n== (2) shield: the player\'s own attack ends it (battleEnd), a Shadow Trial does not (trialEnd)');
  {
    let s = craft(5, 0.5, 0);
    s.shieldUntil = T0 + 10 * 3_600_000;
    s.army = { hedgehog_roller: 20 };
    const base = opponentFor(7, s, data);
    const levels = troopLevels(s, data);
    const setup = { seed: mixSeed(7, 0xba771e), base, army: battleArmy(s), levels, infiltration: true };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, setup.army, createRng(7), data, levels, probe.entry);
    const r = applyCommand(s, { type: 'battleEnd', record: { at: T0, opponentName: base.name, setup, deployments } }, T0, data);
    console.log(`battleEnd: shield before ${(s.shieldUntil - T0) / 3_600_000} h left, after ${r.ok ? (r.state.shieldUntil - T0) / 3_600_000 : 'fail ' + (r as any).message} h left`);
    let t = craft(5, 0.5, 0); t.shieldUntil = T0 + 10 * 3_600_000; t.army = { hedgehog_roller: 20 };
    const tb = trialBase(1, data, trialVariant(t.trials, 1));
    const tsetup = { seed: mixSeed(t.seed, 1), base: tb, army: battleArmy(t), levels: troopLevels(t, data), infiltration: true };
    const tp = createBattle(tsetup, data);
    const td = botDeployments(tp.deployable, tp.grid.size, tsetup.army, createRng(1), data, tsetup.levels, tp.entry);
    const tr = applyCommand(t, { type: 'trialEnd', tier: 1, record: { at: T0, opponentName: tb.name, setup: tsetup, deployments: td } }, T0, data);
    console.log(`trialEnd: shield before 10 h left, after ${tr.ok ? (tr.state.shieldUntil - T0) / 3_600_000 : 'fail ' + (tr as any).message} h left`);
  }

  console.log('\n== (3) one bot raid against a crafted village with every defense at cap, storage full, collectors 8 h (raidVillage)');
  console.log('K | raids | mean destruction | mean stars | held | mean stolen | as % of max at risk');
  for (const k of [5, 8, 10, 12, 15]) {
    let dest = 0, stars = 0, held = 0, stolen = 0; const n = 4;
    for (let i = 0; i < n; i++) {
      const s = craft(k, 1, 8, true);
      s.trophies = 350 * (k - 1) + 100;
      const atRisk = totalLoot(villageToBase(s, T0, data));
      const out = raidVillage(s, T0, createRng(mixSeed(5 + i, k)), data);
      dest += out.record.result.destruction; stars += out.record.result.stars; if (out.record.result.stars === 0) held++;
      const lost = (out.record.result.loot.acorns ?? 0) + (out.record.result.loot.dew ?? 0);
      stolen += lost / ((atRisk.acorns ?? 0) + (atRisk.dew ?? 0));
    }
    console.log(`${k} | ${n} | ${(dest / n).toFixed(0)}% | ${(stars / n).toFixed(2)} | ${held}/${n} | - | ${(stolen / n * 100).toFixed(0)}%`);
  }
}
