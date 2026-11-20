/**
 * P5-03 (RET-11): the daily contract. One a UTC day, the same for everyone, a pure function of the day from data; it
 * changes only what a won raid carries home, never the battle; and with every multiplier at its best a raid carries at
 * most `raids.carryCap` (2.2) times its plain loot.
 */
import { describe, expect, it } from 'vitest';
import { cappedCarry, contractEndsAt, contractFor, contractMultiplier, diversityShare, raidCarry } from '../../../src/gameplay/sim/carry';
import { eventsBetween } from '../../../src/gameplay/sim/events';
import type { ContractDef } from '../../../src/gameplay/sim/types';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const DAY = 86_400_000;
const T0 = Date.UTC(2027, 0, 10, 13);

describe('the daily contract (P5-03)', () => {
  const list = data.raids.contracts!.list;

  it('is one a UTC day, the same for everyone, and cycles through the list', () => {
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(contractFor(T0, data)).toEqual(contractFor(Math.floor(T0 / DAY) * DAY, data));
    expect(contractFor(contractEndsAt(T0) - 1, data)).toEqual(contractFor(T0, data));
    const seen = new Set<string>();
    for (let d = 0; d < list.length; d++) seen.add(contractFor(T0 + d * DAY, data)!.id);
    expect(seen.size).toBe(list.length);
    expect(contractFor(T0 + list.length * DAY, data)).toEqual(contractFor(T0, data));
  });

  const won3 = { used: { beetle_brute: 20, hedgehog_roller: 40, owl_bomber: 10 }, stars: 3 };
  const base = (rival?: string) => ({ hero: undefined, base: { rival } });
  const byKind = (k: ContractDef['kind']) => list.find((c) => c.kind === k)!;

  it('pays only when met, and never on a lost raid', () => {
    const rival = byKind('rival');
    expect(contractMultiplier(rival, won3, base(rival.clan), undefined, data)).toBeCloseTo(1 + rival.bonus!, 9);
    expect(contractMultiplier(rival, won3, base('someone_else'), undefined, data)).toBe(1);
    expect(contractMultiplier(rival, { ...won3, stars: 0 }, base(rival.clan), undefined, data)).toBe(1);
    const stakes = byKind('stakes');
    expect(contractMultiplier(stakes, won3, base(), 2, data)).toBeCloseTo(1 + stakes.bonus!, 9);
    expect(contractMultiplier(stakes, { ...won3, stars: 1 }, base(), 2, data)).toBe(1);
    expect(contractMultiplier(stakes, won3, base(), undefined, data)).toBe(1);
    const sweep = byKind('threeStar');
    expect(contractMultiplier(sweep, won3, base(), undefined, data)).toBeCloseTo(1 + sweep.bonus!, 9);
    expect(contractMultiplier(sweep, { ...won3, stars: 2 }, base(), undefined, data)).toBe(1);
    const mix = byKind('diversity');
    expect(contractMultiplier(mix, won3, base(), undefined, data)).toBeGreaterThanOrEqual(1);
    // A one-role army gains nothing from "diversity counts double".
    expect(contractMultiplier(mix, { used: { beetle_brute: 30 }, stars: 2 }, base(), undefined, data)).toBe(1);
  });

  it('is part of the carry only when given: raidCarry without it is unchanged', () => {
    const rival = byKind('rival');
    const plain = raidCarry(won3, base(rival.clan), undefined, data);
    expect(raidCarry(won3, base(rival.clan), undefined, data, Infinity, rival)).toBeCloseTo(plain * (1 + rival.bonus!), 9);
  });

  it('with the contract, an event bonus, a stake and the diversity carry all at their best, a raid carries at most 2.2x its plain loot', () => {
    const cap = data.raids.carryCap!;
    expect(cap).toBe(2.2);
    const bestStake = Math.max(...Object.values(data.raids.stakes!.byStars));
    const bestDiversity = diversityShare(1, data);
    const bestContract = Math.max(...list.map((c) => (c.kind === 'diversity' ? 1 / diversityShare(0, data) : 1 + (c.bonus ?? 0))));
    // The largest raid loot bonus of any hour in two years, overlapping events summed (as eventEffect does).
    const windows = eventsBetween(T0, T0 + 730 * DAY, data);
    let bestEvent = 0;
    for (const w of windows) {
      const at = w.start;
      bestEvent = Math.max(bestEvent, windows.filter((x) => x.start <= at && x.end > at).reduce((a, x) => a + (x.effect.raidLootBonus ?? 0), 0));
    }
    const { carry, eventBonus } = cappedCarry(bestStake * bestDiversity * bestContract, bestEvent, data);
    expect(carry * (1 + eventBonus)).toBeLessThanOrEqual(cap + 1e-9);
    // And an ordinary day (no contract, no stake) is never cut by the cap.
    const plain = cappedCarry(bestDiversity, bestEvent, data);
    expect(plain.eventBonus).toBeCloseTo(bestEvent, 9);
  });
});

describe('online raids settle with the server\'s contract time only (review M1)', () => {
  it('settleOnlineAttack uses contractAt; without it, no contract', () => {
    const rival = data.raids.contracts!.list.find((c) => c.kind === 'rival')!;
    let day = T0;
    while (contractFor(day, data)!.id !== rival.id) day += DAY;
    const { state } = newGame();
    const result = { stars: 2, destruction: 70, loot: { acorns: 10000, dew: 10000 }, used: { beetle_brute: 20 }, hash: 'h', hallDestroyed: false, ticks: 900, endReason: 'time' } as unknown as import('../../../src/gameplay/sim/battle/types').BattleResult;
    const pending = { id: 'r1', kind: 'attack', at: day + DAY + 5, opponentName: 'x', setup: { seed: 1, base: { name: 'b', hallLevel: 5, buildings: [], rival: rival.clan }, army: {}, levels: {} }, deployments: [], result, trophies: 0, banked: {}, ticket: 't1', settlement: 'pending' };
    const settle = (contractAt?: number) => applyCommand({ ...state, battleLog: [structuredClone(pending)] } as never, { type: 'settleOnlineAttack', ticket: 't1', result, trophies: 5, ...(contractAt !== undefined ? { contractAt } : {}) }, day + 2 * DAY, data);
    const withIt = settle(day + 60_000);
    const without = settle();
    expect(withIt.ok && without.ok).toBe(true);
    if (!withIt.ok || !without.ok) return;
    expect(withIt.state.battleLog.at(-1)!.contract).toBe(rival.id);
    expect(without.state.battleLog.at(-1)!.contract).toBeUndefined();
  });
});
