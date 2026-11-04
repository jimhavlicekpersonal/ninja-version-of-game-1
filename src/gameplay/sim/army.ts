import { MS_PER_SECOND } from './clock';
import { buildingDef, hallType, levelDef, troopDef } from './data';
import type { GameData, TrainingItem, VillageState } from './types';

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
 * finished warrior with no room waits at the head of the queue (the next army,
 * trained ahead) and walks in as soon as space frees up. Mutates `state`. Only
 * troops that reach the army count toward tasks.
 */
export function finishTraining(state: VillageState, now: number, data: GameData): string[] {
  const done: string[] = [];
  const cap = housingCapacity(state, data);
  while (state.training.length && state.training[0].endsAt <= now) {
    const item = state.training[0];
    if (armyHousing(state.army, data) + (data.troops[item.troop]?.housing ?? 0) > cap) break;
    state.training.shift();
    state.army[item.troop] = (state.army[item.troop] ?? 0) + 1;
    if (state.stats) state.stats.troopsTrained++;
    done.push(item.troop);
  }
  return done;
}

/** True when the first queued warrior has finished and there is camp room for it. */
export function trainingReady(state: VillageState, now: number, data: GameData): boolean {
  const head = state.training[0];
  if (!head || head.endsAt > now) return false;
  return armyHousing(state.army, data) + (data.troops[head.troop]?.housing ?? 0) <= housingCapacity(state, data);
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

/** Re-time the queue so items run back to back starting no earlier than `now`; each keeps its own duration. Mutates. */
export function retimeQueue(queue: TrainingItem[], now: number, data: GameData): void {
  let t = now;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    if (i === 0 && q.startedAt <= now) {
      t = q.endsAt;
      continue;
    }
    const dur = q.endsAt > q.startedAt ? q.endsAt - q.startedAt : troopDef(data, q.troop).trainSeconds * MS_PER_SECOND;
    q.startedAt = t;
    q.endsAt = t + dur;
    t = q.endsAt;
  }
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
