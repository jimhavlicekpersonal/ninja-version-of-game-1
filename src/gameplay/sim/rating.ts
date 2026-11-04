/**
 * Hidden matchmaking ratings (roadmap Phase 3, design in
 * docs/backend/PVP_ROADMAP.md section 1). Glicko-style, attacker against base:
 *
 *   E  = 1 / (1 + 10^((BR − AR − β·(P_att − P_def)) / 400))
 *   S  = starWeight·(stars/3) + destructionWeight·destruction
 *   AR += K_a·(S − E)        BR −= K_b·(S − E)
 *
 * P is power in Keep levels; β (`powerWeight`) turns it into rating points.
 * K follows the rating deviation (RD): new or long-idle ratings move fast,
 * settled ones slowly. Honor stays the visible ladder; these numbers only
 * steer matchmaking and the Power Ranking. Pure and deterministic.
 */
import type { BaseLayout } from './battle/types';
import type { RatingDef } from './types';

export interface Rating {
  rating: number;
  /** Rating deviation: how unsure the rating still is. */
  rd: number;
  battles: number;
  /** Last rated battle (epoch ms). */
  at: number;
}

export function newRating(at: number, def: RatingDef): Rating {
  return { rating: def.initial, rd: def.initialRd, battles: 0, at };
}

/** Uncertainty grows while a rating is not used (up to the starting deviation). */
export function decayed(r: Rating, now: number, def: RatingDef): Rating {
  const days = Math.max(0, (now - r.at) / 86_400_000);
  return { ...r, rd: Math.min(def.initialRd, r.rd + def.rdGrowthPerIdleDay * days) };
}

/** K from the deviation: kNew at the starting deviation, kSettled at the floor. */
export function kFor(r: Rating, def: RatingDef): number {
  const t = Math.max(0, Math.min(1, (r.rd - def.minRd) / (def.initialRd - def.minRd)));
  return def.kSettled + (def.kNew - def.kSettled) * t;
}

/** Expected score of an attacker against a base, with the power difference in Keep levels. */
export function expectedScore(attack: number, base: number, powerAtt: number, powerDef: number, def: RatingDef): number {
  return 1 / (1 + 10 ** ((base - attack - def.powerWeight * (powerAtt - powerDef)) / 400));
}

/** A battle's score 0..1; destruction is in percent (as in BattleResult). */
export function battleScore(stars: number, destructionPercent: number, def: RatingDef): number {
  const s = def.starWeight * (Math.max(0, Math.min(3, stars)) / 3) + def.destructionWeight * (Math.max(0, Math.min(100, destructionPercent)) / 100);
  return Math.max(0, Math.min(1, s));
}

/** Rate one battle. Both ratings are decayed to `now` first; each settles a little. */
export function rateBattle(attack: Rating, base: Rating, powerAtt: number, powerDef: number, stars: number, destructionPercent: number, now: number, def: RatingDef): { attack: Rating; base: Rating; expected: number; score: number } {
  const a = decayed(attack, now, def);
  const b = decayed(base, now, def);
  const expected = expectedScore(a.rating, b.rating, powerAtt, powerDef, def);
  const score = battleScore(stars, destructionPercent, def);
  const settle = (r: Rating, delta: number): Rating => ({ rating: r.rating + delta, rd: Math.max(def.minRd, r.rd * def.rdShrinkPerBattle), battles: r.battles + 1, at: now });
  return { attack: settle(a, kFor(a, def) * (score - expected)), base: settle(b, -kFor(b, def) * (score - expected)), expected, score };
}

/**
 * Gang Rating (roadmap step 66): a whole Gang War between two Gangs, scored 1
 * (win), 0.5 (draw) or 0 for side `a`. Same deviation and K rules as battles,
 * no power term (Gangs are matched on size, rating and power separately).
 */
export function rateMatch(a: Rating, b: Rating, scoreA: number, now: number, def: RatingDef): { a: Rating; b: Rating; expected: number } {
  const x = decayed(a, now, def);
  const y = decayed(b, now, def);
  const expected = expectedScore(x.rating, y.rating, 0, 0, def);
  const settle = (r: Rating, delta: number): Rating => ({ rating: r.rating + delta, rd: Math.max(def.minRd, r.rd * def.rdShrinkPerBattle), battles: r.battles + 1, at: now });
  return { a: settle(x, kFor(x, def) * (scoreA - expected)), b: settle(y, -kFor(y, def) * (scoreA - expected)), expected };
}

/** How far a pairing is from the score matchmaking aims for (0 = perfect). */
export function matchDistance(expected: number, def: RatingDef): number {
  return Math.abs(expected - def.matchTarget);
}

/** The Power Ranking: skill (AR) plus power (Keep), so both a strong player and a strong village rank high. */
export function powerRating(attack: Rating, keep: number, def: RatingDef): number {
  return attack.rating + def.powerWeight * (Math.max(1, keep) - 1);
}

/** Share of a layout that changed: buildings moved, added or removed (by id). */
export function layoutChangedShare(before: BaseLayout | null, after: BaseLayout): number {
  if (!before) return 1;
  const old = new Map(before.buildings.map((b) => [b.id, b]));
  const ids = new Set([...before.buildings.map((b) => b.id), ...after.buildings.map((b) => b.id)]);
  let changed = 0;
  for (const b of after.buildings) {
    const o = old.get(b.id);
    if (!o || o.x !== b.x || o.y !== b.y) changed++;
  }
  for (const b of before.buildings) if (!after.buildings.some((x) => x.id === b.id)) changed++;
  return ids.size ? changed / ids.size : 0;
}

/**
 * Matchmaking's last step (roadmap step 29): among candidates that already
 * passed the Keep window and power floor, the one whose expected score is
 * closest to `matchTarget`. Equally good ones are told apart by `random`.
 */
export function pickByRating<T>(attack: Rating, powerAtt: number, candidates: { item: T; base: Rating; power: number }[], now: number, def: RatingDef, random: () => number): T | null {
  if (!candidates.length) return null;
  const start = Math.floor(random() * candidates.length);
  return orderByRating(attack, powerAtt, [...candidates.slice(start), ...candidates.slice(0, start)], now, def)[0];
}

/**
 * Candidates from the best pairing to the worst (expected score nearest the
 * target first). Equal ones keep the order given, so the caller decides how
 * ties go (the server rotates the list by a random start first).
 */
export function orderByRating<T>(attack: Rating, powerAtt: number, candidates: { item: T; base: Rating; power: number }[], now: number, def: RatingDef): T[] {
  const a = decayed(attack, now, def);
  return candidates
    .map((c, i) => ({ c, i, d: Math.round(matchDistance(expectedScore(a.rating, decayed(c.base, now, def).rating, powerAtt, c.power, def), def) * 1000) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .map((s) => s.c.item);
}
