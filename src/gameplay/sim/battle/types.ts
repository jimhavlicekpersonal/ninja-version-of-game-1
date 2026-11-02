import type { Cost } from '../types';

export interface BaseBuilding {
  id: string;
  type: string;
  level: number;
  x: number;
  y: number;
  /** Resources this building gives the attacker when destroyed. */
  loot?: Cost;
  /** Defenses being upgraded do not fire. */
  upgrading?: boolean;
}

export interface BaseLayout {
  name: string;
  hallLevel: number;
  buildings: BaseBuilding[];
  trophies?: number;
  /** Set on generated practice targets (not a real player): the layout's archetype name. */
  practice?: string;
  /** Shadow Trial tier this base was generated for (endless difficulty ladder). */
  trialTier?: number;
  /** Multiplier on defense HP and damage (Shadow Trials). Absent = 1. */
  power?: number;
}

export interface BattleSetup {
  seed: number;
  base: BaseLayout;
  /** Troops the attacker brought. */
  army: Record<string, number>;
  /** The attacker's researched troop levels (missing troops, or a missing map, mean level 1). */
  levels?: Record<string, number>;
}

export interface Deployment {
  tick: number;
  troop: string;
  x: number;
  y: number;
}

export type EndReason = 'time' | 'destroyed' | 'no_troops' | 'surrender';

export interface BattleResult {
  stars: number;
  destruction: number;
  hallDestroyed: boolean;
  loot: Cost;
  used: Record<string, number>;
  ticks: number;
  endReason: EndReason;
  /** Fingerprint of the final state, to check replays. */
  hash: string;
}

export interface BattleRecord {
  id: string;
  at: number;
  kind: 'attack' | 'defense';
  opponentName: string;
  setup: BattleSetup;
  deployments: Deployment[];
  /** Tick the attacker ended the battle early, if they did. */
  endTick?: number;
  result: BattleResult;
  /** Trophy change for the player (Phase 3). */
  trophies?: number;
  /** League bonus included in the banked loot of a won attack. */
  leagueBonus?: Cost;
  /** Limited-time event bonus included in the banked loot. */
  eventBonus?: Cost;
}
