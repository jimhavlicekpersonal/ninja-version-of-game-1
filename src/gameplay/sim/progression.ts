/**
 * The progression model: one power budget that scales every warrior,
 * building, EXP track and difficulty tier together.
 * Explained in docs/game-theory/PROGRESSION_MODEL.md; constants in
 * data/progression.json; the roster in data/roster.json.
 *
 *   power(warrior, level) = powerPerHousing x roleEfficiency x housing
 *                           x tierPowerMult^(tier-1) x levelGrowth^(level-1)
 *   power = sqrt(HP x DPS)       (Lanchester-style combat strength)
 *   HP / DPS = role.hpPerDps     (the role decides how power is split)
 *
 * Costs grow faster than power (cost per power rises every level), times grow
 * until a 7-day cap, mastery EXP grows geometrically while its bonus
 * approaches a ceiling, so there is always another level without endless
 * power creep. Pure functions, no randomness.
 */
import progression from '../data/progression.json';
import roster from '../data/roster.json';
import type { GameData } from './types';

export type RoleId = keyof typeof progression.roles;

export interface RoleDef {
  name: string;
  efficiency: number;
  hpPerDps: number;
  housing: number;
  range: number;
  speed: number;
  targets: string;
  air: boolean;
  wallBypass: boolean;
  summary: string;
}

export interface WarriorEntry {
  id: string;
  name: string;
  role: RoleId;
  tier: number;
  ability: { id: string; name: string; text: string };
  look: Record<string, string>;
  /** troops.json id when this warrior is already playable. */
  liveTroop?: string;
}

export interface HeroEntry {
  id: string;
  name: string;
  role: 'hero';
  heroOf: RoleId;
  unlockKeep: number;
  ability: { id: string; name: string; text: string };
  look: Record<string, string>;
}

export interface BuildingEntry {
  id: string;
  name: string;
  category: string;
  unlockKeep: number;
  liveMaxLevel?: number;
  pinnacleMaxLevel: number;
  live: boolean;
  description?: string;
}

export const MODEL = progression;
export const WARRIORS = roster.warriors as unknown as WarriorEntry[];
export const HEROES = roster.heroes as unknown as HeroEntry[];
export const BUILDINGS = progression.buildingCatalog as unknown as BuildingEntry[];
const ROLE_ORDER = Object.keys(progression.roles) as RoleId[];

export function role(id: RoleId): RoleDef {
  return progression.roles[id] as RoleDef;
}

// ---------------------------------------------------------------- warriors

/** Combat power (sqrt of HP x DPS) of one warrior at a level. */
export function warriorPower(w: WarriorEntry, level: number): number {
  const r = role(w.role);
  return progression.powerPerHousing * r.efficiency * r.housing * Math.pow(progression.tierPowerMult, w.tier - 1) * Math.pow(progression.levelGrowth, level - 1);
}

/** HP and damage per second, from the power budget and the role's split. */
export function warriorStats(w: WarriorEntry, level: number): { hp: number; dps: number; power: number; housing: number; range: number; speed: number } {
  const r = role(w.role);
  const p = warriorPower(w, level);
  const k = Math.sqrt(r.hpPerDps);
  return { hp: p * k, dps: p / k, power: p, housing: r.housing, range: r.range, speed: r.speed };
}

/**
 * The Keep level that unlocks a warrior. Tiers open every 3 Keep levels and
 * the 10 roles of a tier are spread over those 3 levels, so every Keep level
 * brings new warriors. Live troops use their real Dojo gating instead.
 */
export function warriorUnlockKeep(w: WarriorEntry, data?: GameData): number {
  if (w.liveTroop && data?.troops[w.liveTroop]) {
    const need = data.troops[w.liveTroop].barracksLevel;
    const keep = data.hall.levels.findIndex((l) => (l.limits.burrow_barracks?.maxLevel ?? 0) >= need) + 1;
    if (keep > 0) return keep;
  }
  const first = progression.tiers[w.tier - 1].firstKeep;
  return first + Math.floor((ROLE_ORDER.indexOf(w.role) * 3) / ROLE_ORDER.length);
}

/** Highest research level a warrior can reach at a Keep level (0 = not unlocked yet). */
export function warriorLevelCap(w: WarriorEntry, keep: number, data?: GameData): number {
  if (keep < warriorUnlockKeep(w, data)) return 0;
  const caps = progression.troopLevelCapByKeep;
  const cap = caps[Math.max(1, Math.min(caps.length, keep)) - 1] - progression.levelCapOffsetPerTier * (w.tier - 1);
  return Math.max(1, Math.min(progression.warriorMaxLevel, cap));
}

/** Provisions to train one warrior at a level. */
export function trainingCost(w: WarriorEntry, level: number): number {
  const t = progression.training;
  return Math.round(t.costPerHousing * role(w.role).housing * Math.pow(t.tierCostMult, w.tier - 1) * Math.pow(t.costGrowth, level - 1));
}

export function trainingSeconds(w: WarriorEntry): number {
  const t = progression.training;
  return Math.round(t.secondsPerHousing * role(w.role).housing * Math.pow(t.tierTimeMult, w.tier - 1));
}

/** Cost and time to research a level (level 1 is free on unlock). */
export function researchCost(w: WarriorEntry, level: number): number {
  if (level <= 1) return 0;
  const r = progression.research;
  return Math.round(r.costBase * Math.pow(r.tierCostMult, w.tier - 1) * Math.pow(r.costGrowth, level - 2));
}

export function researchSeconds(level: number): number {
  if (level <= 1) return 0;
  const r = progression.research;
  return Math.min(r.maxSeconds, Math.round(r.secondsBase * Math.pow(r.timeGrowth, level - 2)));
}

/** Which art stage (1-4) a warrior level shows. */
export function visualStage(level: number): number {
  const s = progression.visualStages.find((v) => level >= v.levels[0] && level <= v.levels[1]);
  return s ? s.stage : progression.visualStages[progression.visualStages.length - 1].stage;
}

// ---------------------------------------------------------------- mastery (EXP)

type MasteryCfg = { xpBase: number; xpGrowth: number; maxBonus: number; bonusRate: number };

/** Total EXP needed to reach a mastery level (level 0 needs none). Unbounded. */
export function masteryXpTotal(level: number, cfg: MasteryCfg = progression.mastery): number {
  if (level <= 0) return 0;
  // Sum of a geometric series: xpBase * (g^level - 1) / (g - 1).
  return Math.round((cfg.xpBase * (Math.pow(cfg.xpGrowth, level) - 1)) / (cfg.xpGrowth - 1));
}

export function masteryLevelFor(xp: number, cfg: MasteryCfg = progression.mastery): number {
  let lvl = 0;
  while (masteryXpTotal(lvl + 1, cfg) <= xp) lvl++;
  return lvl;
}

/** Stat bonus from mastery: rises every level but never passes maxBonus. */
export function masteryBonus(level: number, cfg: MasteryCfg = progression.mastery): number {
  return cfg.maxBonus * (1 - Math.pow(1 - cfg.bonusRate, Math.max(0, level)));
}

/** EXP a warrior type earns from one battle. */
export function battleMasteryXp(housingUsed: number, stars: number): number {
  const m = progression.mastery;
  return housingUsed * m.xpPerHousingUsed * (1 + stars * m.xpPerStar);
}

// ---------------------------------------------------------------- buildings

/** Max building level at a Keep level: live tables up to Keep 6, then a straight climb to the pinnacle. */
export function buildingMaxLevelAt(b: BuildingEntry, keep: number, data?: GameData): number {
  if (keep < b.unlockKeep) return 0;
  const live = progression.liveKeepLevels;
  if (b.live && data && keep <= live) return data.hall.levels[keep - 1].limits[b.id]?.maxLevel ?? 0;
  const start = b.live ? b.liveMaxLevel ?? 1 : 1;
  const from = b.live ? live : b.unlockKeep;
  const span = progression.keepLevels - from;
  if (span <= 0) return b.pinnacleMaxLevel;
  return Math.max(1, Math.min(b.pinnacleMaxLevel, Math.round(start + ((b.pinnacleMaxLevel - start) * (keep - from)) / span)));
}

export function buildingUpgradeSeconds(level: number): number {
  const c = progression.buildings;
  return Math.min(c.maxSeconds, Math.round(c.timeBaseSeconds * Math.pow(c.timeGrowth, level - 1)));
}

/** Relative upgrade cost (x the building's level-1 cost) and relative power. */
export function buildingCurve(level: number): { costMult: number; powerMult: number } {
  const c = progression.buildings;
  return { costMult: Math.pow(c.costGrowth, level - 1), powerMult: Math.pow(c.levelGrowth, level - 1) };
}

/** Building art stage (1..visualStages) for a level out of its pinnacle max. */
export function buildingStage(level: number, maxLevel: number): number {
  const n = progression.buildings.visualStages;
  if (maxLevel <= 1) return 1;
  return Math.min(n, 1 + Math.floor(((level - 1) * n) / maxLevel));
}

// ---------------------------------------------------------------- whole-army view

/** Expected attacking power at a Keep level: a full army of tier-best warriors at their caps. */
export function expectedArmyPower(keep: number): number {
  const housing = progression.armyHousingByKeep[Math.max(1, Math.min(progression.armyHousingByKeep.length, keep)) - 1];
  let best = 0;
  for (const w of WARRIORS) {
    const cap = warriorLevelCap(w, keep);
    if (cap <= 0) continue;
    best = Math.max(best, warriorPower(w, cap) / role(w.role).housing / role(w.role).efficiency);
  }
  return housing * best;
}
