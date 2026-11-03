/**
 * AI clan treasuries: the Coins and Provisions a clan keeps between battles.
 *
 * A full treasury holds `fullRaids` times the average raid loot of the
 * clan's Keep. It refills a little every clan step. The clan's own villages
 * (the rival-clan card and its world map settlements) carry more loot when the
 * treasury is full and less when it was just raided, and whatever the player
 * takes comes out of it. The trophy-matched rival is not affected, so the
 * balance model's pacing does not depend on clan state.
 */
import type { ClanState, Cost, GameData, ResourceKind } from '../types';
import { hallAndBias } from './villagegen';

/** A full treasury for a clan at this strength (per resource). */
export function fullTreasury(strength: number, data: GameData): number {
  const { hall } = hallAndBias(strength, data);
  const range = data.battle.generatedLootByHall[hall - 1];
  return Math.round(((range.min + range.max) / 2) * data.clans.treasury.fullRaids);
}

export function startTreasury(strength: number, data: GameData): { acorns: number; dew: number } {
  const full = Math.round(fullTreasury(strength, data) * data.clans.treasury.startFull);
  return { acorns: full, dew: full };
}

/** How full the treasury is, 0..1. */
export function treasuryFill(clan: ClanState, data: GameData): number {
  const full = fullTreasury(clan.strength, data);
  return Math.max(0, Math.min(1, (clan.resources.acorns + clan.resources.dew) / Math.max(1, 2 * full)));
}

/** Loot multiplier for the clan's own villages, from how full its treasury is. */
export function treasuryLootFactor(clan: ClanState, data: GameData): number {
  const t = data.clans.treasury;
  return t.minLoot + (t.maxLoot - t.minLoot) * treasuryFill(clan, data);
}

/** One clan step of income, up to a full treasury. Mutates. */
export function refillTreasury(clan: ClanState, data: GameData): void {
  const full = fullTreasury(clan.strength, data);
  const add = Math.round(full * data.clans.treasury.incomePerStep);
  clan.resources.acorns = Math.min(full, clan.resources.acorns + add);
  clan.resources.dew = Math.min(full, clan.resources.dew + add);
}

/** The player took this loot from one of the clan's villages. Mutates. */
export function payFromTreasury(clan: ClanState, loot: Cost): void {
  for (const k of ['acorns', 'dew'] as ResourceKind[]) {
    const v = loot[k] ?? 0;
    if (v > 0) clan.resources[k as 'acorns' | 'dew'] = Math.max(0, clan.resources[k as 'acorns' | 'dew'] - v);
  }
}
