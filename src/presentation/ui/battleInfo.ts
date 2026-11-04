/**
 * What the battle info popup says about a warrior card, a building or a tactic.
 * Pure: reads the battle, never changes it. No DOM, so it is tested directly.
 *
 * Warrior stats come from the deploy-bar icons (before a warrior is sent in),
 * never from warriors already fighting on the map.
 * Buildings show their name only: never their level, hit points or damage
 * (those are what scouting is for), and never a trap that has not gone off.
 */
import { isAbility, type BattleSim } from '../../gameplay/sim/battle/battle';
import { troopLevel } from '../../gameplay/sim/data';
import { WARRIORS, role } from '../../gameplay/sim/progression';
import type { TroopDef } from '../../gameplay/sim/types';
import { formatNumber } from './format';

/** What the popup points at: a building on the map, or a card in the deploy bar. */
export type InspectTarget = { kind: 'building'; index: number } | { kind: 'card'; type: string };

export interface WarriorInfo {
  kind: 'warrior';
  type: string;
  name: string;
  level: number;
  /** Role and tier from the roster, e.g. "Blade · tier 1". */
  role: string | null;
  description: string;
  hp: number;
  /** Damage per second at this level (per hit × hits per second). */
  dps: number;
  range: number;
  /** Tiles per second. */
  speed: number;
  space: number;
  flies: boolean;
  targets: string;
  ability: { name: string; text: string } | null;
  /** Warriors of this type still to send, and donated ones among them. */
  left: number;
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

/** A card in the deploy bar: the warrior the next tap sends, or a tactic such as Smoke Bomb. */
export function cardInfo(sim: BattleSim, type: string): WarriorInfo | TacticInfo | null {
  if (isAbility(sim.data, type)) {
    const a = (sim.data.battle.abilities as Record<string, { name: string; description: string }>)[type];
    return { kind: 'tactic', name: a.name, description: a.description, left: sim.charges[type] ?? 0 };
  }
  const def = sim.data.troops[type];
  if (!def) return null;
  const stats = troopLevel(sim.data, type, nextDeployLevel(sim, type));
  const w = ROSTER.get(type);
  const lodge = sim.lodgeLeft[type] ?? 0;
  return {
    kind: 'warrior',
    type,
    name: def.name,
    level: stats.level,
    role: w ? `${role(w.role).name} · tier ${w.tier}` : null,
    description: def.description,
    hp: stats.hp,
    dps: tidy((stats.damage * sim.data.battle.ticksPerSecond) / def.attackIntervalTicks),
    range: def.range,
    speed: tidy(def.speed * sim.data.battle.ticksPerSecond),
    space: def.housing,
    flies: def.air,
    targets: TARGETS[def.prefers] ?? TARGETS.any,
    ability: w ? { name: w.ability.name, text: w.ability.text } : null,
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
  return target.kind === 'building' ? buildingInfo(sim, target.index) : cardInfo(sim, target.type);
}

/** The number on a building's health bar: hit points left, rounded up so a standing building never reads 0. */
export function hpLabel(hp: number): string {
  return formatNumber(Math.ceil(Math.max(0, hp)));
}
