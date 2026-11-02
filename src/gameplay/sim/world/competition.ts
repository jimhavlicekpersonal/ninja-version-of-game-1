/**
 * Competition rules shared by the client and the server:
 * - Keep titles and PvP onboarding (Keep 1-2 AI only, 3 optional, 4+ standard).
 * - The AI-to-human population transition: how many opponents are real
 *   players, from the eligible villages in a band and defender capacity.
 * - Defender eligibility.
 * - Shadow Rank: Elo on expected performance, from real-player battles only.
 * - Clan war formats by size, progression catch-up, faction leadership.
 */
import type { GameData } from '../types';

const DAY = 86_400_000;

// ---------------------------------------------------------------- Keep titles

export function hallTitle(level: number, data: GameData): { title: string; unlock: string } {
  const t = data.competition.hallTitles.find((x) => x.level === level) ?? data.competition.hallTitles[data.competition.hallTitles.length - 1];
  return { title: t.title, unlock: t.unlock };
}

// ---------------------------------------------------------------- PvP onboarding

export type PvpStatus = 'locked' | 'optional' | 'standard';

/** Where a Keep level stands in PvP onboarding. */
export function pvpStatus(hall: number, data: GameData): PvpStatus {
  const p = data.competition.pvp;
  return hall >= p.standardHall ? 'standard' : hall >= p.minHall ? 'optional' : 'locked';
}

/** Whether this village takes part in real-player battles (attacking them and being attacked). */
export function pvpEnabled(hall: number, optIn: boolean, data: GameData): boolean {
  const s = pvpStatus(hall, data);
  return s === 'standard' || (s === 'optional' && optIn);
}

// ---------------------------------------------------------------- population transition

/** Target human share of opponents for the number of eligible human villages in the band. */
export function humanShareTarget(eligible: number, data: GameData): number {
  let share = 0;
  for (const row of data.competition.population.humanShareByEligible) if (eligible >= row.min) share = row.share;
  return share;
}

/**
 * Defender capacity: f = min(1, D x C / A), where A is the expected attack
 * requests per day in the band, D the eligible defenders and C the most
 * attacks one defender should take per day on average.
 */
export function liquidityShare(attacksPerDay: number, defenders: number, data: GameData): number {
  const c = data.competition.population.maxAttacksPerDefenderPerDay;
  if (attacksPerDay <= 0) return defenders > 0 ? 1 : 0;
  return Math.min(1, (defenders * c) / attacksPerDay);
}

/** Share of opponents that should be real players in a band: the lower of the target and capacity. */
export function humanShare(eligible: number, attacksPerDay: number, data: GameData): number {
  return Math.min(humanShareTarget(eligible, data), liquidityShare(attacksPerDay, eligible, data));
}

/** How many of `slots` candidates are real players, each slot a real player with probability `share` (rolls in [0, 1)). */
export function humanSlots(share: number, available: number, rolls: number[]): number {
  let n = 0;
  for (const r of rolls) if (n < available && r < share) n++;
  return n;
}

export interface DefenderInfo {
  id: string;
  hall: number;
  pvpOptIn: boolean;
  shieldUntil: number;
  /** Real-player attacks this village took in the last 24 hours. */
  attacksLastDay: number;
  groveId: string | null;
  /** Install or account link key, to keep alternate accounts apart (optional). */
  ownerKey?: string | null;
}

export interface AttackerInfo {
  id: string;
  hall: number;
  groveId: string | null;
  /** Defenders this attacker hit within `recentOpponentHours`. */
  recentTargets: string[];
  ownerKey?: string | null;
}

/** Hall window an attacker at `hall` may meet (same as matchmaking: 1 below, 1 above). */
export function bandWindow(hall: number, data: GameData): { min: number; max: number } {
  const mm = data.ranks.matchmaking;
  return { min: Math.max(1, hall - mm.hallsBelow), max: Math.min(data.hall.levels.length, hall + mm.hallsAbove) };
}

/** The five eligibility rules for a real-player defender. */
export function defenderEligibility(def: DefenderInfo, att: AttackerInfo, now: number, data: GameData): { ok: true } | { ok: false; reason: 'self' | 'band' | 'pvp' | 'shield' | 'busy' | 'recent' | 'alliance' } {
  if (def.id === att.id || (def.ownerKey && def.ownerKey === att.ownerKey)) return { ok: false, reason: 'self' };
  const w = bandWindow(att.hall, data);
  if (def.hall < w.min || def.hall > w.max) return { ok: false, reason: 'band' };
  if (!pvpEnabled(def.hall, def.pvpOptIn, data)) return { ok: false, reason: 'pvp' };
  if (def.shieldUntil > now) return { ok: false, reason: 'shield' };
  if (def.attacksLastDay >= data.competition.population.maxAttacksPerDefenderPerDay) return { ok: false, reason: 'busy' };
  if (att.recentTargets.includes(def.id)) return { ok: false, reason: 'recent' };
  if (def.groveId && def.groveId === att.groveId) return { ok: false, reason: 'alliance' };
  return { ok: true };
}

// ---------------------------------------------------------------- Shadow Rank

export interface Rated {
  rating: number;
  games: number;
}

/** Elo expected score of A against B. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** How well an attack went, 0..1: stars matter most, destruction breaks ties. */
export function battleScore(stars: number, destruction: number, data: GameData): number {
  const w = data.competition.shadowRank.starWeight;
  const d = Math.max(0, Math.min(100, destruction)) / 100;
  return stars <= 0 ? (1 - w) * d : (w * Math.min(3, stars)) / 3 + (1 - w) * d;
}

function kFor(p: Rated, data: GameData): number {
  const r = data.competition.shadowRank;
  return p.games < r.newGames ? r.kNew : r.k;
}

/**
 * Rate a real-player attack: the attacker's Shadow Rank against the
 * defender's defense rating. Beating a stronger defense earns more than
 * beating a weaker one. Only call this for battles between real players.
 */
export function rateBattle(attacker: Rated, defender: Rated, stars: number, destruction: number, data: GameData): { attacker: number; defender: number } {
  const e = expectedScore(attacker.rating, defender.rating);
  const s = battleScore(stars, destruction, data);
  const floor = data.competition.shadowRank.floor;
  const a = Math.round(kFor(attacker, data) * (s - e));
  const d = -Math.round(kFor(defender, data) * (s - e));
  return { attacker: Math.max(floor, attacker.rating + a) - attacker.rating, defender: Math.max(floor, defender.rating + d) - defender.rating };
}

export function shadowSeason(now: number, data: GameData): number {
  const r = data.competition.shadowRank;
  return Math.floor((now - r.epoch) / (r.seasonDays * DAY));
}

export function shadowSeasonEndsAt(season: number, data: GameData): number {
  const r = data.competition.shadowRank;
  return r.epoch + (season + 1) * r.seasonDays * DAY;
}

/** Ratings are pulled part of the way back to the start each season; progression is untouched. */
export function seasonReset(rating: number, data: GameData): number {
  const r = data.competition.shadowRank;
  return Math.round(r.start + (rating - r.start) * r.resetKeep);
}

export function shadowTier(rating: number, data: GameData): { index: number; name: string; reward: import('../types').Cost } {
  const tiers = data.competition.shadowRank.tiers;
  let i = 0;
  for (let k = 0; k < tiers.length; k++) if (rating >= tiers[k].min) i = k;
  return { index: i, name: tiers[i].name, reward: tiers[i].reward };
}

// ---------------------------------------------------------------- clan warfare

/** War format for a human clan of `members`, with a flexible war size. */
export function warFormat(members: number, data: GameData): { id: string; name: string; warSize: number } {
  const fs = data.competition.warfare.formats;
  let f = fs[0];
  for (const x of fs) if (members >= x.minMembers) f = x;
  return { id: f.id, name: f.name, warSize: Math.max(1, Math.min(members, f.maxWarSize)) };
}

// ---------------------------------------------------------------- catch-up

/** Keep level an upgrade belongs to: the Keep's own level, or the first Keep that allows that building level. */
export function upgradeHallTier(type: string, toLevel: number, data: GameData): number {
  if (data.buildings[type]?.category === 'hall') return toLevel;
  const i = data.hall.levels.findIndex((l) => (l.limits[type]?.maxLevel ?? 0) >= toLevel);
  return i < 0 ? data.hall.levels.length : i + 1;
}

/**
 * Time and cost factor for an upgrade. When Keep levels are added above
 * `launchTopHall`, everything that belongs to a Keep at least
 * `levelsBehindTop` below the new top gets cheaper and faster, so the gap a
 * newcomer must close does not keep growing. 1 = no change (today).
 */
export function catchUpFactor(hallTier: number, data: GameData): number {
  const c = data.competition.catchUp;
  const top = data.hall.levels.length;
  const added = top - c.launchTopHall;
  if (added <= 0 || hallTier > top - c.levelsBehindTop) return 1;
  return Math.max(1 - c.maxDiscount, 1 - c.discountPerNewLevel * added);
}

// ---------------------------------------------------------------- faction leadership

export interface FactionMember {
  id: string;
  name: string;
  lastActiveAt: number;
  /** Contribution points earned in the last contributionDays days. */
  contribution: number;
  /** Consecutive seasons led up to the last one. */
  termsLed: number;
}

/**
 * Who leads an AI faction's human members: the top contributor among members
 * active in the last `activeDays`, skipping anyone who has led `maxTerms`
 * seasons in a row. With fewer than `minHumans` active humans the AI leads.
 */
export function factionLeader(members: FactionMember[], now: number, data: GameData): FactionMember | null {
  const l = data.competition.factionLeadership;
  const active = members.filter((m) => now - m.lastActiveAt <= l.activeDays * DAY);
  if (active.length < l.minHumans) return null;
  const eligible = active.filter((m) => m.termsLed < l.maxTerms && m.contribution > 0);
  eligible.sort((a, b) => b.contribution - a.contribution || (a.id < b.id ? -1 : 1));
  return eligible[0] ?? null;
}
