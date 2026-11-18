/**
 * Whether an attack ends the attacker's shield (P3-12, PLY-11). Attacking ends a shield, except a village's first
 * attack when `raids.firstAttackKeepsShield` is on: the tutorial's forced first raid used to end the 24-hour
 * new-player shield silently. The rule reads state the simulator and the server both have (no earlier attack), never
 * tutorial progress (device-only). One helper for both `battleEnd` branches, the abandon paths and `server/core/pvp.ts`.
 */
import type { BattleRecord } from './battle/types';
import type { GameData, VillageState } from './types';

/** A raid in the battle log (not a Trial, war, bounty or rematch). */
function isRaidRecord(r: Pick<BattleRecord, 'kind' | 'trial' | 'war' | 'goalEvent' | 'rematch'>): boolean {
  return r.kind === 'attack' && r.trial === undefined && !r.war && !r.goalEvent && !r.rematch;
}

/** The attacker's shield after an attack at `now`; `earlierAttack`: the village (or player) has attacked before. */
export function shieldAfterAttack(shieldUntil: number, now: number, earlierAttack: boolean, data: GameData): number {
  if (!earlierAttack && data.raids.firstAttackKeepsShield) return shieldUntil;
  return Math.min(shieldUntil, now);
}

/**
 * Whether a village has attacked before: its battle log holds a raid, or its stats (which only grow, unlike the
 * trimmed log) show a won raid or any destruction.
 */
export function hasAttacked(state: Pick<VillageState, 'battleLog' | 'stats'>): boolean {
  return state.battleLog.some(isRaidRecord) || (state.stats.raidsWon ?? 0) > 0 || (state.stats.raidDestruction ?? 0) > 0;
}
