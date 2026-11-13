/**
 * Rival clans (state-of-the-game report, section 5 step 8, growth 5 and 12): generated opponents are the
 * outposts of three named computer clans with leaders, instead of anonymous "generated rivals". They stay
 * labelled as computer opponents everywhere (the honesty rule); the name and the leader give the world a face.
 * Pure: the clan follows from the base's seed, so the game and the server name the same base alike.
 */
import type { GameData, RivalClan } from './types';

export function rivalFor(seed: number, data: GameData): RivalClan | null {
  const clans = data.names.rivalClans ?? [];
  return clans.length ? clans[(seed >>> 0) % clans.length] : null;
}

export function rivalById(id: string | undefined, data: GameData): RivalClan | null {
  return (id && data.names.rivalClans?.find((c) => c.id === id)) || null;
}

/** "Crimson Lotus · Misty Gorge": the outpost's name. */
export function rivalOutpostName(clan: RivalClan, seed: number, data: GameData): string {
  const n = data.names;
  return `${clan.name} · ${n.placeFirst[(seed >>> 4) % n.placeFirst.length]} ${n.placeSecond[(seed >>> 12) % n.placeSecond.length]}`;
}
