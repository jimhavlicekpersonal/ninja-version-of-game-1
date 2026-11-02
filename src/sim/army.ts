import { MS_PER_SECOND } from './clock';
import { buildingDef, levelDef, troopDef } from './data';
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

/** Move finished training into the army. Mutates `state`. */
export function finishTraining(state: VillageState, now: number): string[] {
  const done: string[] = [];
  while (state.training.length && state.training[0].endsAt <= now) {
    const item = state.training.shift()!;
    state.army[item.troop] = (state.army[item.troop] ?? 0) + 1;
    done.push(item.troop);
  }
  return done;
}

/** Re-time the queue so items run back to back starting no earlier than `now`. Mutates. */
export function retimeQueue(queue: TrainingItem[], now: number, data: GameData): void {
  let t = now;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    if (i === 0 && q.startedAt <= now) {
      t = q.endsAt;
      continue;
    }
    const dur = troopDef(data, q.troop).trainSeconds * MS_PER_SECOND;
    q.startedAt = t;
    q.endsAt = t + dur;
    t = q.endsAt;
  }
}

export function queueEndsAt(state: VillageState, now: number): number {
  const last = state.training[state.training.length - 1];
  return last ? Math.max(now, last.endsAt) : now;
}
