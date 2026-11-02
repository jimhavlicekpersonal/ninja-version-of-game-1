/**
 * The Shadow Clans world: AI clans, the world map, the player's faction, rank
 * and tournament progress, all inside VillageState.world.
 *
 * `advanceWorld` runs from `advance()` on every command, but it is cheap: it
 * only replays clan steps that fell due (every 12 hours) and rolls the
 * faction's day and war week.
 */
import { mixSeed } from '../rng';
import type { GameData, VillageState, WorldState } from '../types';
import { advanceClans, newClanState } from './clans';
import { emptyFaction, rollFactionDay, settleFactionWars } from './factions';
import { expandStep, initialSettlements } from './territory';

export function createWorld(villageSeed: number, now: number, playerHall: number, data: GameData): WorldState {
  const seed = mixSeed(villageSeed, 0x5ad0c1a5);
  const clans: WorldState['clans'] = {};
  for (const def of data.clans.clans) clans[def.id] = newClanState(def, seed, now, playerHall, data);
  return {
    seed,
    clans,
    settlements: initialSettlements(seed, now, data),
    news: [],
    target: null,
    tributeDay: -1,
    counters: { conquests: 0, rivalConquests: 0, reclaimed: 0 },
    faction: emptyFaction(),
    firstRaidDone: false,
    pvpOptIn: false,
    rank: null,
    rankSeasonsClaimed: [],
    tournament: { id: -1, best: [], claimed: [] },
  };
}

/** Catch the world up to `now`. Mutates. */
export function advanceWorld(state: VillageState, now: number, playerHall: number, data: GameData): void {
  const w = state.world;
  if (!w) return;
  advanceClans(w, now, playerHall, data, (clan, def, at, rng) => expandStep(w, clan, def, at, rng, data));
  settleFactionWars(state, now, data);
  rollFactionDay(state, now, data);
}
