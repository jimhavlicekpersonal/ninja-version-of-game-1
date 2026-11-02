/**
 * One opponent-selection system for AI and human villages: the rivals board.
 *
 * Pressing Attack shows up to three candidates from the kept scout seed (so
 * leaving and coming back shows the same board; a new board costs the Next
 * fee). Offline every candidate is an AI clan village:
 * - matched: the trophy-matched rival (same strength rules as before; the
 *   balance model fights this one),
 * - rival: a persistent clan at its own current strength (rebuilding clans
 *   are weaker, growing ones stronger),
 * - challenge: an optional, stronger village above the matched strength.
 * Online, real players found by the server's population-transition rules
 * take slots first. Every card says whether it is AI or a real player.
 */
import { battleArmy } from '../village';
import type { BaseLayout } from '../battle/types';
import { applyLootPenalty, matchStrength, opponentForRank } from '../matchmaking';
import { troopLevels } from '../research';
import { createRng, mixSeed } from '../rng';
import type { GameData, VillageState } from '../types';
import { hallLevel } from '../village';
import { nearestClan } from './clans';
import { defensePower, matchupFromDefense, matchupLabel, offensePower } from './power';
import { clanDef, clanVillage, expectedDefense, firstRaidBase, hallAndBias } from './villagegen';

export type CandidateKind = 'first' | 'matched' | 'rival' | 'challenge' | 'player';

export interface RivalCandidate {
  kind: CandidateKind;
  source: 'ai' | 'human';
  clan: string | null;
  /** Strength in Keep units (AI) or the village's Keep level - 0.5 (human). */
  strength: number;
  base: BaseLayout;
  /** Always says AI clan or real player. */
  label: string;
  defense: number;
  /** Candidate token for real players (the server checks it again on match). */
  token?: string;
  /** Seed the AI village was built from: a server rebuilds it from clan + seed + strength. */
  villageSeed?: number;
}

function trophiesFor(strength: number, data: GameData): number {
  return Math.round(Math.max(0, strength) * data.ranks.matchmaking.trophiesPerHall);
}

/** The AI candidates behind a scout seed for this player. */
export function aiCandidates(seed: number, state: VillageState, data: GameData): RivalCandidate[] {
  if (!state.world.firstRaidDone) {
    const base = firstRaidBase(data);
    return [{ kind: 'first', source: 'ai', clan: base.clan ?? null, strength: 0, base, label: `${clanDef(data, base.clan!).name} · AI training outpost`, defense: defensePower(base, data) }];
  }
  const own = hallLevel(state, data);
  const top = data.hall.levels.length;
  const c = data.clans.candidates;
  const out: RivalCandidate[] = [];
  // 1. The trophy-matched rival.
  const matched = opponentForRank(seed, state.trophies, own, data);
  const ms = matchStrength(createRng(mixSeed(seed, 0x5c0a7)), state.trophies, own, data);
  const mStrength = ms.hall - 1 + ms.bias;
  out.push({ kind: 'matched', source: 'ai', clan: matched.clan ?? null, strength: mStrength, villageSeed: seed, base: matched, label: `${clanDef(data, matched.clan!).name} · AI clan village`, defense: defensePower(matched, data) });
  // 2. A persistent clan at its own strength, inside the progression band.
  const b = data.clans.bands;
  const lo = Math.max(0, own - 1 - b.below);
  const hi = Math.min(top, own + b.above) - 1e-6;
  const rivalId = nearestClan(state.world, own - 1 + 0.5, data, matched.clan ? [matched.clan] : []);
  if (rivalId) {
    const clan = state.world.clans[rivalId];
    const s = Math.max(lo, Math.min(hi, clan.strength));
    const base = applyLootPenalty(clanVillage(rivalId, mixSeed(seed, 0x2), s, data), own, data);
    base.trophies = trophiesFor(s, data);
    const status = clan.status === 'rebuilding' ? ' (rebuilding)' : clan.status === 'expanding' ? ' (expanding)' : '';
    out.push({ kind: 'rival', source: 'ai', clan: rivalId, strength: s, villageSeed: mixSeed(seed, 0x2), base, label: `${clanDef(data, rivalId).name}${status} · AI clan village`, defense: defensePower(base, data) });
  }
  // 3. An optional challenge above the matched strength.
  const cs = Math.max(own - 0.5, Math.min(Math.min(top, own + b.challengeAbove) - 1e-6, mStrength + c.challengeStrengthAbove));
  if (cs > mStrength + 1e-3) {
    const used = out.map((x) => x.clan!).filter(Boolean);
    const fits = data.clans.clans.filter((d) => cs >= d.halls[0] - 1 && cs < d.halls[1] && !used.includes(d.id));
    const id = fits.sort((a, x) => (state.world.clans[x.id]?.strength ?? 0) - (state.world.clans[a.id]?.strength ?? 0))[0]?.id ?? nearestClan(state.world, cs, data, used);
    if (id) {
      const base = applyLootPenalty(clanVillage(id, mixSeed(seed, 0x3), cs, data), own, data);
      base.trophies = trophiesFor(cs, data);
      out.push({ kind: 'challenge', source: 'ai', clan: id, strength: cs, villageSeed: mixSeed(seed, 0x3), base, label: `${clanDef(data, id).name} · AI challenge (optional)`, defense: defensePower(base, data) });
    }
  }
  return out.slice(0, c.count);
}

/** Real players take slots first; AI villages fill the rest. */
export function mergeCandidates(ai: RivalCandidate[], humans: RivalCandidate[], data: GameData): RivalCandidate[] {
  return [...humans, ...ai].slice(0, data.clans.candidates.count);
}

/** Offensive power of the army the player would bring now (own warriors plus reinforcements). */
export function playerOffense(state: VillageState, data: GameData): number {
  return offensePower(battleArmy(state), troopLevels(state, data), data);
}

/** Matchup label for the player's current army against a candidate. */
export function candidateMatchup(state: VillageState, base: BaseLayout, data: GameData): ReturnType<typeof matchupLabel> {
  return matchupLabel(playerOffense(state, data), base, data);
}

/** Matchup label for an AI clan at a strength, from its designed defense (cheap: builds no village). */
export function strengthMatchup(state: VillageState, clanId: string, strength: number, data: GameData): ReturnType<typeof matchupLabel> {
  const def = clanDef(data, clanId);
  const { hall, bias } = hallAndBias(strength, data, def.levelBias);
  return matchupFromDefense(playerOffense(state, data), expectedDefense(hall, bias, def, data), hall, data);
}
