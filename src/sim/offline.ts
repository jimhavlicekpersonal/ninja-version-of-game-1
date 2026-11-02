import { producedResource, collectorAmount } from './resources';
import type { GameData, ResourceKind, VillageState } from './types';
import { advance, type FinishedUpgrade } from './village';

export interface OfflineSummary {
  awayMs: number;
  finished: FinishedUpgrade[];
  /** How much the collectors gathered while the player was away. */
  collectorGains: Partial<Record<ResourceKind, number>>;
}

function waiting(state: VillageState, at: number, data: GameData): Partial<Record<ResourceKind, number>> {
  const out: Partial<Record<ResourceKind, number>> = {};
  for (const b of state.buildings) {
    const r = producedResource(b, data);
    if (!r) continue;
    out[r] = (out[r] ?? 0) + collectorAmount(b, at, data);
  }
  return out;
}

/**
 * Work out everything that happened while the game was closed, from the
 * time elapsed since `state.lastSeenAt`. Bot raids are added in Phase 3.
 */
export function computeOfflineProgress(state: VillageState, now: number, data: GameData): { state: VillageState; summary: OfflineSummary } {
  const from = state.lastSeenAt;
  const awayMs = Math.max(0, now - from);
  const before = waiting(state, Math.min(from, now), data);
  const { state: next, finished } = advance(state, now, data);
  const after = waiting(next, now, data);
  const collectorGains: Partial<Record<ResourceKind, number>> = {};
  for (const k of Object.keys(after) as ResourceKind[]) {
    collectorGains[k] = Math.max(0, Math.floor((after[k] ?? 0) - (before[k] ?? 0)));
  }
  next.lastSeenAt = now;
  return { state: next, summary: { awayMs, finished, collectorGains } };
}
