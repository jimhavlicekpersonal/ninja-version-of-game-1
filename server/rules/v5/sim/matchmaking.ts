/**
 * Matchmaking for generated opponents and bot raiders.
 *
 * Trophies decide how strong an opponent is, measured in Elder Toadstool
 * levels ("strength"): hall h covers strength [h-1, h), and the fraction says
 * how close its buildings are to that hall's caps. Climbing therefore brings
 * tougher bases with more loot, and an opponent's trophies follow its
 * strength. When a player's trophies run ahead of what their own hall may be
 * matched against, their opponents carry fewer trophies than they do, so wins
 * pay less and losses cost more: trophies settle where the player wins about
 * as often as the trophy formula demands instead of climbing forever.
 */
import { generateOpponent } from './battle/basegen';
import type { BaseLayout } from './battle/types';
import { maxHousingAtHall, troopUnlock } from './army';
import { troopDef } from './data';
import { troopLevelCapAt, troopLevelOf } from './research';
import { createRng, mixSeed, next, type Rng } from './rng';
import type { GameData, ResourceKind, VillageState } from './types';
import { hallLevel } from './village';

export interface MatchStrength {
  /** Elder Toadstool level of the opponent. */
  hall: number;
  /** 0..1 inside that hall level (0 = just arrived, 1 = maxed). */
  bias: number;
  trophies: number;
}

export function maxHall(data: GameData): number {
  return data.hall.levels.length;
}

/** Strength in hall units for a trophy count. */
export function strengthFor(trophies: number, data: GameData): number {
  return Math.max(0, trophies) / data.ranks.matchmaking.trophiesPerHall;
}

/**
 * Strength of a matched opponent: near the player's trophies, but never more
 * than `hallsBelow` / `hallsAbove` Elder Toadstool levels away from the
 * player's own hall. Pass `mirror` for attackers matched against a defender.
 */
export function matchStrength(rng: Rng, trophies: number, ownHall: number, data: GameData, mirror = false, floor = 0): MatchStrength {
  const mm = data.ranks.matchmaking;
  const top = maxHall(data);
  const below = mirror ? mm.hallsAbove : mm.hallsBelow;
  const above = mirror ? mm.hallsBelow : mm.hallsAbove;
  const hi = Math.min(top, ownHall + above) - 1e-6;
  // Never weaker than the attacker's own earned power allows (see attackerStrength).
  const lo = Math.min(hi, Math.max(0, ownHall - below - 1, floor));
  let s = strengthFor(trophies, data) + (next(rng) * 2 - 1) * mm.strengthJitter;
  s = Math.max(lo, Math.min(hi, s));
  const whole = Math.floor(s);
  const t = Math.round(s * mm.trophiesPerHall + (next(rng) * 2 - 1) * mm.trophyJitter);
  return { hall: whole + 1, bias: s - whole, trophies: Math.max(0, t) };
}

/** Loot multiplier for an attacker at `attackerHall` hitting a base at `targetHall`. */
export function lootPenalty(attackerHall: number, targetHall: number, data: GameData): number {
  const diff = attackerHall - targetHall;
  if (diff <= 0) return 1;
  const table = data.ranks.lootPenaltyByHallDiff;
  return table[Math.min(diff, table.length - 1)];
}

/** Scale the loot in a base for the attacker's hall level. Mutates. */
export function applyLootPenalty(base: BaseLayout, attackerHall: number, data: GameData): BaseLayout {
  const m = lootPenalty(attackerHall, base.hallLevel, data);
  if (m >= 1) return base;
  for (const b of base.buildings) {
    if (!b.loot) continue;
    for (const k of Object.keys(b.loot) as ResourceKind[]) b.loot[k] = Math.floor((b.loot[k] ?? 0) * m);
  }
  return base;
}

/**
 * The Keep whose research caps a warrior level matches, on the Keep's level scale (`troopLevelCap`
 * in hall.json): a level at Keep K's cap reads K, a level between two Keeps' caps reads in between.
 * Levels below the first cap read 0..1.
 */
export function researchKeep(level: number, data: GameData): number {
  const caps = data.hall.levels.map((l) => l.troopLevelCap ?? 1);
  if (level <= caps[0]) return Math.max(0, level / Math.max(1, caps[0]));
  for (let k = 1; k < caps.length; k++) {
    if (level <= caps[k]) {
      // The first Keep reaching this level; Keeps that share a cap read the earliest.
      let lo = k - 1;
      while (lo > 0 && caps[lo - 1] === caps[lo]) lo--;
      return caps[k] === caps[lo] ? lo + 1 : lo + 1 + (level - caps[lo]) / (caps[k] - caps[lo]);
    }
  }
  return caps.length;
}

/**
 * How strong a player's army is, in hall units: the Keep whose research caps its warriors'
 * levels match (`researchKeep`), averaged over the warriors it fields (ready or training, or
 * every warrior it can train if none), between its own Keep and `researchFloorKeeps` (1.5) below
 * it. A Keep 15 player with maxed research is 15; one with Keep 14's research is 14.
 *
 * Levels are read on the Keep's research scale: a newer tier's level 1 is as strong as an
 * older warrior at level 1 + `levelCapOffset`, so swapping in newly unlocked warriors at
 * level 1 does not make the army look weaker than the army it replaced.
 *
 * Design re-audit (Nov 2026): this used to be Keep − 1 plus the share of the whole level
 * scale reached, so an army two levels behind its Keep's caps still read ~0.9 of the Keep
 * (Keep 12: 12 of 14 levels) and was matched with bases near their caps: casual players
 * averaged 0.0–0.1 stars at Keeps 11–15. Now research behind the caps reads as the earlier
 * Keep it matches, so an army meets bases of the research it has (honor can still raise them).
 */
export function attackerStrength(state: VillageState, data: GameData): number {
  const hall = hallLevel(state, data);
  const fielded = new Set([...Object.keys(state.army), ...state.training.map((q) => q.troop)]);
  const troops = fielded.size ? [...fielded] : Object.keys(data.troops).filter((t) => troopUnlock(state, t, data).unlocked);
  const below = data.ranks.matchmaking.researchFloorKeeps ?? 1;
  let sum = 0;
  let n = 0;
  for (const t of troops) {
    const def = data.troops[t];
    if (!def) continue;
    const offset = def.levelCapOffset ?? 0;
    const lvl = Math.min(troopLevelCapAt(hall, data, t), troopLevelOf(state, t)) + offset;
    // At its own Keep's cap it is maxed for this Keep (Keeps that share a cap would read the earliest).
    // Never more than `researchFloorKeeps` below the own Keep: camps and army size grow with the Keep
    // too, and armies read lower than that met bases they three-starred (Keeps 5-7 in the campaigns).
    sum += lvl >= troopLevelCapAt(hall, data) ? hall : Math.max(hall - below, Math.min(hall, researchKeep(lvl, data)));
    n++;
  }
  return n ? sum / n : hall - 1;
}

/**
 * How far below its earned strength a Keep's opponents may be (`powerSlackByKeep`, else `powerSlack`).
 * Report section 5 step 11 (economy E24): the Keep 3 army has just arrived (small camps, new
 * warriors at level 1) and met near-capped Keep 2 bases, so the day-2 window was a cliff
 * (0.88 stars against 2.67 at Keep 2). Early Keeps get more room; the late game keeps 0.25.
 */
export function powerSlackAt(hall: number, data: GameData): number {
  const mm = data.ranks.matchmaking;
  return mm.powerSlackByKeep?.[hall - 1] ?? mm.powerSlack;
}

/**
 * The generated opponent behind a scout seed, for this player. Trophies pick
 * the strength, but never below what the player's own army has earned (minus
 * a little slack): climbing research while honor lags no longer turns the late
 * game into farming bases a whole Keep below.
 */
export function opponentFor(seed: number, state: VillageState, data: GameData): BaseLayout {
  const floor = attackerStrength(state, data) - powerSlackAt(hallLevel(state, data), data);
  return opponentForRank(seed, state.trophies, hallLevel(state, data), data, floor);
}

/**
 * The same generated opponent from just a rank and hall level. The server uses
 * this when no real player fits, so online and offline matchmaking agree.
 */
export function opponentForRank(seed: number, trophies: number, ownHall: number, data: GameData, floor = 0): BaseLayout {
  const st = matchStrength(createRng(mixSeed(seed, 0x5c0a7)), trophies, ownHall, data, false, floor);
  const base = generateOpponent(seed, st.hall, data, { levelBias: st.bias });
  base.trophies = st.trophies;
  return applyLootPenalty(base, ownHall, data);
}

/** The Elder Toadstool levels a player at `ownHall` may be matched against. */
export function hallWindow(ownHall: number, data: GameData): { min: number; max: number } {
  const mm = data.ranks.matchmaking;
  return { min: Math.max(1, ownHall - mm.hallsBelow), max: Math.min(maxHall(data), ownHall + mm.hallsAbove) };
}

export interface BotAttacker {
  hall: number;
  /** 0..1 inside that hall (how close the raider's own base is to the hall's caps). */
  bias: number;
  trophies: number;
  /** One of a village's first raids (`raids.newPlayerRaids`): a smaller, less researched army. */
  softened?: boolean;
  army: Record<string, number>;
  levels: Record<string, number>;
}

/** A full army for a bot at a hall level, made from that hall's mix in raids.json. */
export function botArmy(hall: number, bias: number, data: GameData): Record<string, number> {
  const mixes = data.raids.botArmyMix;
  const mix = mixes[Math.max(1, Math.min(mixes.length, hall)) - 1];
  const housing = Math.floor(maxHousingAtHall(hall, data) * (0.85 + 0.15 * bias));
  const army: Record<string, number> = {};
  let used = 0;
  for (const [troop, share] of Object.entries(mix)) {
    const h = troopDef(data, troop).housing;
    const n = Math.floor((housing * share) / h);
    if (n > 0) {
      army[troop] = n;
      used += n * h;
    }
  }
  // Fill what rounding left over with the cheapest troop of the mix.
  const filler = Object.keys(mix).sort((a, b) => troopDef(data, a).housing - troopDef(data, b).housing)[0];
  if (filler) {
    const h = troopDef(data, filler).housing;
    const extra = Math.floor((housing - used) / h);
    if (extra > 0) army[filler] = (army[filler] ?? 0) + extra;
  }
  return army;
}

/**
 * The bot that raids a village: matched by the defender's trophies, with a full army for its hall.
 * A village's first `raids.newPlayerRaids.count` raids (counted by `stats.defensesFaced`) bring
 * `housingShare` of that army, `levelsBelowCap` research levels lower: a new village that has built
 * its first Kunai Tower usually holds its first defense instead of losing three stars at once.
 */
export function attackerFor(rng: Rng, state: VillageState, data: GameData): BotAttacker {
  const st = matchStrength(rng, state.trophies, hallLevel(state, data), data, true);
  const cap = troopLevelCapAt(st.hall, data);
  const soft = data.raids.newPlayerRaids;
  const softened = Boolean(soft && (state.stats?.defensesFaced ?? 0) < soft.count);
  const lvl = Math.max(1, cap - (st.bias < 0.5 ? 1 : 0) - (softened ? soft!.levelsBelowCap : 0));
  const full = botArmy(st.hall, st.bias, data);
  const army: Record<string, number> = {};
  if (softened) {
    for (const [t, n] of Object.entries(full)) {
      const m = Math.floor(n * soft!.housingShare);
      if (m > 0) army[t] = m;
    }
  } else Object.assign(army, full);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = Math.max(1, Math.min(lvl, troopLevelCapAt(st.hall, data, t), troopDef(data, t).levels.length));
  return { hall: st.hall, bias: st.bias, trophies: st.trophies, army, levels, ...(softened ? { softened } : {}) };
}
