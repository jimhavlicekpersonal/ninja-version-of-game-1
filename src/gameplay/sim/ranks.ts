/** Leaf ranks: trophies, leagues and monthly seasons. */
import { scaleReward } from './economy';
import type { Cost, GameData, LeagueDef, VillageState } from './types';

export function leagueFor(trophies: number, data: GameData): LeagueDef {
  const ls = data.ranks.leagues;
  let best = ls[0];
  for (const l of ls) if (trophies >= l.min) best = l;
  return best;
}

export function nextLeague(trophies: number, data: GameData): LeagueDef | null {
  return data.ranks.leagues.find((l) => l.min > trophies) ?? null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Trophies the attacker gains for a win (and the defender loses). */
export function winTrophies(attacker: number, defender: number, data: GameData): number {
  const w = data.ranks.attackWin;
  return clamp(Math.round(w.base + (defender - attacker) * w.perTrophyDiff), w.min, w.max);
}

/** Trophies the attacker loses for a 0-star attack (and the defender gains). */
/**
 * Honor an attacker loses for a 0-star attack. `destruction` (design re-audit): a close loss
 * (`attackLoss.closeLoss.destruction`% or more) costs `closeLoss.factor` of it, so a player who
 * keeps nearly winning is not ground down. Left out, the full loss (what the battle screen
 * shows before the attack).
 */
export function lossTrophies(attacker: number, defender: number, data: GameData, destruction?: number): number {
  const l = data.ranks.attackLoss;
  const full = clamp(Math.round(l.base - (defender - attacker) * l.perTrophyDiff), l.min, l.max);
  const close = l.closeLoss;
  if (!close || destruction === undefined || destruction < close.destruction) return full;
  return Math.max(l.min, Math.round(full * close.factor));
}

/** Monthly season id from a timestamp (UTC). */
export function seasonOf(t: number): number {
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function seasonEndsAt(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export interface SeasonReward {
  season: number;
  league: string;
  chest: Cost;
  trophiesBefore: number;
  trophiesAfter: number;
  /** Chest contents that did not fit in storage. */
  overflow?: Cost;
}

/** A league's monthly chest for a player at this Elder Toadstool level. */
export function leagueChest(league: LeagueDef, hallLevel: number, data: GameData): Cost {
  return scaleReward(league.chest, hallLevel, data);
}

/**
 * Close any seasons that ended before `now`: give the league chest (fixed
 * contents, nothing random, sized to the player's hall level) and soften
 * trophies above the reset floor. Mutates.
 */
export function rollSeasons(state: VillageState, now: number, data: GameData): SeasonReward[] {
  const out: SeasonReward[] = [];
  const current = seasonOf(now);
  const hall = Math.max(1, state.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
  while (state.season < current) {
    const league = leagueFor(state.trophies, data);
    const before = state.trophies;
    const floor = data.ranks.seasonResetFloor;
    if (state.trophies > floor) state.trophies = floor + Math.floor((state.trophies - floor) / 2);
    out.push({ season: state.season, league: league.id, chest: leagueChest(league, hall, data), trophiesBefore: before, trophiesAfter: state.trophies });
    state.season++;
  }
  return out;
}
