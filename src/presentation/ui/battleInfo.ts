/**
 * What the battle info popup says about a warrior, a building or a tactic.
 * Pure: reads the battle, never changes it. No DOM, so it is tested directly.
 *
 * Buildings show their name only: never their level, hit points or damage
 * (those are what scouting is for), and never a trap that has not gone off.
 */
import { airborne, inSmoke, isAbility, type BattleSim, type SimTroop } from '../../gameplay/sim/battle/battle';
import { isHidden } from '../../gameplay/sim/battle/warriors';
import { troopLevel } from '../../gameplay/sim/data';
import { WARRIORS, role } from '../../gameplay/sim/progression';
import type { TroopDef } from '../../gameplay/sim/types';
import { formatNumber } from './format';

/** What the popup points at: a warrior on the field, a building, or a card in the deploy bar. */
export type InspectTarget = { kind: 'troop'; index: number } | { kind: 'building'; index: number } | { kind: 'card'; type: string };

export interface WarriorInfo {
  kind: 'warrior';
  type: string;
  name: string;
  level: number;
  /** Role and tier from the roster, e.g. "Blade · tier 1". */
  role: string | null;
  description: string;
  hp: number;
  maxHp: number;
  /** Damage per second at this level (per hit × hits per second). */
  dps: number;
  range: number;
  /** Tiles per second. */
  speed: number;
  space: number;
  flies: boolean;
  targets: string;
  ability: { name: string; text: string } | null;
  /** True for a warrior on the field (its hit points are live). */
  deployed: boolean;
  /** Live effects on a deployed warrior, in words. */
  status: string[];
  /** Deploy bar only: warriors of this type still to send, and donated ones among them. */
  left?: number;
  donated?: { count: number; level: number };
}

export interface BuildingInfo {
  kind: 'building';
  name: string;
}

export interface TacticInfo {
  kind: 'tactic';
  name: string;
  description: string;
  left: number;
}

export type BattleInfo = WarriorInfo | BuildingInfo | TacticInfo;

const ROSTER = new Map(WARRIORS.filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w]));

const TARGETS: Record<TroopDef['prefers'], string> = {
  any: 'Nearest building',
  defense: 'Defenses first',
  storage: 'Storehouses first',
  walls: 'Walls first',
  breach: 'Walls in its way',
  support: 'Supports allies',
};

/** One decimal under 10, whole numbers above. */
function tidy(n: number): number {
  return n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
}

/** The level the next warrior of this type deploys at: donated ones come out first, at their donated level. */
export function nextDeployLevel(sim: BattleSim, type: string): number {
  if ((sim.lodgeLeft[type] ?? 0) > 0) return sim.setup.reinforcements?.[type]?.level ?? 1;
  return sim.setup.levels?.[type] ?? 1;
}

function base(sim: BattleSim, type: string, level: number, damage: number): Omit<WarriorInfo, 'name' | 'hp' | 'maxHp' | 'deployed' | 'status' | 'ability'> {
  const def = sim.data.troops[type];
  const tps = sim.data.battle.ticksPerSecond;
  const w = ROSTER.get(type);
  return {
    kind: 'warrior',
    type,
    level,
    role: w ? `${role(w.role).name} · tier ${w.tier}` : null,
    description: def.description,
    dps: tidy((damage * tps) / def.attackIntervalTicks),
    range: def.range,
    speed: tidy(def.speed * tps),
    space: def.housing,
    flies: def.air,
    targets: TARGETS[def.prefers] ?? TARGETS.any,
  };
}

function abilityOf(type: string): WarriorInfo['ability'] {
  const w = ROSTER.get(type);
  return w ? { name: w.ability.name, text: w.ability.text } : null;
}

/** A warrior on the field: its live hit points and what is happening to it. */
export function troopInfo(sim: BattleSim, index: number): WarriorInfo | null {
  const t: SimTroop | undefined = sim.troops[index];
  if (!t || t.dead || !sim.data.troops[t.type]) return null;
  const def = sim.data.troops[t.type];
  const status: string[] = [];
  if (isHidden(sim, t)) status.push('Unseen');
  if (t.litUntil > sim.tick) status.push('Lit up');
  if (t.air && !airborne(sim, t)) status.push('Grounded');
  if (t.shieldUntil > sim.tick) status.push('Shielded');
  if (t.slowTicks > 0) status.push('Slowed');
  if (inSmoke(sim, t.x, t.y)) status.push('In smoke');
  return {
    ...base(sim, t.type, t.level, t.damage),
    name: t.summoned ? `${def.name} ${t.decoyUntil ? 'decoy' : 'companion'}` : def.name,
    hp: Math.max(0, t.hp),
    maxHp: t.maxHp,
    // Companions and decoys carry none of their owner's abilities.
    ability: t.summoned ? null : abilityOf(t.type),
    deployed: true,
    status,
  };
}

/** A card in the deploy bar: the warrior the next tap sends, or a tactic such as Smoke Bomb. */
export function cardInfo(sim: BattleSim, type: string): WarriorInfo | TacticInfo | null {
  if (isAbility(sim.data, type)) {
    const a = (sim.data.battle.abilities as Record<string, { name: string; description: string }>)[type];
    return { kind: 'tactic', name: a.name, description: a.description, left: sim.charges[type] ?? 0 };
  }
  const def = sim.data.troops[type];
  if (!def) return null;
  const level = nextDeployLevel(sim, type);
  const stats = troopLevel(sim.data, type, level);
  const lodge = sim.lodgeLeft[type] ?? 0;
  return {
    ...base(sim, type, stats.level, stats.damage),
    name: def.name,
    hp: stats.hp,
    maxHp: stats.hp,
    ability: abilityOf(type),
    deployed: false,
    status: [],
    left: sim.remaining[type] ?? 0,
    donated: lodge > 0 ? { count: lodge, level: sim.setup.reinforcements?.[type]?.level ?? 1 } : undefined,
  };
}

/** An enemy building: its name and nothing else. Hidden traps and rubble say nothing. */
export function buildingInfo(sim: BattleSim, index: number): BuildingInfo | null {
  const b = sim.buildings[index];
  if (!b || b.destroyed || b.hidden) return null;
  return { kind: 'building', name: sim.data.buildings[b.type]?.name ?? 'Building' };
}

export function inspectInfo(sim: BattleSim, target: InspectTarget): BattleInfo | null {
  if (target.kind === 'troop') return troopInfo(sim, target.index);
  if (target.kind === 'building') return buildingInfo(sim, target.index);
  return cardInfo(sim, target.type);
}

/** The number on a building's health bar: hit points left, rounded up so a standing building never reads 0. */
export function hpLabel(hp: number): string {
  return formatNumber(Math.ceil(Math.max(0, hp)));
}
