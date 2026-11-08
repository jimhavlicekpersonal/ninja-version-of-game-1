// Ladder audit, step 2: sandbagging the matchmaking strength floor.
// node scratch/run.mjs scratch/ladder/sandbag.ts [seeds=20]
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { totalLoot } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { attackerStrength, botArmy, matchStrength, opponentForRank, powerSlackAt, researchKeep } from '../../src/gameplay/sim/matchmaking';
import { lossTrophies, winTrophies } from '../../src/gameplay/sim/ranks';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng, mixSeed } from '../../src/gameplay/sim/rng';
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import type { VillageState } from '../../src/gameplay/sim/types';
import { createNewVillage } from '../../src/gameplay/sim/village';

// docs/game-theory/campaign.json, regular model, mean honor while at the Keep
const CAMPAIGN_HONOR: Record<number, number> = { 6: 1480, 9: 2031, 12: 3000, 15: 3786 };
const TPH = data.ranks.matchmaking.trophiesPerHall;

function villageAt(keep: number): VillageState {
  const s = createNewVillage(0, data);
  for (const b of s.buildings) if (b.type === 'elder_toadstool') b.level = keep;
  s.shieldUntil = 0;
  return s;
}

function cumResearch(troop: string, toLevel: number): { dew: number; seconds: number } {
  const def = data.troops[troop];
  let dew = 0;
  let seconds = 0;
  for (let l = 2; l <= toLevel; l++) {
    const r = def.levels[l - 1]?.research;
    if (!r) continue;
    dew += (r.cost.dew ?? 0) + (r.cost.acorns ?? 0);
    seconds += r.seconds;
  }
  return { dew, seconds };
}

/** Highest level whose research reading (level + offset) stays at or under `strength`. */
function maxLevelReading(troop: string, keep: number, strength: number): number {
  const off = data.troops[troop].levelCapOffset ?? 0;
  const cap = troopLevelCapAt(keep, data, troop);
  let best = 1;
  for (let l = 1; l <= cap; l++) if (researchKeep(l + off, data) <= strength + 1e-9) best = l;
  return best;
}

interface Variant {
  name: string;
  state: VillageState;
  /** The warriors actually sent into battle. */
  army: Record<string, number>;
  levels: Record<string, number>;
  note: string;
}

function fight(v: Variant, keep: number, honor: number, seeds: number[]) {
  const strength = attackerStrength(v.state, data);
  const floor = strength - powerSlackAt(keep, data);
  const hero = heroAtKeep(keep, data);
  let destr = 0, stars = 0, three = 0, loot = 0, offer = 0, honorDelta = 0, oppHall = 0, oppBias = 0, wins = 0;
  for (const seed of seeds) {
    const base = opponentForRank(seed, honor, keep, data, floor);
    const st = matchStrength(createRng(mixSeed(seed, 0x5c0a7)), honor, keep, data, false, floor);
    oppHall += st.hall; oppBias += st.bias;
    const setup: BattleSetup = { seed: mixSeed(seed, 0xba771e), base, army: v.army, levels: v.levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = createBattle(setup, data);
    const planArmy = { ...v.army, ...(hero ? { [hero.id]: 1 } : {}) };
    const planLevels = { ...v.levels, ...(hero ? { [hero.id]: hero.level } : {}) };
    const plan = botDeployments(probe.deployable, probe.grid.size, planArmy, createRng(seed), data, planLevels, probe.entry);
    const { result } = runBattle(setup, plan, data);
    destr += result.destruction; stars += result.stars; if (result.stars === 3) three++;
    if (result.stars >= 1) wins++;
    loot += (result.loot.acorns ?? 0) + (result.loot.dew ?? 0);
    const tl = totalLoot(base); offer += (tl.acorns ?? 0) + (tl.dew ?? 0);
    honorDelta += result.stars >= 1 ? winTrophies(honor, base.trophies ?? honor, data) : -lossTrophies(honor, base.trophies ?? honor, data);
  }
  const n = seeds.length;
  return { strength, floor, lo: Math.max(keep - 2, floor), oppHall: oppHall / n, oppBias: oppBias / n, destr: destr / n, stars: stars / n, three: three / n, wins: wins / n, loot: loot / n, offer: offer / n, honorDelta: honorDelta / n };
}

const fmt = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(Math.round(x)));

export default function main(seedsArg = '20') {
  const n = Number(seedsArg);
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  console.log(`seeds ${n}; hero from Keep 7; bot plan (botDeployments); opponent = opponentForRank(seed, campaign honor, K, floor = attackerStrength - powerSlackAt(K))`);
  for (const keep of [6, 9, 12, 15]) {
    const honor = CAMPAIGN_HONOR[keep];
    const mix = botArmy(keep, 1, data);
    const housing = maxHousingAtHall(keep, data);
    const types = Object.keys(mix);
    const capLevels: Record<string, number> = Object.fromEntries(types.map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const floorStrength = keep - (data.ranks.matchmaking.researchFloorKeeps ?? 1);
    const oneLevels: Record<string, number> = Object.fromEntries(types.map((t) => [t, 1]));
    const floorLevels: Record<string, number> = Object.fromEntries(types.map((t) => [t, maxLevelReading(t, keep, floorStrength)]));
    // Dilution: every other warrior unlocked at this Keep, 1 unit at level 1, smallest housing first.
    const others = Object.entries(data.troops)
      .filter(([t, d]) => !mix[t] && (d.unlockKeep ?? 1) <= keep)
      .sort((a, b) => a[1].housing - b[1].housing || (a[0] < b[0] ? -1 : 1))
      .map(([t]) => t);
    const dilutionHousing = others.reduce((s, t) => s + data.troops[t].housing, 0);
    const dilutedArmy = botArmy(keep, 1, data); // the real army, shrunk to the housing left
    {
      const left = housing - dilutionHousing;
      let used = Object.entries(dilutedArmy).reduce((s, [t, c]) => s + c * data.troops[t].housing, 0);
      // Remove units proportionally until it fits.
      const order = Object.keys(dilutedArmy);
      let i = 0;
      while (used > left) {
        const t = order[i % order.length];
        if (dilutedArmy[t] > 0) { dilutedArmy[t]--; used -= data.troops[t].housing; }
        i++;
      }
      for (const t of Object.keys(dilutedArmy)) if (dilutedArmy[t] <= 0) delete dilutedArmy[t];
    }
    const withResearch = (levels: Record<string, number>, army: Record<string, number>, extraArmy: Record<string, number> = {}, training: string[] = []): VillageState => {
      const s = villageAt(keep);
      s.army = { ...army, ...extraArmy };
      s.research.levels = { ...levels };
      s.training = training.map((t) => ({ troop: t, startedAt: 0, endsAt: 1, cost: {} }));
      return s;
    };
    const variants: Variant[] = [
      { name: 'A honest (caps)', state: withResearch(capLevels, mix), army: mix, levels: capLevels, note: '' },
      { name: 'B0 zero research', state: withResearch(oneLevels, mix), army: mix, levels: oneLevels, note: '' },
      { name: 'B1 max research at floor', state: withResearch(floorLevels, mix), army: mix, levels: floorLevels, note: types.map((t) => `${t} L${floorLevels[t]}/${capLevels[t]}`).join(', ') },
      { name: 'C dilution in camps', state: withResearch(capLevels, dilutedArmy, Object.fromEntries(others.map((t) => [t, 1]))), army: dilutedArmy, levels: capLevels, note: `${others.length} types, ${dilutionHousing} housing of ${housing}` },
      { name: 'C2 dilution in queue', state: withResearch(capLevels, mix, {}, others), army: mix, levels: capLevels, note: `${others.length} types queued, 0 housing` },
    ];
    // Keep 15's dilution: the most that can be fielded.
    console.log(`\n=== Keep ${keep}: housing ${housing}, mix ${JSON.stringify(mix)}, campaign honor ${honor} (= ${(honor / TPH).toFixed(2)} halls), slack ${powerSlackAt(keep, data)}, floor strength ${floorStrength}`);
    const saved = types.map((t) => { const c = cumResearch(t, capLevels[t]); const f = cumResearch(t, floorLevels[t]); return { t, dew: c.dew - f.dew, seconds: c.seconds - f.seconds, dewCap: c.dew }; });
    const lanes = data.hall.levels[keep - 1].researchLanes ?? 1;
    console.log(`research to caps for the mix: ${fmt(saved.reduce((s, x) => s + x.dewCap, 0))} Prov; B1 saves ${fmt(saved.reduce((s, x) => s + x.dew, 0))} Prov and ${(saved.reduce((s, x) => s + x.seconds, 0) / 86400 / lanes).toFixed(1)} lane-days (${lanes} lanes); B0 saves all of it`);
    console.log(`honor needed before honor matters (lo * 350 for honest): ${Math.round(Math.max(keep - 2, keep - powerSlackAt(keep, data)) * TPH)}; Keep ${keep} honest meets strength lo = ${Math.max(keep - 2, keep - powerSlackAt(keep, data))}`);
    console.log('variant | strength | floor | lo | opp Keep | opp bias | destr % | stars | 3-star | win | loot banked | loot offered | honor/raid | note');
    const rows: Record<string, ReturnType<typeof fight>> = {};
    for (const v of variants) {
      const r = fight(v, keep, honor, seeds);
      rows[v.name] = r;
      console.log(`${v.name} | ${r.strength.toFixed(3)} | ${r.floor.toFixed(3)} | ${r.lo.toFixed(3)} | ${r.oppHall.toFixed(2)} | ${r.oppBias.toFixed(2)} | ${r.destr.toFixed(1)} | ${r.stars.toFixed(2)} | ${(r.three * 100).toFixed(0)}% | ${(r.wins * 100).toFixed(0)}% | ${fmt(r.loot)} | ${fmt(r.offer)} | ${r.honorDelta >= 0 ? '+' : ''}${r.honorDelta.toFixed(1)} | ${v.note}`);
    }
    const a = rows['A honest (caps)'];
    for (const v of variants.slice(1)) {
      const r = rows[v.name];
      console.log(`  ${v.name} vs honest: loot ${((r.loot / a.loot - 1) * 100).toFixed(0)}%, stars ${(r.stars - a.stars >= 0 ? '+' : '')}${(r.stars - a.stars).toFixed(2)}, 3-star ${((r.three - a.three) * 100).toFixed(0)} pts, honor/raid ${(r.honorDelta - a.honorDelta >= 0 ? '+' : '')}${(r.honorDelta - a.honorDelta).toFixed(1)}`);
    }
  }
}
