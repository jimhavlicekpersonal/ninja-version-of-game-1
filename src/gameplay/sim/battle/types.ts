import type { Cost, Temper } from '../types';

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
  /** Tempering (SIM_RULES 6): the building's profile; absent = untempered. */
  temper?: Temper;
}

export interface BaseLayout {
  name: string;
  hallLevel: number;
  buildings: BaseBuilding[];
  trophies?: number;
  /** Set on generated practice targets (not a real player): the layout's archetype name. */
  practice?: string;
  /** The rival clan (computer) a generated base belongs to (`names.json` `rivalClans`; report section 5 step 8). */
  rival?: string;
  /** Shadow Trial tier this base was generated for (endless difficulty ladder). */
  trialTier?: number;
  /** Multiplier on defense HP and damage (Shadow Trials). Absent = 1. */
  power?: number;
  /** Multiplier on wall HP (Shadow Trial modifiers). Absent = 1. */
  wallPower?: number;
}

export interface BattleSetup {
  seed: number;
  base: BaseLayout;
  /** Troops the attacker brought. */
  army: Record<string, number>;
  /**
   * Infiltration Points rule (sim/battle/infiltration.ts): warriors enter only at the base's
   * points, each hiding a share of the army. Absent on battles recorded before the rule.
   */
  infiltration?: boolean;
  /** The attacker's researched troop levels (missing troops, or a missing map, mean level 1). */
  levels?: Record<string, number>;
  /**
   * Donated (Alliance Lodge) troops in `army`, with the level they were donated
   * at. The first `count` of that type deployed fight at this level; the rest at
   * `levels`. Absent on battles from before donated levels were kept.
   */
  reinforcements?: Record<string, { count: number; level: number }>;
  /**
   * Relay assaults (SIM_RULES 3, roadmap step 64): HP each building already
   * lost to an earlier strike on the same base, by building id. A building whose
   * loss reaches its HP starts destroyed (it counts for destruction and stars,
   * holds no loot, blocks nothing). `battleDamage` reads it back from a battle.
   */
  startDamage?: Record<string, number>;
  /**
   * The attacker's hero (SIM_RULES 5, report section 5 step 8): `data.battle.heroes[id]` at `level`,
   * deployable once like a warrior (no housing). Absent: no hero.
   */
  hero?: { id: string; level: number };
  /**
   * Warrior Mastery (content batch 2026-11-14, sim/mastery.ts): extra HP and damage per own warrior type
   * (0.05 = +5%). Set only while `features.mastery` is on, which the shipped data leaves off; absent = none,
   * so a live battle plays exactly as before.
   */
  mastery?: Record<string, number>;
}

/** Buildings being upgraded take no part in a battle: they don't fire, and their counter effect is off. */
export function activeInBattle(b: BaseBuilding): boolean {
  return !b.upgrading;
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
  /** A raid made up by the offline raid simulation (not a real player). */
  simulated?: boolean;
  /**
   * Attacks: what really reached storage (battle loot plus bonuses, capped by
   * storage), and what was won but did not fit. `result.loot` stays the
   * battle's own loot. Older records kept the banked total in `result.loot`.
   */
  banked?: Cost;
  overflow?: Cost;
  /**
   * Raids (save v21, balance audit 2026-11-08, sim/carry.ts): the star count declared before the raid, and the share
   * of `result.loot` carried home (diversity times stake; absent = all of it).
   */
  stake?: number;
  carry?: number;
  /**
   * The battle rules (SIM_RULES) the fight was recorded under. A replay is only
   * shown when it matches the current rules; absent = recorded before rules were versioned.
   */
  rules?: number;
  /** Online attacks: the server ticket, and whether the server has confirmed or refused it yet. */
  ticket?: string;
  settlement?: 'pending' | 'confirmed' | 'rejected';
  /** Why the server refused it (the attack then counts as practice: no loot, no honor). */
  rejected?: string;
  /** An Alliance War attack (no loot or honor; stars count for the war). */
  war?: boolean;
  /**
   * Defenses (save v16): the raider's own generated base, for one "settle the score" rematch
   * (sim/rematch.ts). `rematch` on a defense record is set once the rematch was fought; on an
   * attack record it names the defense it answered. `goalEvent` marks a goal event attack.
   */
  raider?: { seed: number; hall: number; bias: number };
  rematch?: string;
  goalEvent?: string;
  /** A Shadow Trial attack: its tier (save v16; older trial records have none). */
  trial?: number;
}
