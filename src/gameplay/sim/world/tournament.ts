/**
 * Normalized tournaments: skill over months of upgrades.
 *
 * Every participant fights the same fortresses with the same warrior levels
 * and the same housing budget; only the army they pick and how they fight
 * matter. Battles are practice: no warriors are spent and nothing is lost.
 * Score per fortress = stars x 100 + destruction %, best attempt counts.
 * Reward thresholds pay once per tournament and are never sold.
 */
import { generateOpponent, layoutById, LAYOUTS } from '../battle/basegen';
import { botArmy } from '../matchmaking';
import { armyHousing } from '../army';
import type { BaseLayout } from '../battle/types';
import { mixSeed } from '../rng';
import type { GameData } from '../types';

const DAY = 86_400_000;

export interface TournamentWindow {
  id: number;
  startsAt: number;
  endsAt: number;
  live: boolean;
  /** Start of the next tournament (this one's if it has not started). */
  nextStartsAt: number;
}

export function tournamentAt(now: number, data: GameData): TournamentWindow {
  const t = data.competition.tournament;
  const period = t.periodDays * DAY;
  const id = Math.floor((now - t.epoch) / period);
  const startsAt = t.epoch + id * period;
  const endsAt = startsAt + t.durationDays * DAY;
  const live = now >= startsAt && now < endsAt;
  return { id, startsAt, endsAt, live, nextStartsAt: live ? startsAt + period : now < startsAt ? startsAt : startsAt + period };
}

/** The tournament's fortresses: deterministic from its id. They carry no loot. */
export function tournamentBases(id: number, data: GameData): BaseLayout[] {
  const t = data.competition.tournament;
  const out: BaseLayout[] = [];
  for (let i = 0; i < t.bases; i++) {
    const lid = t.layouts[(id * t.bases + i) % t.layouts.length];
    const layout = layoutById(lid) ?? LAYOUTS[i % LAYOUTS.length];
    const base = generateOpponent(mixSeed(0x70a7, id * 31 + i), t.hall, data, { levelBias: t.levelBias, layout });
    for (const b of base.buildings) delete b.loot;
    base.name = `${t.name} · Fortress ${i + 1}`;
    base.practice = `${t.name} (standard levels for everyone)`;
    base.tournament = { id, index: i };
    base.trophies = 0;
    out.push(base);
  }
  return out;
}

/** Standard warrior levels for everyone in the tournament. */
export function tournamentLevels(data: GameData): Record<string, number> {
  const lvl = data.competition.tournament.troopLevel;
  const out: Record<string, number> = {};
  for (const [t, def] of Object.entries(data.troops)) out[t] = Math.min(lvl, def.levels.length);
  return out;
}

/** Check a drafted army: known warriors, whole numbers, within the housing budget. */
export function draftProblem(army: Record<string, number>, data: GameData): string | null {
  let housing = 0;
  for (const [t, n] of Object.entries(army)) {
    if (!data.troops[t]) return 'Unknown warrior in the draft.';
    if (!Number.isInteger(n) || n < 0) return 'Bad warrior count.';
    housing += data.troops[t].housing * n;
  }
  if (housing <= 0) return 'Pick at least one warrior.';
  if (housing > data.competition.tournament.housing) return `The draft holds at most ${data.competition.tournament.housing} housing.`;
  return null;
}

/** A balanced starting draft: the raider mix for the tournament's Keep, scaled to the housing budget. */
export function suggestedDraft(data: GameData): Record<string, number> {
  const t = data.competition.tournament;
  const mix = botArmy(t.hall, 1, data);
  const scale = t.housing / Math.max(1, armyHousing(mix, data));
  const out: Record<string, number> = {};
  let used = 0;
  for (const [k, n] of Object.entries(mix)) {
    const c = Math.floor(n * scale);
    if (c > 0) {
      out[k] = c;
      used += c * data.troops[k].housing;
    }
  }
  const filler = Object.keys(out).sort((a, b) => data.troops[a].housing - data.troops[b].housing)[0];
  if (filler) out[filler] += Math.floor((t.housing - used) / data.troops[filler].housing);
  return out;
}

/** How many warriors one tap of + or − adds in the draft (about 10 housing). */
export function draftStep(troop: string, data: GameData): number {
  return Math.max(1, Math.floor(data.competition.tournament.draftStepHousing / data.troops[troop].housing));
}

export function tournamentScore(stars: number, destruction: number): number {
  return Math.max(0, Math.min(3, stars)) * 100 + Math.max(0, Math.min(100, Math.round(destruction)));
}

export function totalScore(best: number[]): number {
  return best.reduce((a, b) => a + (b || 0), 0);
}
