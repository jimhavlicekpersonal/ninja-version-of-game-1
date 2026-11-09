/**
 * Bot raids against the player's real village while they are away.
 * Everything is derived from the village seed and the time window, so the
 * same save always produces the same raids.
 */
import { createBattle, runBattle, SIM_RULES } from './battle/battle';
import type { BaseBuilding, BaseLayout, BattleRecord, Deployment } from './battle/types';
import type { InfiltrationPlan } from './battle/infiltration';
import { MS_PER_HOUR } from './clock';
import { buildingDef, levelDef, troopDef, troopLevel } from './data';
import { attackerFor, lootPenalty } from './matchmaking';
import { lossTrophies, winTrophies } from './ranks';
import { capacity, collectorAmount } from './resources';
import { createRng, int, mixSeed, next, pick, type Rng } from './rng';
import type { Cost, GameData, ResourceKind, VillageState } from './types';
import { advance, hallLevel } from './village';

/** Hours of shield a raid with this destruction gives (0 below the first tier). */
export function shieldHoursFor(destruction: number, data: GameData): number {
  let hours = 0;
  for (const tier of data.raids.shieldTiers) if (destruction >= tier.destruction) hours = Math.max(hours, tier.hours);
  return hours;
}

/** Lowest destruction that gives a shield. */
export function shieldThreshold(data: GameData): number {
  return Math.min(...data.raids.shieldTiers.map((t) => t.destruction));
}

/** Most of one resource raiders can take from storages at a hall level. */
export function storageLootCap(hall: number, data: GameData): number {
  const caps = data.raids.storageLootCapByHall;
  return caps[Math.max(1, Math.min(caps.length, hall)) - 1] ?? Number.POSITIVE_INFINITY;
}

/**
 * The player's village as a battle base, with raidable loot on each building.
 * Storages give `raidableStoredFraction` of what is stored, but never more than
 * the hall level's storage loot cap; `lootScale` applies the attacker's
 * loot penalty when it has a higher Elder Toadstool.
 */
export function villageToBase(state: VillageState, t: number, data: GameData, name = 'Your village', lootScale = 1): BaseLayout {
  const e = data.economy;
  const hl = hallLevel(state, data);
  const storeCap = storageLootCap(hl, data);
  const built = state.buildings.filter((b) => {
    const c = buildingDef(data, b.type).category;
    return b.level >= 1 && c !== 'obstacle' && c !== 'decor';
  });
  const caps: Record<string, Cost> = {};
  const totalCap: Cost = {};
  for (const b of built) {
    const store = levelDef(data, b.type, b.level)?.storage;
    if (!store) continue;
    caps[b.id] = store;
    for (const [k, v] of Object.entries(store) as [ResourceKind, number][]) totalCap[k] = (totalCap[k] ?? 0) + v;
  }
  const buildings: BaseBuilding[] = built.map((b) => {
    const def = buildingDef(data, b.type);
    const loot: Cost = {};
    if (def.produces && b.collector) {
      const amt = Math.floor(collectorAmount(b, t, data) * e.raidableUncollectedFraction * lootScale);
      if (amt > 0) loot[def.produces] = amt;
    }
    const cap = caps[b.id];
    if (cap) {
      for (const [k, v] of Object.entries(cap) as [ResourceKind, number][]) {
        const share = totalCap[k] ? v / totalCap[k]! : 0;
        const raidable = Math.min(Math.min(state.resources[k], totalCap[k] ?? 0) * e.raidableStoredFraction, storeCap);
        const amt = Math.floor(raidable * share * lootScale);
        if (amt > 0) loot[k] = (loot[k] ?? 0) + amt;
      }
    }
    return { id: b.id, type: b.type, level: b.level, x: b.x, y: b.y, loot, upgrading: Boolean(b.upgrade && t < b.upgrade.endsAt) };
  });
  return { name, hallLevel: hl, buildings, trophies: state.trophies };
}

export function botName(rng: Rng, data: GameData): string {
  return `${pick(rng, data.names.playerFirst)} ${pick(rng, data.names.playerSecond)}`;
}

/** A simple attack plan: pick a side, send tanks first, then the rest in waves. */
export function botDeployments(deployable: Uint8Array, size: number, army: Record<string, number>, rng: Rng, data: GameData, levels: Record<string, number> = {}, entry: InfiltrationPlan | null = null): Deployment[] {
  const side = int(rng, 0, 3);
  const along = next(rng) * size;
  const ex = side === 0 ? along : side === 1 ? size - 1 : side === 2 ? along : 0;
  const ey = side === 0 ? 0 : side === 1 ? along : side === 2 ? size - 1 : along;
  const tough = (t: string) => troopLevel(data, t, levels[t] ?? 1).hp / troopDef(data, t).housing;
  const order = Object.keys(army)
    .filter((t) => army[t] > 0)
    .sort((a, b) => tough(b) - tough(a) || (a < b ? -1 : a > b ? 1 : 0));
  const out: Deployment[] = [];
  if (entry) {
    // Infiltration Points: the points nearest the chosen side, one squad each.
    // Every troop type is dealt round the squads, so each squad has a front line and damage.
    const ranked = entry.points
      .map((p, i) => ({ i, d: (p.x - ex) * (p.x - ex) + (p.y - ey) * (p.y - ey) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .map((r) => r.i);
    const used = entry.points.map((p) => p.used);
    let tick = 0;
    order.forEach((troop) => {
      const h = troopDef(data, troop).housing;
      for (let k = 0; k < army[troop]; k++) {
        // The least-used of the nearest `minPoints` points that still has cover; overflow goes to the next nearest.
        const fits = (i: number) => used[i] + h <= entry.cover;
        let pick = -1;
        for (const i of ranked.slice(0, data.battle.infiltration.minPoints)) if (fits(i) && (pick < 0 || used[i] < used[pick])) pick = i;
        if (pick < 0) pick = ranked.find(fits) ?? -1;
        if (pick < 0) break;
        used[pick] += h;
        const p = entry.points[pick];
        out.push({ tick: tick + Math.floor(k / 2), troop, x: Math.floor(p.x), y: Math.floor(p.y) });
      }
      tick += Math.ceil(army[troop] / 2) + 10;
    });
    return out;
  }
  const tiles: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!deployable[y * size + x]) continue;
      tiles.push({ x, y, d: (x - ex) * (x - ex) + (y - ey) * (y - ey) });
    }
  }
  tiles.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const spots = tiles.slice(0, 6);
  if (!spots.length) return [];
  let tick = 0;
  order.forEach((troop, wave) => {
    const n = army[troop];
    for (let i = 0; i < n; i++) {
      const s = spots[(i + wave) % spots.length];
      out.push({ tick: tick + Math.floor(i / 2), troop, x: s.x, y: s.y });
    }
    tick += Math.ceil(n / 2) + 10;
  });
  return out;
}

export interface RaidOutcome {
  record: BattleRecord;
  /** What the attacker took, split by where it came from. */
  fromStorage: Cost;
  fromCollectors: Cost;
}

/**
 * Run one bot raid at time `t` against the (already advanced) village. The
 * raider is matched by the player's trophies and brings a full army for its
 * hall level, at that hall's troop research levels. Mutates `s`.
 */
export function raidVillage(s: VillageState, t: number, rng: Rng, data: GameData): RaidOutcome {
  const attacker = attackerFor(rng, s, data);
  const base = villageToBase(s, t, data, 'Your village', lootPenalty(attacker.hall, hallLevel(s, data), data));
  const attackerTrophies = attacker.trophies;
  const army = attacker.army;
  const setup = { seed: (next(rng) * 4294967296) >>> 0, base, army, levels: attacker.levels, infiltration: true };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, army, rng, data, attacker.levels, probe.entry);
  const name = botName(rng, data);
  const { result, sim } = runBattle(setup, deployments, data);
  const fromStorage: Cost = {};
  const fromCollectors: Cost = {};
  sim.buildings.forEach((sb) => {
    if (!sb.destroyed) return;
    const vb = s.buildings.find((b) => b.id === sb.id);
    if (!vb) return;
    for (const [k, v] of Object.entries(sb.loot) as [ResourceKind, number][]) {
      if (!v) continue;
      const def = buildingDef(data, vb.type);
      if (def.produces === k && vb.collector) {
        const have = collectorAmount(vb, t, data);
        const take = Math.min(have, v);
        vb.collector = { stored: have - take, accrueFrom: vb.upgrade && vb.upgrade.endsAt > t ? vb.upgrade.endsAt : t };
        fromCollectors[k] = (fromCollectors[k] ?? 0) + Math.floor(take);
      } else {
        // Never negative: a village in debt (ledger audit A5) has nothing in storage to lose.
        const take = Math.max(0, Math.min(s.resources[k], v));
        s.resources[k] -= take;
        fromStorage[k] = (fromStorage[k] ?? 0) + take;
      }
    }
  });
  let delta: number;
  if (result.stars >= 1) delta = -winTrophies(attackerTrophies, s.trophies, data);
  else delta = lossTrophies(attackerTrophies, s.trophies, data);
  s.trophies = Math.max(0, s.trophies + delta);
  const shield = shieldHoursFor(result.destruction, data);
  if (shield > 0) s.shieldUntil = Math.max(s.shieldUntil, t + shield * MS_PER_HOUR);
  s.stats.defensesFaced = (s.stats.defensesFaced ?? 0) + 1;
  // A held defense (no star lost) pays a little, and counts (save v16).
  let defenseReward: Cost = {};
  if (result.stars === 0) {
    s.stats.defensesWon = (s.stats.defensesWon ?? 0) + 1;
    defenseReward = defenseWinReward(s, data);
  }
  const record: BattleRecord = {
    id: `d${s.nextSeed++}`,
    at: t,
    kind: 'defense',
    opponentName: name,
    setup,
    deployments,
    result: { ...result, loot: sumCosts(fromStorage, fromCollectors) },
    trophies: delta,
    simulated: true,
    rules: SIM_RULES,
    // The raider's own base, for one "settle the score" rematch (sim/rematch.ts).
    raider: { seed: mixSeed(setup.seed, 0x7e3a7c), hall: attacker.hall, bias: attacker.bias },
    ...(hasPositive(defenseReward) ? { banked: defenseReward } : {}),
  };
  s.defenseLog.push(record);
  while (s.defenseLog.length > data.raids.maxDefenseLog) s.defenseLog.shift();
  return { record, fromStorage, fromCollectors };
}

/**
 * What holding off a bot raid pays (`raids.defenseWin`): a share of the Keep's lowest generated
 * raid loot in Coins and Provisions, as far as storage has room. Mutates; returns what was added.
 */
function defenseWinReward(s: VillageState, data: GameData): Cost {
  const share = data.raids.defenseWin?.shareOfRaidLoot ?? 0;
  const hl = hallLevel(s, data);
  const amount = Math.floor((data.battle.generatedLootByHall[hl - 1]?.min ?? 0) * share);
  if (amount <= 0) return {};
  const cap = capacity(s, data);
  const out: Cost = {};
  for (const k of ['acorns', 'dew'] as const) {
    const add = Math.max(0, Math.min(amount, cap[k] - s.resources[k]));
    if (add > 0) {
      s.resources[k] += add;
      out[k] = add;
    }
  }
  return out;
}

function hasPositive(c: Cost): boolean {
  return Object.values(c).some((v) => (v ?? 0) > 0);
}

function sumCosts(a: Cost, b: Cost): Cost {
  const out: Cost = { ...a };
  for (const [k, v] of Object.entries(b) as [ResourceKind, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/**
 * Raid times between `from` and `to`. Slots are fixed on the real clock
 * (counted from the Unix epoch), and whether a slot holds a raid, and when,
 * comes from the village seed. So the same village always meets the same
 * raiders at the same moments, and splitting an absence into many short ones
 * does not dodge them: only time with the game open (or shielded) is safe.
 */
export function raidTimes(seed: number, from: number, to: number, data: GameData): number[] {
  const r = data.raids;
  const slot = r.slotMinutes * 60_000;
  const out: number[] = [];
  if (to <= from) return out;
  for (let k = Math.floor(from / slot); k * slot < to; k++) {
    const rng = createRng(mixSeed(seed, k));
    if (next(rng) >= r.chancePerSlot) continue;
    const at = k * slot + Math.floor(next(rng) * slot);
    if (at >= from && at < to) out.push(at);
  }
  return out;
}

/**
 * Bot raids during the time the player was away (after a short grace period),
 * skipping any that fall inside a shield. Returns the village advanced to `now`.
 */
export function simulateOfflineRaids(state: VillageState, now: number, data: GameData): { state: VillageState; raids: RaidOutcome[] } {
  const r = data.raids;
  const start = Math.max(state.raidCheckAt, state.lastSeenAt + r.graceMinutes * 60_000);
  let s = structuredClone(state);
  const raids: RaidOutcome[] = [];
  for (const t of raidTimes(state.seed, start, now, data)) {
    if (raids.length >= r.maxRaidsPerCatchUp) break;
    if (s.shieldUntil > t) continue;
    s = advance(s, t, data).state;
    const rng = createRng(mixSeed(state.seed ^ 0x2a1d, Math.floor(t / 1000)));
    raids.push(raidVillage(s, t, rng, data));
  }
  s.raidCheckAt = Math.max(state.raidCheckAt, now);
  return { state: s, raids };
}
