/**
 * Clan Power and the hidden combat rating.
 *
 * Power uses the progression model's currency: combat power = sqrt(HP x DPS)
 * (docs/game-theory/PROGRESSION_MODEL.md). A village's defensive power is the
 * sum over its defenses; traps and walls count by their damage and HP. An
 * army's offensive power is the sum over its warriors at their levels.
 *
 * Clan Power (shown to the player) measures development: defenses plus a full
 * army at the researched levels. The hidden combat rating
 * P = 0.35 D + 0.30 O + 0.20 H + 0.15 S normalises each input to 0..1000 so
 * they can be added, and is used for broad matchmaking bands. Matchmaking for
 * a single attack compares the attacker's offense with the defender's
 * defense, never one combined score.
 */
import { maxHousingAtHall, housingCapacity, barracksLevel } from '../army';
import type { BaseLayout } from '../battle/types';
import { buildingDef, levelDef, troopDef, troopLevel } from '../data';
import { troopLevelCapAt, troopLevelOf } from '../research';
import type { GameData, VillageState } from '../types';

/** Combat power of one building at a level (0 for buildings that do not fight). */
export function buildingPower(type: string, level: number, data: GameData, mult = 1): number {
  const def = data.buildings[type];
  if (!def) return 0;
  const ld = levelDef(data, type, level) ?? def.levels[0];
  if (def.category === 'defense' && def.combat) {
    const dps = ((ld.damage ?? 0) * data.battle.ticksPerSecond) / def.combat.fireIntervalTicks;
    return Math.sqrt(ld.hp * mult * dps * mult);
  }
  const r = data.competition.rating;
  // A trap fires once: count its damage as the DPS of a defense with a fixed HP.
  if (def.category === 'trap') return Math.sqrt(r.trapHpEquivalent * (ld.damage ?? 0) * mult);
  // Walls only soak damage: a share of sqrt(HP) keeps them well below a tower.
  if (def.category === 'hedge') return Math.sqrt(ld.hp * mult) * r.wallWeight;
  return 0;
}

/** Defensive power of a battle base. */
export function defensePower(base: BaseLayout, data: GameData): number {
  let p = 0;
  for (const b of base.buildings) {
    const cat = data.buildings[b.type]?.category;
    const mult = cat === 'hedge' ? base.wallPower ?? 1 : cat === 'defense' || cat === 'trap' ? base.power ?? 1 : 1;
    p += buildingPower(b.type, b.level, data, mult);
  }
  return p;
}

/** Defensive power of the player's finished buildings. */
export function villageDefensePower(state: VillageState, data: GameData): number {
  let p = 0;
  for (const b of state.buildings) if (b.level >= 1) p += buildingPower(b.type, b.level, data);
  return p;
}

/** Combat power of one warrior at a level. */
export function troopPower(type: string, level: number, data: GameData): number {
  const def = troopDef(data, type);
  const lv = troopLevel(data, type, level);
  const dps = (lv.damage * data.battle.ticksPerSecond) / def.attackIntervalTicks;
  return Math.sqrt(lv.hp * dps);
}

/** Offensive power of an army at the given levels (missing levels mean 1). */
export function offensePower(army: Record<string, number>, levels: Record<string, number>, data: GameData): number {
  let p = 0;
  for (const [t, n] of Object.entries(army)) if (data.troops[t] && n > 0) p += n * troopPower(t, levels[t] ?? 1, data);
  return p;
}

/**
 * What the player's army could bring: their Squad Courtyard housing filled with
 * the best power per housing among the warriors their Dojo has unlocked, at
 * the researched levels. Independent of what happens to be trained now.
 */
export function armyPotential(state: VillageState, data: GameData): number {
  const bl = barracksLevel(state, data);
  let best = 0;
  for (const t of Object.keys(data.troops)) {
    const def = data.troops[t];
    if (def.barracksLevel > Math.max(1, bl)) continue;
    best = Math.max(best, troopPower(t, troopLevelOf(state, t), data) / def.housing);
  }
  return housingCapacity(state, data) * best;
}

/** Clan Power: village development plus warrior strength, as one number. */
export function clanPower(state: VillageState, data: GameData): number {
  return Math.round(villageDefensePower(state, data) + armyPotential(state, data));
}

/** Expected defensive power of a full village at a Keep level with every building at its cap. */
export function maxDefenseAtHall(hall: number, data: GameData): number {
  const lim = data.hall.levels[Math.max(1, Math.min(data.hall.levels.length, hall)) - 1].limits;
  let p = 0;
  for (const [type, l] of Object.entries(lim)) {
    const cat = buildingDef(data, type).category;
    if (cat !== 'defense' && cat !== 'trap' && cat !== 'hedge') continue;
    p += l.count * buildingPower(type, l.maxLevel, data);
  }
  return p;
}

/** Offensive power of a full army at a Keep level at its research cap. */
export function maxOffenseAtHall(hall: number, data: GameData): number {
  const cap = troopLevelCapAt(hall, data);
  let best = 0;
  for (const t of Object.keys(data.troops)) best = Math.max(best, troopPower(t, cap, data) / data.troops[t].housing);
  return maxHousingAtHall(hall, data) * best;
}

export interface RatingInputs {
  defense: number;
  offense: number;
  hall: number;
  /** 0..1 recent battle performance. */
  skill: number;
}

/** Each input on a 0..1000 scale (the top Keep's full village and army = 1000). */
export function normalizedInputs(i: RatingInputs, data: GameData): RatingInputs {
  const top = data.hall.levels.length;
  const clamp = (v: number) => Math.max(0, Math.min(1000, v));
  return {
    defense: clamp((1000 * i.defense) / Math.max(1, maxDefenseAtHall(top, data))),
    offense: clamp((1000 * i.offense) / Math.max(1, maxOffenseAtHall(top, data))),
    hall: clamp((1000 * i.hall) / top),
    skill: clamp(1000 * i.skill),
  };
}

/** Hidden combat rating: P = 0.35 D + 0.30 O + 0.20 H + 0.15 S (weights in competition.json). */
export function combatRating(i: RatingInputs, data: GameData): number {
  const n = normalizedInputs(i, data);
  const w = data.competition.rating.weights;
  return Math.round(w.defense * n.defense + w.offense * n.offense + w.hall * n.hall + w.skill * n.skill);
}

/** Recent attack performance, 0..1: average stars / 3 over the last few attacks (0.5 with no history). */
export function recentSkill(state: VillageState, data: GameData): number {
  const n = data.competition.rating.recentBattles;
  const recent = state.battleLog.filter((r) => r.kind === 'attack').slice(-n);
  if (!recent.length) return 0.5;
  return recent.reduce((a, r) => a + r.result.stars / 3, 0) / recent.length;
}

/** The player's rating inputs. */
export function playerRatingInputs(state: VillageState, hall: number, data: GameData): RatingInputs {
  return { defense: villageDefensePower(state, data), offense: armyPotential(state, data), hall, skill: recentSkill(state, data) };
}

/**
 * How an attack looks before it starts: the attacker's offensive power over
 * the base's defensive power, compared with the same ratio for a typical
 * matched fight at that Keep.
 */
export function matchupLabel(offense: number, base: BaseLayout, data: GameData): { ratio: number; label: 'Easy' | 'Even' | 'Hard' | 'Very hard' } {
  return matchupFromDefense(offense, defensePower(base, data), base.hallLevel, data);
}

/** The same label from a defensive power estimate (no village needs to be built). */
export function matchupFromDefense(offense: number, defense: number, hall: number, data: GameData): { ratio: number; label: 'Easy' | 'Even' | 'Hard' | 'Very hard' } {
  const fair = maxOffenseAtHall(hall, data) / Math.max(1, maxDefenseAtHall(hall, data));
  const ratio = offense / Math.max(1, defense) / Math.max(1e-9, fair);
  const t = data.competition.rating.matchTolerance;
  const label = ratio >= 1 + t * 2 ? 'Easy' : ratio >= 1 - t ? 'Even' : ratio >= 1 - t * 2 ? 'Hard' : 'Very hard';
  return { ratio, label };
}
