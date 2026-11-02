/** Leaf ranks: trophies, leagues and monthly seasons. */
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
export function lossTrophies(attacker: number, defender: number, data: GameData): number {
  const l = data.ranks.attackLoss;
  return clamp(Math.round(l.base - (defender - attacker) * l.perTrophyDiff), l.min, l.max);
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
}

/**
 * Close any seasons that ended before `now`: give the league chest (fixed
 * contents, nothing random) and soften trophies above the reset floor. Mutates.
 */
export function rollSeasons(state: VillageState, now: number, data: GameData): SeasonReward[] {
  const out: SeasonReward[] = [];
  const current = seasonOf(now);
  while (state.season < current) {
    const league = leagueFor(state.trophies, data);
    const before = state.trophies;
    const floor = data.ranks.seasonResetFloor;
    if (state.trophies > floor) state.trophies = floor + Math.floor((state.trophies - floor) / 2);
    out.push({ season: state.season, league: league.id, chest: { ...league.chest }, trophiesBefore: before, trophiesAfter: state.trophies });
    state.season++;
  }
  return out;
}

/** Trophies for a generated opponent, near the player's own rank (from the opponent seed). */
export function matchTrophies(seed: number, myTrophies: number, data: GameData): number {
  let h = (seed ^ 0x7f4a7c15) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  const r = data.ranks.matchTrophyRange;
  return Math.max(0, myTrophies + ((h % (2 * r + 1)) - r));
}
