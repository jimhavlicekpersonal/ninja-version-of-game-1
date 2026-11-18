/**
 * The battle simulation's state types (quality 22). They live apart from battle.ts so the rule
 * modules (warriors, fortifications, temper) can name them without importing battle.ts back: the
 * battle core has no import cycle, not even a type-only one. battle.ts, warriors.ts and temper.ts
 * re-export them, so existing imports keep working.
 */
import type { Rng } from '../rng';
import type { BuildingEffect, CombatDef, Cost, GameData, WarriorKit } from '../types';
import type { PathGrid } from './pathfind';
import type { InfiltrationPlan } from './infiltration';
import type { BattleSetup, EndReason } from './types';

export interface WarriorEffect {
  kind: 'poison' | 'burn' | 'charge';
  source: number;
  target: number;
  x: number;
  y: number;
  radius: number;
  damage: number;
  endsTick: number;
  /** Rain Barrel Tower (non-live, content batch 2026-11-14): the tick a doused effect ends at the latest. */
  douseEnd?: number;
}

/** The attackers' support a tempered base cuts (`troopCuts` by the profile); all zero untempered. */
export interface TroopCuts {
  heal: number;
  aura: number;
  splash: number;
  revive: number;
}

export interface SimBuilding {
  id: string;
  type: string;
  level: number;
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  kind: 'hall' | 'defense' | 'hedge' | 'trap' | 'other';
  destroyed: boolean;
  loot: Cost;
  combat: (CombatDef & { damage: number }) | null;
  cooldown: number;
  targetTroop: number;
  /** Traps stay hidden until they go off. */
  hidden: boolean;
  /** Sabotage: silent while tick < disabledUntil; cannot be sabotaged again while tick < immuneUntil. */
  disabledUntil: number;
  immuneUntil: number;
  vulnerableUntil: number;
  vulnerability: number;
  slowedUntil: number;
  fireSlow: number;
  /** Defensive counter rule at this level (null for ordinary buildings). */
  effect: BuildingEffect | null;
  /** Clockwork Repair Crane: repairs left this battle. */
  uses: number;
  /** The jam end tick a crane already shortened, so one jam is repaired once. */
  repairedUntil: number;
  /** The same for a Hawk Tamer's slowing. */
  repairedSlowUntil: number;
  // ---- Non-live counters (content batch 2026-11-14, previewCounters.ts); absent on every live building ----
  /** Discipline Banner: this defense ignores taunts/decoys this tick (recomputed every tick). */
  focused?: boolean;
  /** Spotter's Perch covering this defense this tick (its building index). */
  spotter?: number;
  /** Sand Bucket Post: splash cut on this building this tick. */
  smother?: number;
  /** Bronze Mirror Screen: projectiles that hit it so far. */
  reflectHits?: number;
  /** Lightning Rod Tower: absorbed damage not yet fired back. */
  charge?: number;
}

/** A Smoke Bomb cloud on the map. Active while tick < endsTick. */
export interface SmokeCloud {
  id: number;
  x: number;
  y: number;
  radius: number;
  startTick: number;
  endsTick: number;
}

export interface SimTroop {
  id: number;
  type: string;
  x: number;
  y: number;
  /** Researched level the troop fights at, and its damage per hit at that level. */
  level: number;
  damage: number;
  /** Position at the start of the tick, for smooth rendering between ticks. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  air: boolean;
  target: number;
  path: number[] | null;
  pathPos: number;
  cooldown: number;
  dead: boolean;
  attacking: boolean;
  facing: 1 | -1;
  slowTicks: number;
  /** Ability uses left (Saboteur jams). */
  charges: number;
  hits: number;
  firstHit: boolean;
  revealed: boolean;
  summoned: boolean;
  decoyUntil: number;
  abilityReady: number;
  shieldUntil: number;
  shieldReady: number;
  revived: boolean;
  /** Paper Lantern Line: visible to defenses while tick < litUntil, taking `litBonus` extra damage. */
  litUntil: number;
  litBonus: number;
  /** Kite-Cutter Ballista: a flyer is on the ground while tick < groundedUntil, and can't be grounded again before groundImmuneUntil. */
  groundedUntil: number;
  groundImmuneUntil: number;
  /** Bitter Incense Burner (recomputed every tick): healing cut and heal/haste/resist aura cut on this troop. */
  healCut: number;
  auraCut: number;
  /** Rally (heroes, SIM_RULES 5): the tick the source's rally ends; 0 = not rallying. */
  rallyUntil?: number;
  // ---- Non-live content (content batch 2026-11-14); absent in every live battle ----
  /** Stunned or asleep (Listening Jars, Moonlit Gravel, Sleep Dart Tower): does nothing while tick < stunnedUntil. */
  stunnedUntil?: number;
  /** Listening Jars forced this digger to the surface: it must break walls like anyone else. */
  surfaced?: boolean;
  /** Once-per-warrior counters already spent on this troop. */
  jarred?: boolean;
  graveled?: boolean;
  slept?: boolean;
  /** Ink Seal Post: fell sealed, can't be revived. */
  sealed?: boolean;
  /** Hero abilities: the hero's ability was used; Bulwark/Squall end ticks; Bulwark's facing; Inner Calm's ward. */
  heroUsed?: boolean;
  bulwarkUntil?: number;
  bulwarkX?: number;
  bulwarkY?: number;
  squallUntil?: number;
  calm?: boolean;
}

export interface SimProjectile {
  id: number;
  kind: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  total: number;
  left: number;
  damage: number;
  splash: number;
  targetTroop: number;
  targetBuilding: number;
  hitsAir: boolean;
  hitsGround: boolean;
  /** Fired from height (towers) or from the ground (troops). */
  arc: boolean;
  sourceTroop?: number;
  /** The defense that fired it (for on-hit counter effects). */
  sourceBuilding?: number;
}

export type SimEvent =
  | { k: 'deploy'; troop: number }
  | { k: 'fire'; building: number }
  | { k: 'hit'; x: number; y: number; kind: string; splash: number }
  | { k: 'troopHit'; troop: number }
  | { k: 'buildingHit'; building: number }
  | { k: 'destroyed'; building: number }
  | { k: 'troopDied'; troop: number }
  | { k: 'trap'; building: number }
  | { k: 'smoke'; smoke: number }
  | { k: 'smokeEnd'; smoke: number }
  | { k: 'sabotage'; building: number; troop: number }
  | { k: 'recovered'; building: number }
  /** A warrior ability went off (for on-screen feedback; `what` names the kit rule). */
  | { k: 'ability'; troop: number; what: string }
  /** A defensive counter acted: `building` is the counter, `troop`/`target` what it affected (-1 if none). */
  | { k: 'counter'; building: number; troop: number; target: number; what: string };

export interface BattleSim {
  setup: BattleSetup;
  data: GameData;
  /** Tempering: the attackers' support the base cuts (all zero untempered). */
  temperCut?: TroopCuts;
  tick: number;
  duration: number;
  rng: Rng;
  buildings: SimBuilding[];
  troops: SimTroop[];
  projectiles: SimProjectile[];
  remaining: Record<string, number>;
  used: Record<string, number>;
  loot: Cost;
  destroyedCount: number;
  countable: number;
  hallDestroyed: boolean;
  ended: boolean;
  endReason: EndReason | null;
  events: SimEvent[];
  grid: PathGrid;
  /** 1 where the attacker may deploy (outside buildings and their margin). */
  deployable: Uint8Array;
  /** Infiltration Points, when the setup uses them (null = deploy anywhere on `deployable`). */
  entry: InfiltrationPlan | null;
  nextProjectile: number;
  /** Active Smoke Bomb clouds. */
  smokes: SmokeCloud[];
  /** Ability charges left this battle, by ability id. */
  charges: Record<string, number>;
  /** Abilities used this battle, by ability id (kept apart from `used`, which counts troops). */
  abilitiesUsed: Record<string, number>;
  warriorEffects: WarriorEffect[];
  supportTroops: number[];
  /**
   * Quality 28: `supportTroops` split by aura kind, in the same order (each list is a subsequence of
   * `supportTroops`). A troop's kit never changes, so `auraStrength` and the taunt lookup read only the
   * sources of the aura they ask about, with the same checks in the same order: results are unchanged.
   */
  auraSources: Partial<Record<NonNullable<WarriorKit['aura']>, number[]>>;
  /**
   * Report section 5 step 10 (quality 28): what each troop looks like to the defenses this tick, built once
   * before the defense phase. Nothing in that phase moves, reveals, lights, grounds or kills a troop (damage
   * lands later, in stepProjectiles), so the defenses read exactly what they used to compute per call.
   */
  defenseView?: { hidden: Uint8Array; air: Uint8Array; shrouded: Uint8Array } | null;
  /** Donated troops of each type not yet deployed (they deploy first, at their donated level). */
  lodgeLeft: Record<string, number>;
  /**
   * Content batch 2026-11-14: the non-live counter kinds on this base (set by createBattle only when one is
   * present, so a live battle never has it), and the index of a non-live hero whose ability is in play.
   */
  previewKinds?: Partial<Record<string, true>>;
  heroIndex?: number;
}
