/**
 * P6-07 (UIS-01, PLY-13): what a battle moved, from a snapshot taken before it and one after it was settled. Every line
 * is a fact about the battle just fought (protected item 41): a task whose count went up, honor left to the next league
 * when honor changed, the Scroll's next tier when its points changed. Nothing is shown for what did not move.
 */
import { currentTasks, unlockedTier } from '../../gameplay/sim/pass';
import { hallLevel } from '../../gameplay/sim/keep';
import { nextLeague } from '../../gameplay/sim/ranks';
import type { GameData, VillageState } from '../../gameplay/sim/types';

export interface ProgressSnap {
  tasks: Record<string, { progress: number; target: number; kind: string }>;
  trophies: number;
  points: number;
  tier: number;
}

export function snapProgress(state: VillageState, data: GameData): ProgressSnap {
  const tasks: ProgressSnap['tasks'] = {};
  for (const t of currentTasks(state, hallLevel(state, data), data)) if (!t.claimed) tasks[`${t.kind}:${t.id}`] = { progress: t.progress, target: t.target, kind: t.kind };
  return { tasks, trophies: state.trophies, points: state.pass.points, tier: unlockedTier(state, data) };
}

export type ProgressLine =
  | { kind: 'task'; id: string; taskKind: string; from: number; to: number; target: number }
  | { kind: 'honor'; left: number; league: string }
  | { kind: 'scroll'; tier: number; pointsLeft: number };

/** The lines a result screen shows for what moved between `before` and `after` (empty: nothing moved). */
export function progressLines(before: ProgressSnap, after: ProgressSnap, state: VillageState, data: GameData): ProgressLine[] {
  const out: ProgressLine[] = [];
  for (const [key, a] of Object.entries(after.tasks)) {
    const b = before.tasks[key];
    if (b && a.progress > b.progress) out.push({ kind: 'task', id: key.slice(key.indexOf(':') + 1), taskKind: a.kind, from: b.progress, to: a.progress, target: a.target });
  }
  if (after.trophies !== before.trophies) {
    const next = nextLeague(after.trophies, data);
    if (next) out.push({ kind: 'honor', left: next.min - after.trophies, league: next.name });
  }
  if (after.points !== before.points) {
    const next = after.tier + 1;
    if (next <= data.pass.tiers.length) out.push({ kind: 'scroll', tier: next, pointsLeft: Math.max(0, next * data.pass.pointsPerTier - state.pass.points) });
  }
  return out;
}
