/**
 * Bot raids against the player's real village while they are away.
 * Everything is derived from the village seed and the time window, so the
 * same save always produces the same raids.
 */
import { createBattle, runBattle } from './battle/battle';
import type { BaseBuilding, BaseLayout, BattleRecord, Deployment } from './battle/types';
import { MS_PER_HOUR } from './clock';
import { buildingDef, levelDef, troopDef } from './data';
import { lossTrophies, winTrophies } from './ranks';
import { collectorAmount } from './resources';
import { createRng, int, mixSeed, next, pick, type Rng } from './rng';
import type { Cost, GameData, ResourceKind, VillageState } from './types';
import { advance, hallLevel } from './village';

/** The player's village as a battle base, with raidable loot on each building. */
export function villageToBase(state: VillageState, t: number, data: GameData, name = 'Your village'): BaseLayout {
  const e = data.economy;
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
      const amt = Math.floor(collectorAmount(b, t, data) * e.raidableUncollectedFraction);
      if (amt > 0) loot[def.produces] = amt;
    }
    const cap = caps[b.id];
    if (cap) {
      for (const [k, v] of Object.entries(cap) as [ResourceKind, number][]) {
        const share = totalCap[k] ? v / totalCap[k]! : 0;
        const amt = Math.floor(Math.min(state.resources[k], totalCap[k] ?? 0) * share * e.raidableStoredFraction);
        if (amt > 0) loot[k] = (loot[k] ?? 0) + amt;
      }
    }
    return { id: b.id, type: b.type, level: b.level, x: b.x, y: b.y, loot, upgrading: Boolean(b.upgrade && t < b.upgrade.endsAt) };
  });
  return { name, hallLevel: hallLevel(state, data), buildings, trophies: state.trophies };
}

export function botName(rng: Rng, data: GameData): string {
  return `${pick(rng, data.names.playerFirst)} ${pick(rng, data.names.playerSecond)}`;
}

/** A simple attack plan: pick a side, send tanks first, then the rest in waves. */
export function botDeployments(deployable: Uint8Array, size: number, army: Record<string, number>, rng: Rng, data: GameData): Deployment[] {
  const side = int(rng, 0, 3);
  const along = next(rng) * size;
  const ex = side === 0 ? along : side === 1 ? size - 1 : side === 2 ? along : 0;
  const ey = side === 0 ? 0 : side === 1 ? along : side === 2 ? size - 1 : along;
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
  const order = Object.keys(army).sort((a, b) => troopDef(data, b).hp / troopDef(data, b).housing - troopDef(data, a).hp / troopDef(data, a).housing);
  const out: Deployment[] = [];
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

/** Run one bot raid at time `t` against the (already advanced) village. Mutates `s`. */
export function raidVillage(s: VillageState, t: number, rng: Rng, data: GameData): RaidOutcome {
  const base = villageToBase(s, t, data);
  const attackerTrophies = Math.max(0, s.trophies + int(rng, -data.raids.attackerTrophyRange, data.raids.attackerTrophyRange));
  const armies = data.raids.botArmies;
  const army = { ...armies[Math.min(armies.length, base.hallLevel) - 1] };
  const setup = { seed: (next(rng) * 4294967296) >>> 0, base, army };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, army, rng, data);
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
        const take = Math.min(s.resources[k], v);
        s.resources[k] -= take;
        fromStorage[k] = (fromStorage[k] ?? 0) + take;
      }
    }
  });
  let delta: number;
  if (result.stars >= 1) delta = -winTrophies(attackerTrophies, s.trophies, data);
  else delta = lossTrophies(attackerTrophies, s.trophies, data);
  s.trophies = Math.max(0, s.trophies + delta);
  if (result.destruction >= data.raids.shieldDestructionThreshold) s.shieldUntil = Math.max(s.shieldUntil, t + data.raids.shieldHours * MS_PER_HOUR);
  const record: BattleRecord = {
    id: `d${s.nextSeed++}`,
    at: t,
    kind: 'defense',
    opponentName: name,
    setup,
    deployments,
    result: { ...result, loot: sumCosts(fromStorage, fromCollectors) },
    trophies: delta,
  };
  s.defenseLog.push(record);
  while (s.defenseLog.length > data.raids.maxDefenseLog) s.defenseLog.shift();
  return { record, fromStorage, fromCollectors };
}

function sumCosts(a: Cost, b: Cost): Cost {
  const out: Cost = { ...a };
  for (const [k, v] of Object.entries(b) as [ResourceKind, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/**
 * Simulate 0..maxRaids bot raids during the time the player was away.
 * Returns the village advanced to `now`.
 */
export function simulateOfflineRaids(state: VillageState, now: number, data: GameData): { state: VillageState; raids: RaidOutcome[] } {
  const r = data.raids;
  const start = Math.max(state.raidCheckAt, state.lastSeenAt);
  let s = structuredClone(state);
  const raids: RaidOutcome[] = [];
  const away = now - start;
  if (away >= r.minAwayMinutes * 60_000) {
    const rng = createRng(mixSeed(state.seed, Math.floor(start / 60_000)));
    const p = Math.min(r.maxChancePerSlot, (away / MS_PER_HOUR) * r.raidChancePerHourPerSlot);
    const times: number[] = [];
    for (let i = 0; i < r.maxRaids; i++) {
      const hit = next(rng) < p;
      const at = start + (r.minAwayMinutes * 60_000) / 2 + next(rng) * (away - (r.minAwayMinutes * 60_000) / 2);
      if (hit) times.push(Math.floor(at));
    }
    times.sort((a, b) => a - b);
    for (const t of times) {
      if (s.shieldUntil > t) continue;
      s = advance(s, t, data).state;
      raids.push(raidVillage(s, t, rng, data));
    }
  }
  s.raidCheckAt = now;
  return { state: s, raids };
}
