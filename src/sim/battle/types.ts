import type { Cost } from '../types';

export interface BaseBuilding {
  id: string;
  type: string;
  level: number;
  x: number;
  y: number;
  /** Resources this building gives the attacker when destroyed. */
  loot?: Cost;
}

export interface BaseLayout {
  name: string;
  hallLevel: number;
  buildings: BaseBuilding[];
  trophies?: number;
}

export interface BattleSetup {
  seed: number;
  base: BaseLayout;
  /** Troops the attacker brought. */
  army: Record<string, number>;
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
}
