/** Shared simulation types. No rendering code may live in src/sim. */

export type ResourceKind = 'acorns' | 'dew' | 'nightsap' | 'moonstones';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['acorns', 'dew', 'nightsap', 'moonstones'];

export type Resources = Record<ResourceKind, number>;
export type Cost = Partial<Record<ResourceKind, number>>;

export type BuildingType = string;
export type BuildingCategory = 'hall' | 'collector' | 'storage' | 'builder';

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

export interface VillageState {
  createdAt: number;
  /** Last time the game was open (used for offline progress). */
  lastSeenAt: number;
  resources: Resources;
  buildings: Building[];
  nextId: number;
}

// ---- Balance data (loaded from src/data/*.json) ----

export interface LevelDef {
  level: number;
  cost: Cost;
  buildSeconds: number;
  hp: number;
  ratePerHour?: number;
  storage?: Cost;
}

export interface BuildingDef {
  name: string;
  description: string;
  size: number;
  category: BuildingCategory;
  produces?: ResourceKind;
  inShop: boolean;
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

export interface GameData {
  buildings: Record<BuildingType, BuildingDef>;
  hall: { levels: HallLevelDef[] };
  economy: EconomyDef;
}
