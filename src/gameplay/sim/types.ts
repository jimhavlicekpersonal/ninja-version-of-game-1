/** Shared simulation types. No rendering code may live in src/sim. */

export type ResourceKind = 'acorns' | 'dew' | 'nightsap' | 'moonstones';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['acorns', 'dew', 'nightsap', 'moonstones'];

export type Resources = Record<ResourceKind, number>;
export type Cost = Partial<Record<ResourceKind, number>>;

export type BuildingType = string;
export type BuildingCategory = 'hall' | 'collector' | 'storage' | 'builder' | 'military' | 'defense' | 'hedge' | 'trap' | 'support' | 'decor' | 'obstacle' | 'social';

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

/** One research in progress. */
export interface ActiveResearch {
  troop: string;
  toLevel: number;
  startedAt: number;
  endsAt: number;
  cost: Cost;
}

/**
 * Troop research done in the Training Dojo (no builder needed). The Clan Keep
 * sets how many run at once (hall.json `researchLanes`); one per troop type.
 */
export interface ResearchState {
  /** Researched level per troop type; missing means level 1. */
  levels: Record<string, number>;
  /** Research in progress, oldest first. */
  active: ActiveResearch[];
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
  /** Troop levels and the research in progress. */
  research: ResearchState;
  /** The opponent found by scouting, kept until it is attacked or the player pays for Next. */
  scout: { seed: number } | null;
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
  /** Lifetime counters used by tasks, achievements and offers. */
  stats: Stats;
  /** Real-money purchases (for the spend summary and the minor spending cap). */
  purchases: PurchaseRecord[];
  /**
   * Age protections (sim/age.ts). `under18` is derived from `ageBand` once it
   * is known (and kept for older servers and saves); both only get stricter.
   */
  profile: { under18: boolean | null; ageBand?: import('./age').AgeBand | null };
  offers: { active: ActiveOffer[]; lastShown: Record<string, number>; bought: string[] };
  pass: { season: number; points: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  /** Task periods; `dayIds`/`weekIds` are the tasks chosen when the period began (absent on older saves until the next roll). */
  tasks: { day: number; dayBaseline: Stats; dayClaimed: string[]; week: number; weekBaseline: Stats; weekClaimed: string[]; dayIds?: string[]; weekIds?: string[]; dayTargets?: Record<string, number>; weekTargets?: Record<string, number> };
  cosmetics: { owned: string[]; hallSkin: string };
  /** Achievement id -> number of tiers claimed. */
  achievements: Record<string, number>;
  /** `sandbox`: made or played in the testing sandbox (time skips, free test store); never moves to a server (save v14). */
  flags: { longWaitSeen: boolean; sandbox?: boolean };
  grove: GroveState;
  /** What a multiplayer server has already given this village (see sim/net.ts). */
  net: NetState;
  /** Guided first steps for new players. */
  tutorial: { step: number; done: boolean };
  /**
   * Shadow Trials: highest tier cleared (rewards are paid once per tier), the
   * alternate fortress chosen for the next tier, and the next tier if the last
   * attempt at it failed (which allows switching).
   */
  trials: { best: number; alternate?: number; failedTier?: number };
  /**
   * A raid in progress (saved from the first deployment). If the app closes
   * mid-battle it is resolved on the next launch as if it had played out.
   */
  pendingBattle: PendingBattle | null;
  /** Free daily chest and visit streak. */
  daily: DailyState;
  /** League seasons settled most recently, newest last (chest = what was really added). */
  seasonLog: import('./ranks').SeasonReward[];
  /** Saved army presets for one-tap retraining (see sim/army.ts `trainPlan`). */
  armyPresets: ArmyPreset[];
  /** Clan Stipend (sim/stipend.ts, save v16): daily Jade payments left to claim, and the day the last one was claimed. */
  stipend: StipendState;
  /** Goal events (sim/goalEvents.ts, save v16): progress in the current goal event occurrence. */
  goalEvent: GoalEventState | null;
}

export interface StipendState {
  /** Daily payments still to claim (0 = no stipend). */
  left: number;
  /** Day index (pass days) of the last claim; -1 = never. */
  lastDay: number;
}

/** Progress in one goal event occurrence (`key` = schedule id + repeat number). */
export interface GoalEventState {
  key: string;
  /** Best result so far: stars and destruction (bounty), or the count reached (counting goals). */
  best: number;
  bestDestruction: number;
  /** Ladder steps already paid (indexes into the event's `ladder`). */
  claimed: number[];
}

/** A saved army: troop counts to refill to. */
export interface ArmyPreset {
  name: string;
  army: Record<string, number>;
}

export interface DailyState {
  /** Day index (pass days) the chest was last opened; -1 = never. */
  lastDay: number;
  /** Current step on the streak ladder (0 before the first chest). */
  step: number;
  /** Free skips left this week, and the week they belong to. */
  skipsLeft: number;
  skipWeek: number;
  /** Recent chests, newest last. */
  history: { day: number; outcome: string; step: number; grants: Cost; overflow?: Cost }[];
}

export interface NetState {
  /** Server account these markers belong to (reset when it changes). */
  playerId: string | null;
  /** Real raids from the server applied up to this time. */
  defensesSince: number;
  /** Server donation ids already added to the Grove Lodge. */
  donations: string[];
  /** Server Grove Raid weeks whose chest was collected. */
  raidWeeks: number[];
  /** Gang Wars whose chest was collected (step 65; the latest few). */
  gangWars: string[];
}

export interface ChatMessage {
  at: number;
  /** Member index, or -1 for the player. */
  from: number;
  text: string;
  kind: 'chat' | 'request' | 'donation' | 'system';
}

export interface BotRequest {
  id: string;
  at: number;
  member: number;
  troop: string;
  /** Housing space requested and donated so far. */
  size: number;
  donated: number;
}

export interface GroveRaidState {
  week: number;
  /** Player's attacks: target enemy base index and stars won. */
  attacks: { target: number; stars: number; destruction: number; at: number }[];
  paidOut: boolean;
  result: { ours: number; theirs: number; outcome: 'win' | 'draw' | 'loss' } | null;
}

export interface GroveState {
  joined: boolean;
  seed: number;
  joinedAt: number;
  xp: number;
  chat: ChatMessage[];
  /** Bot activity has been generated up to this time. */
  processedAt: number;
  requests: BotRequest[];
  myRequest: { at: number; chunks: number } | null;
  reinforcements: Record<string, number>;
  /**
   * The level each donated troop type was given at (it fights at that level,
   * not the receiver's research). Donations of one type at different levels
   * keep the lower level, so a donation never fights above what was given.
   */
  reinforcementLevels: Record<string, number>;
  raid: GroveRaidState | null;
  raidHistory: { week: number; ours: number; theirs: number; outcome: 'win' | 'draw' | 'loss'; reward: Cost }[];
  prepOfferWeek: number;
  /** Every Grove Raid up to and including this week has been paid out. */
  settledWeek: number;
}

/**
 * Lifetime counters. `upgradesDone` and `troopsTrained` count finished work
 * (cancelled timers never count), so tasks cannot be farmed by start-and-cancel.
 */
export type StatKey = 'collectedAcorns' | 'collectedDew' | 'upgradesStarted' | 'upgradesDone' | 'troopsTrained' | 'raidsWon' | 'starsEarned' | 'obstaclesCleared' | 'moonstonesSpent' | 'donations' | 'researchDone' | 'trialsCleared' | 'defensesFaced' | 'defensesWon' | 'rematchesWon' | 'raidDestruction';
export type Stats = Record<StatKey, number>;
/** `defensesFaced`/`defensesWon`: raids against the village and the ones it held (no stars lost); `rematchesWon`: won "settle the score" rematches; `raidDestruction`: summed destruction % of settled raids (save v16). */
export const STAT_KEYS: readonly StatKey[] = ['collectedAcorns', 'collectedDew', 'upgradesStarted', 'upgradesDone', 'troopsTrained', 'raidsWon', 'starsEarned', 'obstaclesCleared', 'moonstonesSpent', 'donations', 'researchDone', 'trialsCleared', 'defensesFaced', 'defensesWon', 'rematchesWon', 'raidDestruction'];
export function emptyStats(): Stats {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Stats;
}

export interface PurchaseRecord {
  id: string;
  productId: string;
  usd: number;
  at: number;
  /** What was delivered (save v16): offers scale with the Keep and storage, so a refund takes back this, not the catalog contents. */
  grants?: Cost;
}

export interface ActiveOffer {
  id: string;
  shownAt: number;
  expiresAt: number;
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
  /** Training Dojo: how many times faster than the base training time warriors train. */
  trainingSpeed?: number;
  /** Damage per shot for defenses and traps. */
  damage?: number;
  /** Grove Lodge: housing space for donated troops. */
  reinforcement?: number;
  /** Counter buildings: values that override the building's base `effect` at this level. */
  effect?: Partial<BuildingEffect>;
}

/**
 * A defensive counter's rule (buildings.json `effect`, per-level overrides in
 * `levels[].effect`). Each kind answers one family of warrior abilities.
 */
export interface BuildingEffect {
  kind: 'reveal_line' | 'shorten_disables' | 'anti_heal' | 'ground_flyers' | 'counter_artillery';
  /** Tiles from the building's centre the effect reaches. */
  radius?: number;
  /** reveal_line: seconds a warrior stays lit. ground_flyers: seconds a flyer stays grounded. */
  seconds?: number;
  /** reveal_line: extra damage lit warriors take. */
  vulnerablePct?: number;
  /** shorten_disables: share of a jam's remaining time removed, and repairs per battle. */
  pct?: number;
  uses?: number;
  /** anti_heal: healing cut, and the cut to heal/haste/resist auras and shelter shields. */
  healCutPct?: number;
  auraCutPct?: number;
  /** ground_flyers: seconds a flyer can't be grounded again after breaking free. */
  immuneSeconds?: number;
  /** counter_artillery: preferred targets are warriors with at least this attack range. */
  prefersBeyond?: number;
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

export interface TroopLevelDef {
  level: number;
  hp: number;
  damage: number;
  /** Training cost per troop at this level. */
  cost: Cost;
  /** What researching this level costs (absent on level 1). */
  research?: { cost: Cost; seconds: number };
}

export interface TroopDef {
  name: string;
  description: string;
  housing: number;
  attackIntervalTicks: number;
  range: number;
  /** Tiles per tick. */
  speed: number;
  air: boolean;
  prefers: 'any' | 'defense' | 'storage' | 'walls' | 'breach' | 'support';
  ignoresHedges: boolean;
  trainSeconds: number;
  barracksLevel: number;
  unlockKeep?: number;
  levelCapOffset?: number;
  levels: TroopLevelDef[];
  projectile?: string;
  projectileSpeed?: number;
  splashRadius?: number;
  /** Special action the troop performs on reaching a valid target (see BattleDef.sabotage). */
  ability?: string;
  /** Data-driven warrior mechanics; all durations are battle ticks. */
  kit?: WarriorKit;
  /** How many times one troop can use its ability per battle. */
  abilityCharges?: number;
}

export interface WarriorKit {
  extraTargets?: number;
  radius?: number;
  secondaryDamage?: number;
  every?: number;
  hitMultiplier?: number;
  dashSpeed?: number;
  firstHitMultiplier?: number;
  poisonTicks?: number;
  poisonFraction?: number;
  shred?: number;
  durationTicks?: number;
  jamTicks?: number;
  jamTargets?: number;
  disarm?: boolean;
  chargeDelay?: number;
  chargeMultiplier?: number;
  stunTicks?: number;
  wallMultiplier?: number;
  openWalls?: boolean;
  aura?: 'heal' | 'haste' | 'veil' | 'resist' | 'splash' | 'taunt';
  strength?: number;
  cooldownTicks?: number;
  revive?: number;
  shelter?: number;
  shieldTicks?: number;
  summons?: number;
  summonShare?: number;
  stealth?: boolean;
  decoyTicks?: number;
  smokeMultiplier?: number;
  teleport?: boolean;
  trapImmune?: boolean;
  critChance?: number;
  critMultiplier?: number;
  rageMultiplier?: number;
  burnTicks?: number;
  burnFraction?: number;
  suicide?: boolean;
  defenseSlow?: number;
}

/** A tactical ability the attacker places on the map (Smoke Bomb). */
export interface SmokeBombDef {
  name: string;
  description: string;
  /** Radius of the cloud, in tiles. */
  radius: number;
  /** How long the cloud lasts, in ticks. */
  durationTicks: number;
  /** A defense's range against a troop inside the cloud is multiplied by this... */
  rangeFactor: number;
  /** ...but never drops below this many tiles (defenses are never fully blind). */
  minTargetRange: number;
  /** Charges per battle: base + 1 per `housingPerCharge` housing in the army, up to `maxCharges`. */
  baseCharges: number;
  housingPerCharge: number;
  maxCharges: number;
}

export interface SabotageDef {
  /** How close (tiles from the footprint edge) the troop must get. */
  rangeTiles: number;
  /** How long a sabotaged defense stays silent, in ticks. */
  disableTicks: number;
  /** After it recovers, how long it cannot be sabotaged again, in ticks. */
  immunityTicks: number;
}

export interface BattleDef {
  warriorRules: {
    supportIntervalTicks: number;
    /** A support troop tries this many of the nearest allies for one it can reach without breaking a wall. */
    supportAllyTries: number;
    defaultAuraRadius: number;
    abilityCooldownTicks: number;
    shieldCooldownTicks: number;
    shieldMaximumDamage: number;
    teleportDistance: number;
    summonOffset: number;
    decoyHpMultiplier: number;
  };
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
  /** When an attack counts as a close call (shown after the battle, only if true). */
  closeCall: { starMargin: number; hallHpFraction: number; buildingsLeft: number; perfectMinDestruction: number };
  /** Tactical abilities, keyed by the id used in deployments (`Deployment.troop`). */
  abilities: { smoke_bomb: SmokeBombDef };
  sabotage: SabotageDef;
  /** Infiltration Points (sim/battle/infiltration.ts): where warriors may enter, and how many each path hides. */
  infiltration: {
    /** Points per base (out of 8 compass approaches). */
    points: number;
    /** How far in from the map edge each approach is anchored. */
    insetTiles: number;
    /** Tiles from a point's centre that count as that point. */
    radius: number;
    /** Each point hides 1/minPoints of the army's housing, so a full army needs this many points. */
    minPoints: number;
    /** Every point hides at least this much housing (keeps tiny early armies simple). */
    minCover: number;
  };
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
  /** Defensive counter rule (see BuildingEffect). */
  effect?: BuildingEffect;
  /** Forest obstacles: what clearing costs and the Moonstones it gives. */
  clear?: { cost: Cost; seconds: number; moonstones: number };
  levels: LevelDef[];
}

export interface BuildingLimit {
  count: number;
  maxLevel: number;
}

export interface HallLevelDef {
  level: number;
  /** Highest troop level that can be researched at this hall level. */
  troopLevelCap: number;
  /** How many troop researches can run at the same time. */
  researchLanes: number;
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
  /** Full armies that may wait in the training queue on top of a full army in the camps. */
  queuedArmies: number;
  /** Share of a dismissed ready warrior's training cost given back (storage permitting). */
  dismissRefundFraction: number;
  /** Most warriors one Train command queues, and how many armies can be saved as presets. */
  maxTrainBatch: number;
  maxArmyPresets: number;
  collectBubbleMinFraction: number;
  minCollectAmount: number;
  builderHutCosts: number[];
  obstacles: { count: number; kinds: string[]; keepClearRadius: number };
  /**
   * Multiplier on the Acorns and Dew in fixed rewards (league chests, Grove
   * Raid chests) by the player's Elder Toadstool level, so a reward is worth
   * about the same share of progress at every hall. Data amounts are for 1.0.
   */
  rewardScaleByHall: number[];
}

export interface LeagueDef {
  id: string;
  name: string;
  min: number;
  /** Monthly chest; Acorns and Dew are scaled by `rewardScaleByHall`. */
  chest: Cost;
  /** Extra loot for a won attack in this league (paid in full at 3 stars, a third per star). */
  winBonus: Cost;
}

/** Settings for the hidden Attack and Base Ratings (ranks.json `rating`). */
export interface RatingDef {
  initial: number;
  initialRd: number;
  minRd: number;
  /** Each rated battle multiplies the rating deviation by this (it settles). */
  rdShrinkPerBattle: number;
  /** Rating deviation added per day without a rated battle (uncertainty grows while away). */
  rdGrowthPerIdleDay: number;
  /** β: rating points one Keep level of power is worth. */
  powerWeight: number;
  /** K at the starting deviation, and once fully settled. */
  kNew: number;
  kSettled: number;
  /** A battle's score: starWeight × stars/3 + destructionWeight × destruction. */
  starWeight: number;
  destructionWeight: number;
  /** Matchmaking aims for this expected score. */
  matchTarget: number;
  /** A base whose layout moved by more than this share starts its Base Rating over. */
  layoutResetShare: number;
  /** Most honor a defender can lose in one UTC day. */
  defenderDailyHonorLossCap: number;
  /** Rated attacks needed to appear on the Power Ranking. */
  powerBoardMinBattles: number;
}

export interface RanksDef {
  startingTrophies: number;
  attackWin: { base: number; perTrophyDiff: number; min: number; max: number };
  attackLoss: { base: number; perTrophyDiff: number; min: number; max: number };
  matchTrophyRange: number;
  seasonResetFloor: number;
  leagues: LeagueDef[];
  /**
   * Generated opponents and bot raiders are picked by trophies. Strength is
   * measured in Elder Toadstool levels: `trophies / trophiesPerHall`, so hall
   * h covers strength [h-1, h). The fractional part sets how close the base's
   * buildings are to that hall's caps.
   */
  matchmaking: {
    trophiesPerHall: number;
    /** Random spread of an opponent's strength around yours (hall levels). */
    strengthJitter: number;
    /** Opponents are kept within these many hall levels below / above yours. */
    hallsBelow: number;
    hallsAbove: number;
    /** Random spread of an opponent's trophies around its strength. */
    trophyJitter: number;
    /** Opponents are at least the attacker's earned strength (Keep and research) minus this many hall levels. */
    powerSlack: number;
  };
  /** Hidden matchmaking ratings (roadmap Phase 3, sim/rating.ts). */
  rating: RatingDef;
  /** Loot multiplier when the target's Elder Toadstool is lower than the attacker's (index = difference). */
  lootPenaltyByHallDiff: number[];
}

export interface RaidsDef {
  newPlayerShieldHours: number;
  /** Shield after a raid, by destruction (highest tier reached wins). */
  shieldTiers: { destruction: number; hours: number }[];
  /**
   * Bot raids are scheduled on the real clock: each slot of `slotMinutes`
   * (counted from the Unix epoch) holds a raid with `chancePerSlot`, at a time
   * fixed by the village seed. A raid lands if the game was closed then and no
   * shield was up, so how often the player checks in does not matter.
   */
  slotMinutes: number;
  chancePerSlot: number;
  /** No raid in the first minutes after closing the game. */
  graceMinutes: number;
  /** Safety cap on raids simulated in one catch-up. */
  maxRaidsPerCatchUp: number;
  maxDefenseLog: number;
  /** Bot army make-up by attacker hall level: share of housing per troop. */
  botArmyMix: Record<string, number>[];
  /** Most of each resource raiders can take from storages, by the defender's hall level. */
  storageLootCapByHall: number[];
  /** The first `count` bot raids a village faces bring `housingShare` of a full army, `levelsBelowCap` levels under the research cap. */
  newPlayerRaids?: { count: number; housingShare: number; levelsBelowCap: number };
  /** A bot raid held to 0 stars pays this share of the Keep's lowest raid loot. */
  defenseWin?: { shareOfRaidLoot: number };
  /** Settle-the-score rematches against a bot raider's base (sim/rematch.ts). */
  rematch?: { windowHours: number; shareOfRaidLoot: number };
}

export interface PackDef {
  id: string;
  name: string;
  usd: number;
  moonstones: number;
}

export interface StoreDef {
  currency: string;
  packs: PackDef[];
  skipCurve: [number, number][];
  topUpCurve: [number, number][];
  /** Amounts are divided by this (per Keep, 1-15) before `topUpCurve` prices them (tools/balance/topup.mjs). */
  topUpScaleByHall: number[];
  /** Multiplies the time price of finishing army training with Jade (per Keep, 1-15; tools/balance/topup.mjs). */
  trainingSkipScaleByHall: number[];
  minorMonthlyCapUsd: number;
  /**
   * The id each product has in App Store Connect and the Play Console, by the
   * game's own product id (pack ids, `pass.productId`, offer `productId`). The
   * game's ids stay stable (they are in saves); only these change with a new
   * store listing. A product missing here uses its own id.
   */
  storeProductIds?: Record<string, string>;
  /** Clan Stipend (sim/stipend.ts): a consumable that adds `payments` daily Jade payments, one claimable per day. */
  stipend?: { id: string; name: string; usd: number; payments: number; jadePerPayment: number };
}

export type OfferTrigger = 'first_long_wait' | 'all_builders_busy' | 'grove_raid_soon' | 'heavy_defense_loss';

export interface OfferRule {
  id: string;
  trigger: OfferTrigger;
  title: string;
  description: string;
  productId: string;
  usd: number;
  contents: Cost;
  durationHours: number;
  oncePerAccount: boolean;
  cooldownHours: number;
  /** Do not show this offer to brand-new players. */
  minAccountHours?: number;
  /** Never shown again (its product still delivers a purchase made before). */
  retired?: boolean;
}

export interface OffersDef {
  durationHoursMin: number;
  durationHoursMax: number;
  maxPerSession: number;
  rules: OfferRule[];
}

export interface PassReward extends Cost {
  skin?: never;
}

export interface TaskTemplate {
  id: string;
  text: string;
  stat: StatKey;
  base: number;
  perHall: number;
  /** Star/win tasks: raids assumed in the period; the target follows the recent star or win rate (sim/pass.ts). */
  adaptive?: number;
}

export interface PassDef {
  name: string;
  epoch: number;
  seasonDays: number;
  pointsPerTier: number;
  productId: string;
  usd: number;
  premiumBuildSpeedBonus: number;
  /** The premium Scroll is not sold in the last days of a season (too few tiers left to earn). */
  noSaleLastDays?: number;
  /** ...unless the player has already unlocked this many tiers (they get them at once). */
  noSaleUnlessTiers?: number;
  /** How star/win task targets follow recent raids. */
  adaptiveTasks?: { recentRaids: number; minRecent: number; minExpected: number };
  tiers: { tier: number; free: Cost & { skin?: string }; premium: Cost & { skin?: string } }[];
  dailyTaskPoints: number;
  weeklyChallengePoints: number;
  dailyTasks: TaskTemplate[];
  weeklyChallenges: TaskTemplate[];
  weeklyCount: number;
}

export interface SkinDef {
  id: string;
  name: string;
  moonstones: number;
  passOnly?: boolean;
  cap: string;
  spots: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  stat: StatKey | 'hallLevel';
  tiers: [number, number][];
}

export interface SocialDef {
  membersMin: number;
  membersMax: number;
  groveNames: { first: string[]; second: string[] };
  colors: string[];
  chatSlotMinutes: number;
  chatChancePerSlot: number;
  requestChancePerSlot: number;
  requestSizes: number[];
  requestTroops: string[];
  requestLifetimeHours: number;
  maxChat: number;
  requestCooldownMinutes: number;
  /** Chat messages one player may post per minute on the server. */
  chatPerMinute: number;
  reinforcementChunkMinutes: number;
  reinforcementChunkHousing: number;
  xpPerHousing: number;
  xpLevels: number[];
  chatLines: Record<'random' | 'greet' | 'thanks' | 'raidStart' | 'raidEnd' | 'reply' | 'donated', string[]>;
  profanity: string[];
  groveRaid: {
    epoch: number;
    durationHours: number;
    attacksPerMember: number;
    prepOfferHours: number;
    starOdds: { base3: number; base2: number; base1: number; perHallDiff: number };
    rewards: Record<'win' | 'draw' | 'loss', Cost & { xp: number }>;
  };
  /** Gang Wars (roadmap steps 65-66). */
  gangWar: {
    minSize: number;
    maxSize: number;
    prepHours: number;
    battleHours: number;
    attacksPerMember: number;
    /** Share of a relay strike's damage the next strike starts from. */
    relayCarry: number;
    botAfterMinutes: number;
    recentOpponents: number;
    rewards: Record<'win' | 'draw' | 'loss', Cost>;
  };
}

export interface DailyDef {
  chest: { outcomes: { id: string; label: string; weight: number; reward: Cost }[] };
  streak: { steps: { bonus: number; moonstones?: number }[]; skipsPerWeek: number; stepsLostPerMissedDay: number; historyDays: number };
}

export interface EventEffect {
  /** Extra share when collecting from collectors. */
  collectBonus?: number;
  /** Extra share of the loot from a won attack. */
  raidLootBonus?: number;
  /** Share taken off troop training costs. */
  trainingDiscount?: number;
}

/** A goal event's reward ladder: each step pays once per occurrence when `at` is reached. */
export interface GoalLadderStep {
  /** Stars (bounty) or count (counting goals) needed. */
  at: number;
  /** Bounty only: destruction % needed instead of stars (the step is reached by either). */
  destruction?: number;
  /** Soft resources are scaled by the Keep (`rewardScaleByHall`); Jade is not. */
  reward: Cost;
}

/** What a goal event asks for. `bounty`: attack the occurrence's bounty fortress (a generated base at your Keep, the same for every attempt). */
export interface GoalDef {
  kind: 'bounty';
  /** Defense power multiplier on the bounty fortress (1 = a same-Keep base at mid levels). */
  power: number;
  ladder: GoalLadderStep[];
}

export interface EventsDef {
  /** Schedule start (UTC ms); the schedule repeats every `periodDays`. */
  epoch: number;
  periodDays: number;
  schedule: { id: string; name: string; description: string; startHour: number; durationHours: number; effect: EventEffect; goal?: GoalDef }[];
}

export interface NotificationsDef {
  maxPerDay: number;
  /** Local hours; reminders that would land in between wait until `end`. */
  quietHours: { start: number; end: number };
  /** In priority order: when a day has too many, the earlier types win. */
  types: { id: string; label: string; default: boolean }[];
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
  store: StoreDef;
  offers: OffersDef;
  pass: PassDef;
  cosmetics: { hallSkins: SkinDef[] };
  achievements: AchievementDef[];
  social: SocialDef;
  daily: DailyDef;
  events: EventsDef;
  notifications: NotificationsDef;
  trials: TrialsDef;
}

/** A Shadow Trial modifier (affix) that applies on every `every`-th tier. */
export interface TrialModifierDef {
  id: string;
  every: number;
  name: string;
  description: string;
  power?: number;
  wallPower?: number;
}

export interface TrialsDef {
  tiersPerHall: number;
  powerGrowthPerTier: number;
  maxPower: number;
  starsToClear: number;
  rewardShareOfRaidLoot: number;
  rewardLog2Growth: number;
  jadeEveryTiers: number;
  jadeReward: number;
  modifiers: TrialModifierDef[];
  /** Fortresses generated per tier; the one of median strength is used. */
  candidates: number;
  /** Authored power factor per layout id, so every layout is about as hard at the same tier. */
  layoutPower: Record<string, number>;
  /** Alternate fortresses a player may switch the next tier to (one per failed attempt). */
  maxAlternates: number;
}

/** An attack that has started (troops deployed) but not been banked yet. */
export interface PendingBattle {
  /** 'bounty' (a goal event's fortress, `eventKey`) and 'rematch' (`defenseId`) settle with `bountyEnd` / `rematchEnd`. */
  kind: 'raid' | 'trial' | 'war' | 'bounty' | 'rematch';
  eventKey?: string;
  defenseId?: string;
  tier?: number;
  /** Alliance War: the enemy base attacked. */
  target?: number;
  /** The battle rules it was fought under (SIM_RULES). */
  rules?: number;
  opponentName: string;
  setup: import('./battle/types').BattleSetup;
  deployments: import('./battle/types').Deployment[];
  /** Server ticket for an online raid, so the report can still be sent. */
  ticket?: string;
  /** A Gang War strike (kind 'war'): its report goes to the Gang War, not the Alliance War (step 67). */
  channel?: 'gangwar';
  at: number;
}
