import { buildingDef, hallType, levelDef, troopDef } from './data';
import type { Cost, GameData, ResourceKind, TrainingItem, VillageState } from './types';

/** Total Army Camp space in finished camps. */
export function housingCapacity(state: VillageState, data: GameData): number {
  let cap = 0;
  for (const b of state.buildings) {
    if (b.level < 1) continue;
    cap += levelDef(data, b.type, b.level)?.housing ?? 0;
  }
  return cap;
}

export function armyHousing(army: Record<string, number>, data: GameData): number {
  let used = 0;
  for (const [t, n] of Object.entries(army)) used += (data.troops[t]?.housing ?? 0) * n;
  return used;
}

export function queueHousing(queue: TrainingItem[], data: GameData): number {
  return queue.reduce((s, q) => s + (data.troops[q.troop]?.housing ?? 0), 0);
}

/** Highest finished Burrow Barracks level (0 if none). */
export function barracksLevel(state: VillageState, data: GameData): number {
  let best = 0;
  for (const b of state.buildings) {
    if (buildingDef(data, b.type).category === 'military' && b.type === 'burrow_barracks') best = Math.max(best, b.level);
  }
  return best;
}

/**
 * Move finished training into the army, as far as the camps have room. A
 * finished warrior too big for the space left waits in the queue (the next army,
 * trained ahead), and anyone behind who does fit walks in first, so free space
 * never sits empty. Mutates `state`. Only troops that reach the army count
 * toward tasks.
 */
export function finishTraining(state: VillageState, now: number, data: GameData): string[] {
  const done: string[] = [];
  const cap = housingCapacity(state, data);
  let used = armyHousing(state.army, data);
  state.training = state.training.filter((item) => {
    const size = data.troops[item.troop]?.housing ?? 0;
    if (item.endsAt > now || used + size > cap) return true;
    used += size;
    state.army[item.troop] = (state.army[item.troop] ?? 0) + 1;
    notePaid(state, item);
    if (state.stats) state.stats.troopsTrained++;
    done.push(item.troop);
    return false;
  });
  return done;
}

/** True when a finished warrior has camp room to walk in. */
export function trainingReady(state: VillageState, now: number, data: GameData): boolean {
  const room = housingCapacity(state, data) - armyHousing(state.army, data);
  return state.training.some((q) => q.endsAt <= now && (data.troops[q.troop]?.housing ?? 0) <= room);
}

/** How many times faster than base the Training Dojo trains (its highest finished level). */
export function trainingSpeed(state: VillageState, data: GameData): number {
  const lvl = barracksLevel(state, data);
  return lvl >= 1 ? levelDef(data, 'burrow_barracks', lvl)?.trainingSpeed ?? 1 : 1;
}

/** Seconds one warrior of this type takes to train in this village's Dojo. */
export function trainSecondsFor(state: VillageState, troop: string, data: GameData): number {
  return Math.max(1, Math.ceil(troopDef(data, troop).trainSeconds / trainingSpeed(state, data)));
}

/**
 * Most housing that can be trained or queued: a full army in the camps plus
 * one more full army waiting in the queue.
 */
export function trainingQueueLimit(state: VillageState, data: GameData): number {
  return housingCapacity(state, data) * (1 + data.economy.queuedArmies);
}

/**
 * Close the gap after a warrior leaves the queue, each keeping its own length.
 * Finished warriors stay finished (they are only waiting for camp room) and the
 * one in training keeps its timer; only warriors still waiting to start move up.
 * Mutates.
 */
export function retimeQueue(queue: TrainingItem[], now: number): void {
  let t = now;
  for (const q of queue) {
    if (q.endsAt <= now) continue;
    if (q.startedAt <= now) {
      t = q.endsAt;
      continue;
    }
    const length = q.endsAt - q.startedAt;
    q.startedAt = t;
    q.endsAt = t + length;
    t = q.endsAt;
  }
}

/** For each queued warrior, in order: will they fit in the camps as they stand? Whoever doesn't is passed, as in `finishTraining`. */
export function queueFits(state: VillageState, data: GameData): boolean[] {
  let room = housingCapacity(state, data) - armyHousing(state.army, data);
  return state.training.map((q) => {
    const size = data.troops[q.troop]?.housing ?? 0;
    if (size > room) return false;
    room -= size;
    return true;
  });
}

/** When the last warrior who fits in the camps finishes (null when none of the queue fits). */
export function armyReadyAt(state: VillageState, data: GameData): number | null {
  const fits = queueFits(state, data);
  return state.training.filter((_, i) => fits[i]).at(-1)?.endsAt ?? null;
}

/**
 * How many of a warrior "Fill" queues: enough to fill the camps, counting what
 * is ready and in training. Only when the camps are already spoken for does it
 * reach into the next-army queue, so one tap never pays for two armies.
 */
export function fillCount(state: VillageState, troop: string, data: GameData): number {
  const size = data.troops[troop]?.housing ?? 0;
  if (size <= 0) return 0;
  const committed = armyHousing(state.army, data) + queueHousing(state.training, data);
  const toCamps = Math.floor((housingCapacity(state, data) - committed) / size);
  const count = toCamps > 0 ? toCamps : Math.floor((trainingQueueLimit(state, data) - committed) / size);
  return Math.max(0, Math.min(data.economy.maxTrainBatch, count));
}

export function queueEndsAt(state: VillageState, now: number): number {
  const last = state.training[state.training.length - 1];
  return last ? Math.max(now, last.endsAt) : now;
}

/** Largest Army Camp housing possible at an Elder Toadstool level (every camp at its cap). */
export function maxHousingAtHall(hallLevel: number, data: GameData): number {
  const levels = data.hall.levels;
  const lim = levels[Math.max(1, Math.min(levels.length, hallLevel)) - 1]?.limits.army_camp;
  if (!lim) return 0;
  return lim.count * (levelDef(data, 'army_camp', lim.maxLevel)?.housing ?? 0);
}

export interface TroopUnlock {
  /** True when this village can train the troop right now. */
  unlocked: boolean;
  /** Clan Keep level the troop needs (1 when it has no Keep gate). */
  keep: number;
  /** Training Dojo level the troop needs. */
  dojo: number;
  /** Which requirements are still missing. */
  needsKeep: boolean;
  needsDojo: boolean;
  /** Lowest Keep level whose limits allow the needed Dojo level (and the troop's own Keep gate). */
  earliestKeep: number;
}

/**
 * Whether a troop is unlocked: both its Clan Keep gate and its Training Dojo
 * level must be met. Training, research and the Warrior Codex all read this,
 * so a troop is never called "Unlocked" while the Train button is still locked.
 */
export function troopUnlock(state: VillageState, troop: string, data: GameData): TroopUnlock {
  const def = troopDef(data, troop);
  const keep = def.unlockKeep ?? 1;
  const dojo = def.barracksLevel;
  const hall = Math.max(1, state.buildings.find((b) => b.type === hallType(data))?.level ?? 1);
  const needsKeep = hall < keep;
  const needsDojo = barracksLevel(state, data) < dojo;
  return { unlocked: !needsKeep && !needsDojo, keep, dojo, needsKeep, needsDojo, earliestKeep: troopEarliestKeep(troop, data) };
}

/**
 * The lowest Clan Keep level at which a troop can be trained at all: its own
 * Keep gate, and the first Keep whose limits allow the Training Dojo level it
 * needs. The server checks attacks against this too (no Kite Raider at Keep 1).
 */
export function troopEarliestKeep(troop: string, data: GameData): number {
  const def = troopDef(data, troop);
  const dojoKeep = data.hall.levels.findIndex((l) => (l.limits.burrow_barracks?.maxLevel ?? 0) >= def.barracksLevel) + 1 || data.hall.levels.length;
  return Math.max(def.unlockKeep ?? 1, dojoKeep);
}

/** What a queued warrior cost from storage: its price less the share a Jade top-up bought (CU-3). */
export function paidFromStorage(item: Pick<TrainingItem, 'cost' | 'topUp'>): Cost {
  const out: Cost = {};
  for (const [k, v] of Object.entries(item.cost) as [ResourceKind, number][]) {
    const left = (v ?? 0) - (item.topUp?.cost[k] ?? 0);
    if (left > 0) out[k] = left;
  }
  return out;
}

/** A finished warrior joins the army: remember what it cost from storage (save v22, CU-7). Mutates. */
function notePaid(state: VillageState, item: TrainingItem): void {
  const paid = (state.armyPaid ??= {});
  const row = (paid[item.troop] ??= { n: 0, cost: {} });
  row.n++;
  for (const [k, v] of Object.entries(paidFromStorage(item)) as [ResourceKind, number][]) row.cost[k] = (row.cost[k] ?? 0) + v;
}

/**
 * Take `n` ready warriors of a type out of the army (battle, donation, dismiss). The tracked price paid
 * (`armyPaid`) shrinks in proportion, so it always describes the warriors still there. Mutates.
 */
export function takeFromArmy(state: VillageState, troop: string, n: number): void {
  const have = state.army[troop] ?? 0;
  const take = Math.max(0, Math.min(have, n));
  const row = state.armyPaid?.[troop];
  if (row && take > 0) {
    // Untracked (pre-v22) warriors are assumed to leave in the same share as tracked ones.
    const tracked = Math.min(row.n, have);
    const leaving = Math.min(tracked, Math.round((take * tracked) / have));
    for (const k of Object.keys(row.cost) as ResourceKind[]) {
      row.cost[k] = tracked > 0 ? Math.round(((row.cost[k] ?? 0) * (tracked - leaving)) / tracked) : 0;
      if (!(row.cost[k]! > 0)) delete row.cost[k];
    }
    row.n = tracked - leaving;
    if (row.n <= 0) delete state.armyPaid![troop];
  }
  state.army[troop] = have - take;
  if (state.army[troop] <= 0) delete state.army[troop];
}

/**
 * The resources `count` ready warriors of a type are worth on a refund (before the refund fraction): the price
 * paid from storage for tracked warriors (never above `current`, today's price), today's price for untracked
 * ones, averaged over the type's whole army.
 */
export function armyValue(state: VillageState, troop: string, count: number, current: Cost): Cost {
  const have = state.army[troop] ?? 0;
  const out: Cost = {};
  if (!(have > 0) || !(count > 0)) return out;
  const row = state.armyPaid?.[troop];
  const tracked = Math.min(row?.n ?? 0, have);
  const untracked = have - tracked;
  for (const [k, each] of Object.entries(current) as [ResourceKind, number][]) {
    const paid = Math.min(row?.cost[k] ?? 0, (each ?? 0) * tracked);
    const total = paid + untracked * (each ?? 0);
    const v = (total * Math.min(count, have)) / have;
    if (v > 0) out[k] = v;
  }
  return out;
}
