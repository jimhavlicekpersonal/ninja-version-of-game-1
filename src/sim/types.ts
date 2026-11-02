/** Shared simulation types. No rendering code may live in src/sim. */

export type ResourceKind = 'acorns' | 'dew' | 'nightsap' | 'moonstones';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['acorns', 'dew', 'nightsap', 'moonstones'];

export type Resources = Record<ResourceKind, number>;
export type Cost = Partial<Record<ResourceKind, number>>;

export type BuildingType = string;
export type BuildingCategory = 'hall' | 'collector' | 'storage' | 'builder' | 'military' | 'defense' | 'hedge' | 'trap' | 'decor';

export interface UpgradeTimer {
  /** Level the building will have when the timer ends. */
  toLevel: number;
  startedAt: number;
  endsAt: number;
  /** What was paid, so a cancel can refund part of it. */
  cost: Cost;
}

export interface CollectorState {
  /** Output already banked in the collector (not yet in storage). */
  stored: number;
  /** Production accrues from this timestamp at the building's current rate. */
  accrueFrom: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  /** 0 means "under construction, not finished yet". */
  level: number;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  upgrade: UpgradeTimer | null;
  collector: CollectorState | null;
}

export interface TrainingItem {
  troop: string;
  startedAt: number;
  endsAt: number;
  cost: Cost;
}

export interface VillageState {
  createdAt: number;
  /** Last time the game was open (used for offline progress). */
  lastSeenAt: number;
  resources: Resources;
  buildings: Building[];
  nextId: number;
  /** Trained troops ready to attack, by troop type. */
  army: Record<string, number>;
  /** Barracks queue; items finish one after another. */
  training: TrainingItem[];
  /** Attacks this player made, newest last (for replays). */
  battleLog: import('./battle/types').BattleRecord[];
  /** Per-village seed and counter for deterministic generation (opponents, raids). */
  seed: number;
  nextSeed: number;
  /** Leaf rank. */
  trophies: number;
  /** No raids against this village before this time. */
  shieldUntil: number;
  /** Raids against this village, newest last. */
  defenseLog: import('./battle/types').BattleRecord[];
  /** Monthly season (UTC year * 12 + month) last processed. */
  season: number;
  /** Offline raids have been simulated up to this time. */
  raidCheckAt: number;
}

// ---- Balance data (loaded from src/data/*.json) ----

export interface LevelDef {
  level: number;
  cost: Cost;
  buildSeconds: number;
  hp: number;
  ratePerHour?: number;
  storage?: Cost;
  /** Army Camp capacity. */
  housing?: number;
  /** Damage per shot for defenses and traps. */
  damage?: number;
}

export type TargetLayer = 'ground' | 'air' | 'both';

export interface CombatDef {
  targets: TargetLayer;
  range: number;
  minRange?: number;
  fireIntervalTicks: number;
  splashRadius?: number;
  projectile: string;
  projectileSpeed: number;
}

export interface TroopDef {
  name: string;
  description: string;
  housing: number;
  hp: number;
  damage: number;
  attackIntervalTicks: number;
  range: number;
  /** Tiles per tick. */
  speed: number;
  air: boolean;
  prefers: 'any' | 'defense';
  ignoresHedges: boolean;
  trainSeconds: number;
  cost: Cost;
  barracksLevel: number;
  projectile?: string;
  projectileSpeed?: number;
  splashRadius?: number;
}

export interface BattleDef {
  ticksPerSecond: number;
  durationSeconds: number;
  starThresholds: { destruction: number; full: number };
  deployMarginTiles: number;
  hedgePathCost: number;
  maxReplays: number;
  scoutFeeByHall: number[];
  generatedLootByHall: { min: number; max: number }[];
  lootShares: { storage: number; collector: number; hall: number };
  catapultSpread: number;
  deploySpread: number;
}

export interface NamesDef {
  placeFirst: string[];
  placeSecond: string[];
  playerFirst: string[];
  playerSecond: string[];
}

export interface BuildingDef {
  name: string;
  description: string;
  size: number;
  category: BuildingCategory;
  produces?: ResourceKind;
  inShop: boolean;
  combat?: CombatDef;
  levels: LevelDef[];
}

export interface BuildingLimit {
  count: number;
  maxLevel: number;
}

export interface HallLevelDef {
  level: number;
  limits: Record<BuildingType, BuildingLimit>;
}

export interface StartingBuilding {
  type: BuildingType;
  x: number;
  y: number;
  level: number;
}

export interface EconomyDef {
  mapSize: number;
  startingResources: Resources;
  startingLayout: StartingBuilding[];
  collectorHoursCap: number;
  raidableStoredFraction: number;
  raidableUncollectedFraction: number;
  cancelRefundFraction: number;
  welcomeBackMinAwaySeconds: number;
  collectBubbleMinFraction: number;
  minCollectAmount: number;
}

export interface LeagueDef {
  id: string;
  name: string;
  min: number;
  chest: Cost;
}

export interface RanksDef {
  startingTrophies: number;
  attackWin: { base: number; perTrophyDiff: number; min: number; max: number };
  attackLoss: { base: number; perTrophyDiff: number; min: number; max: number };
  matchTrophyRange: number;
  seasonResetFloor: number;
  leagues: LeagueDef[];
}

export interface RaidsDef {
  newPlayerShieldHours: number;
  shieldHours: number;
  shieldDestructionThreshold: number;
  maxRaids: number;
  minAwayMinutes: number;
  raidChancePerHourPerSlot: number;
  maxChancePerSlot: number;
  attackerTrophyRange: number;
  maxDefenseLog: number;
  botArmies: Record<string, number>[];
}

export interface GameData {
  buildings: Record<BuildingType, BuildingDef>;
  hall: { levels: HallLevelDef[] };
  economy: EconomyDef;
  troops: Record<string, TroopDef>;
  battle: BattleDef;
  names: NamesDef;
  ranks: RanksDef;
  raids: RaidsDef;
}
