/** Hidden matchmaking ratings (roadmap step 27): the math, K schedule, decay and layout changes. */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { battleScore, decayed, expectedScore, kFor, layoutChangedShare, newRating, pickByRating, powerRating, rateBattle } from '../../../src/gameplay/sim/rating';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';

const def = data.ranks.rating;
const DAY = 86_400_000;

describe('ratings', () => {
  it('expects 50% between equals, and a Keep of power is worth powerWeight points', () => {
    expect(expectedScore(1500, 1500, 5, 5, def)).toBeCloseTo(0.5);
    expect(expectedScore(1500, 1500, 6, 5, def)).toBeCloseTo(expectedScore(1500 + def.powerWeight, 1500, 5, 5, def));
    expect(expectedScore(1900, 1500, 5, 5, def)).toBeCloseTo(10 / 11);
  });

  it('scores stars and destruction, partial success counting', () => {
    expect(battleScore(3, 100, def)).toBe(1);
    expect(battleScore(0, 0, def)).toBe(0);
    expect(battleScore(1, 50, def)).toBeCloseTo(def.starWeight / 3 + def.destructionWeight / 2);
  });

  it('moves attacker and base in opposite directions, fast while new and slower once settled', () => {
    const a = newRating(0, def);
    const b = newRating(0, def);
    const r = rateBattle(a, b, 5, 5, 3, 100, 0, def);
    expect(r.attack.rating - def.initial).toBeCloseTo(def.kNew * 0.5);
    expect(r.base.rating - def.initial).toBeCloseTo(-def.kNew * 0.5);
    let x = a;
    for (let i = 0; i < 60; i++) x = rateBattle(x, b, 5, 5, 2, 70, 0, def).attack;
    expect(x.battles).toBe(60);
    expect(x.rd).toBe(def.minRd);
    expect(kFor(x, def)).toBeCloseTo(def.kSettled);
  });

  it('grows uncertainty while idle, never past the start', () => {
    const settled = { rating: 1600, rd: def.minRd, battles: 50, at: 0 };
    expect(decayed(settled, 10 * DAY, def).rd).toBeCloseTo(def.minRd + 10 * def.rdGrowthPerIdleDay);
    expect(decayed(settled, 10_000 * DAY, def).rd).toBe(def.initialRd);
  });

  it('picks the opponent closest to the target expected score', () => {
    const me = { rating: 1600, rd: 100, battles: 40, at: 0 };
    const cands = [1300, 1550, 1650, 2100].map((r) => ({ item: r, base: { rating: r, rd: 100, battles: 10, at: 0 }, power: 5 }));
    const pick = pickByRating(me, 5, cands, 0, def, () => 0);
    const best = cands.map((c) => Math.abs(expectedScore(1600, c.base.rating, 5, 5, def) - def.matchTarget));
    expect(pick).toBe(cands[best.indexOf(Math.min(...best))].item);
    expect(pickByRating(me, 5, [], 0, def, () => 0)).toBeNull();
  });

  it('ranks power as skill plus Keep, and measures how much of a layout moved', () => {
    expect(powerRating({ rating: 1500, rd: 60, battles: 9, at: 0 }, 3, def)).toBe(1500 + 2 * def.powerWeight);
    const base = generateOpponent(1, 4, data);
    expect(layoutChangedShare(base, base)).toBe(0);
    const moved = structuredClone(base);
    for (const b of moved.buildings.slice(0, Math.ceil(moved.buildings.length / 2))) b.x += 100;
    expect(layoutChangedShare(base, moved)).toBeGreaterThan(def.layoutResetShare);
    expect(layoutChangedShare(null, base)).toBe(1);
  });
});
