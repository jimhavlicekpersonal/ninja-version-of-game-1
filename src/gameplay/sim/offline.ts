import type { BattleRecord } from './battle/types';
import { simulateOfflineRaids } from './defense';
import type { SeasonReward } from './ranks';
import { producedResource, collectorAmount } from './resources';
import type { GameData, ResourceKind, VillageState } from './types';
import { advance, type FinishedUpgrade } from './village';

export interface OfflineSummary {
  awayMs: number;
  finished: FinishedUpgrade[];
  /** How much the collectors gathered while the player was away. */
  collectorGains: Partial<Record<ResourceKind, number>>;
  /** Bot raids against the village while away. */
  raids: BattleRecord[];
  /** Monthly league chests that were awarded. */
  seasons: SeasonReward[];
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
export function computeOfflineProgress(state: VillageState, now: number, data: GameData, opts: { botRaids?: boolean } = {}): { state: VillageState; summary: OfflineSummary } {
  const from = state.lastSeenAt;
  const awayMs = Math.max(0, now - from);
  const before = waiting(state, Math.min(from, now), data);
  // Finished timers before raids happen are recorded by comparing levels.
  const levelsBefore = new Map(state.buildings.map((b) => [b.id, b.level]));
  // With the online server, real players raid you instead of bots.
  const raided = opts.botRaids === false ? { state: { ...structuredClone(state), raidCheckAt: now }, raids: [] } : simulateOfflineRaids(state, now, data);
  const { state: next } = advance(raided.state, now, data);
  const finished: FinishedUpgrade[] = [];
  for (const b of next.buildings) {
    const was = levelsBefore.get(b.id);
    if (was !== undefined && b.level > was) finished.push({ id: b.id, type: b.type, level: b.level, at: 0 });
  }
  const stolen: Partial<Record<ResourceKind, number>> = {};
  for (const r of raided.raids) for (const [k, v] of Object.entries(r.fromCollectors) as [ResourceKind, number][]) stolen[k] = (stolen[k] ?? 0) + v;
  const after = waiting(next, now, data);
  const collectorGains: Partial<Record<ResourceKind, number>> = {};
  for (const k of Object.keys(after) as ResourceKind[]) {
    collectorGains[k] = Math.max(0, Math.floor((after[k] ?? 0) - (before[k] ?? 0) + (stolen[k] ?? 0)));
  }
  // Seasons are settled (chest paid, trophies softened) inside advance(), at their real end time.
  const seasons = (next.seasonLog ?? []).filter((sr) => sr.season >= state.season);
  next.lastSeenAt = now;
  return { state: next, summary: { awayMs, finished, collectorGains, raids: raided.raids.map((r) => r.record), seasons } };
}
