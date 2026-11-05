/**
 * Roadmap step 32: weeks of model players through the rating matchmaker.
 * Each player has a hidden true skill and a Keep; battles go through
 * `pickByRating` (the server's own rule) and their outcome follows the true
 * skills. The ratings must find the true order, settle, and keep the
 * expected scores of the pairings near the target.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { expectedScore, newRating, pickByRating, rateBattle, type Rating } from '../../../src/gameplay/sim/rating';
import { createRng, next } from '../../../src/gameplay/sim/rng';

const def = data.ranks.rating;

/** Spearman rank correlation. */
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const order = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    order.forEach(([, i], k) => (r[i] = k));
    return r as number[];
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

describe('rating convergence (model players, simulated weeks)', () => {
  it('finds the true skill order, settles, and pairs players near the target score', () => {
    const rng = createRng(42);
    const N = 120;
    const players = Array.from({ length: N }, (_, i) => ({
      id: i,
      keep: 3 + Math.floor(next(rng) * 4),
      skill: 1200 + next(rng) * 700, // hidden truth, as an attack rating
      defense: 1200 + next(rng) * 700, // hidden truth, as a base rating
      attack: newRating(0, def) as Rating,
      base: newRating(0, def) as Rating,
    }));
    const DAY = 86_400_000;
    const expectations: number[] = [];
    for (let day = 0; day < 28; day++) {
      for (const p of players) {
        for (let k = 0; k < 4; k++) {
          const now = day * DAY + k * 3_600_000;
          // The Keep window first (±1), then a random sample of 20, then the rating pick.
          const pool = players.filter((q) => q !== p && Math.abs(q.keep - p.keep) <= 1);
          const sample = Array.from({ length: Math.min(20, pool.length) }, () => pool[Math.floor(next(rng) * pool.length)]);
          const target = pickByRating(p.attack, p.keep, sample.map((q) => ({ item: q, base: q.base, power: q.keep })), now, def, () => next(rng))!;
          if (day >= 21) expectations.push(expectedScore(p.attack.rating, target.base.rating, p.keep, target.keep, def));
          // The outcome follows the hidden truth (plus luck): a score around the true expectation.
          const truth = expectedScore(p.skill, target.defense, p.keep, target.keep, def);
          const score = Math.max(0, Math.min(1, truth + (next(rng) - 0.5) * 0.3));
          const stars = Math.round(score * 3);
          const r = rateBattle(p.attack, target.base, p.keep, target.keep, stars, Math.round(score * 100), now, def);
          p.attack = r.attack;
          target.base = r.base;
        }
      }
    }
    expect(spearman(players.map((p) => p.attack.rating), players.map((p) => p.skill))).toBeGreaterThan(0.85);
    expect(spearman(players.map((p) => p.base.rating), players.map((p) => p.defense))).toBeGreaterThan(0.85);
    expect(Math.max(...players.map((p) => p.attack.rd))).toBeLessThan(def.initialRd / 2);
    const meanE = expectations.reduce((s, e) => s + e, 0) / expectations.length;
    expect(Math.abs(meanE - def.matchTarget)).toBeLessThan(0.08);
  });
});
