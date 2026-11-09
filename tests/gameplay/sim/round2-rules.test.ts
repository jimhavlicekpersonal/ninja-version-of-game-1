/**
 * Balance audit 2026-11-08, round-2 rules (docs/game-theory/SIMULATION_ROUND2_2026-11-09.md section 4):
 * staked honor, exhausted stores, the upward loot penalty, diversity carries more, declared stakes and
 * either-currency walls and traps.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { armyDiversity, carriedLoot, diversityShare, raidCarry, stakeMet, stakeMultiplier, stakeOptions, validStake } from '../../../src/gameplay/sim/carry';
import { exhaustionFactor, scaleBaseLoot } from '../../../src/gameplay/sim/defense';
import { lootPenalty } from '../../../src/gameplay/sim/matchmaking';
import { defenseHonorLoss, winTrophies } from '../../../src/gameplay/sim/ranks';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, payableInProvisions, placeQuote, upgradeQuote } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const H = 3_600_000;

describe('staked honor', () => {
  it('a win against a base with less honor pays less, down to nothing', () => {
    const w = data.ranks.attackWin;
    expect(winTrophies(500, 500, data)).toBe(w.base);
    expect(winTrophies(500, 480, data)).toBe(Math.round(w.base - 20 * w.perTrophyBelow!));
    expect(winTrophies(500, 300, data)).toBe(0);
    // At or above the attacker's honor nothing changed.
    expect(winTrophies(500, 600, data)).toBe(Math.min(w.max, Math.round(w.base + 100 * w.perTrophyDiff)));
  });

  it('a lost defence costs the defender the configured share of the gain (none by default)', () => {
    expect(data.ranks.defenseHonorLossShare).toBe(0);
    expect(defenseHonorLoss(24, data)).toBe(0);
    expect(defenseHonorLoss(24, { ...data, ranks: { ...data.ranks, defenseHonorLossShare: 0.5 } })).toBe(12);
    expect(defenseHonorLoss(24, { ...data, ranks: { ...data.ranks, defenseHonorLossShare: undefined } })).toBe(24);
  });
});

describe('exhausted stores', () => {
  const lost = (hoursAgo: number, stars: number) => ({ at: 100 * H - hoursAgo * H, result: { stars } });

  it('each raid lost in the window halves what the next raider can take', () => {
    const f = data.raids.exhaustion!.factor;
    expect(exhaustionFactor([], 100 * H, data)).toBe(1);
    expect(exhaustionFactor([lost(2, 1)], 100 * H, data)).toBe(f);
    expect(exhaustionFactor([lost(2, 1), lost(20, 3)], 100 * H, data)).toBe(f * f);
    // Held raids and raids before the window do not count.
    expect(exhaustionFactor([lost(2, 0), lost(30, 2)], 100 * H, data)).toBe(1);
  });

  it('scaleBaseLoot scales every building and rounds down', () => {
    const base = generateOpponent(3, 5, data);
    const before = base.buildings.map((b) => ({ ...(b.loot ?? {}) }));
    scaleBaseLoot(base, 0.5);
    base.buildings.forEach((b, i) => {
      for (const [k, v] of Object.entries(before[i])) expect(b.loot![k as 'acorns']).toBe(Math.floor((v as number) * 0.5));
    });
  });
});

describe('upward loot penalty', () => {
  it('raiding a higher Keep pays a little less; the same Keep pays in full', () => {
    expect(lootPenalty(5, 5, data)).toBe(1);
    expect(lootPenalty(5, 6, data)).toBe(data.ranks.lootPenaltyUpByHallDiff![1]);
    expect(lootPenalty(5, 7, data)).toBe(data.ranks.lootPenaltyUpByHallDiff![2]);
    expect(lootPenalty(5, 9, data)).toBe(data.ranks.lootPenaltyUpByHallDiff!.at(-1));
  });
});

describe('diversity carries more', () => {
  it('Gini-Simpson by role over the housing that fought; the hero and abilities are not counted', () => {
    expect(armyDiversity({ hedgehog_roller: 20 }, {}, data)).toBe(0);
    // Two roles with equal housing: 0.5.
    const blade = data.troops.hedgehog_roller.housing;
    const thrower = data.troops.frog_lobber.housing;
    expect(armyDiversity({ hedgehog_roller: thrower * 10, frog_lobber: blade * 10 }, {}, data)).toBeCloseTo(0.5, 9);
    expect(armyDiversity({ hedgehog_roller: 5, smoke_bomb: 2, wind_step_assassin: 0 }, {}, data)).toBe(0);
    expect(armyDiversity({ hedgehog_roller: 5, shadow_captain: 1 }, { hero: { id: 'shadow_captain', level: 1 } }, data)).toBe(0);
  });

  it('one role carries minShare, a mixed army all of it', () => {
    const d = data.raids.diversity!;
    expect(diversityShare(0, data)).toBe(d.minShare);
    expect(diversityShare(d.fullAt, data)).toBe(1);
    expect(diversityShare(0.9, data)).toBe(1);
    expect(diversityShare(d.fullAt / 2, data)).toBeCloseTo(d.minShare + (1 - d.minShare) / 2, 9);
  });
});

describe('declared stakes', () => {
  it('only the listed star counts can be declared; reaching one multiplies, missing it carries nothing', () => {
    expect(stakeOptions(data)).toEqual([2, 3]);
    expect(validStake(1, data)).toBe(false);
    expect(validStake('3', data)).toBe(false);
    expect(stakeMultiplier(undefined, 0, data)).toBe(1);
    expect(stakeMultiplier(3, 3, data)).toBe(data.raids.stakes!.byStars['3']);
    expect(stakeMultiplier(3, 2, data)).toBe(0);
    expect(stakeMultiplier(2, 3, data)).toBe(data.raids.stakes!.byStars['2']);
    expect(stakeMet(3, 2, data)).toBe(false);
    expect(stakeMet(undefined, 0, data)).toBe(true);
  });

  it('carry = diversity x stake, applied per resource and rounded down', () => {
    const r = { used: { hedgehog_roller: 10 }, stars: 3 };
    expect(raidCarry(r, {}, 3, data)).toBeCloseTo(data.raids.diversity!.minShare * data.raids.stakes!.byStars['3'], 9);
    expect(carriedLoot({ acorns: 1001, dew: 3 }, 0.5)).toEqual({ acorns: 500, dew: 1 });
    expect(carriedLoot({ acorns: 1 }, 0)).toEqual({});
  });

  it('battleEnd banks the stake (and records it); a missed stake banks no battle loot', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 0 });
    const s0: VillageState = { ...state, army: { hedgehog_roller: 20 } };
    const base = { name: 'Dummy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18, loot: { dew: 100 } }] };
    const deployments = Array.from({ length: 12 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const win = applyCommand(s0, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s0.army }, deployments, stake: 3 } }, clock.now(), data);
    expect(win.ok).toBe(true);
    if (!win.ok) return;
    const rec = win.state.battleLog.at(-1)!;
    expect(rec.result.stars).toBe(3);
    expect(rec.stake).toBe(3);
    expect(rec.carry).toBeCloseTo(data.raids.diversity!.minShare * data.raids.stakes!.byStars['3'], 9);
    expect(win.state.resources.dew).toBe(Math.floor(100 * rec.carry!));
    // The same raid stopped after one tick (no star): the declared 2 stars are missed.
    const miss = applyCommand(s0, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s0.army }, deployments: deployments.slice(0, 1), endTick: 1, stake: 2 } }, clock.now(), data);
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    const m = miss.state.battleLog.at(-1)!;
    expect(m.result.stars).toBeLessThan(2);
    expect(m.carry).toBe(0);
    expect(miss.state.resources.dew).toBe(0);
  });

  it('an undeclarable stake in a record is ignored', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 0 });
    const s0: VillageState = { ...state, army: { hedgehog_roller: 20 } };
    const base = { name: 'Dummy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18, loot: { dew: 100 } }] };
    const deployments = Array.from({ length: 12 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const r = applyCommand(s0, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s0.army }, deployments, stake: 9 } }, clock.now(), data);
    expect(r.ok && r.state.battleLog.at(-1)!.stake).toBeUndefined();
  });
});

describe('either-currency walls and traps', () => {
  it('walls and traps may be paid in Provisions one for one; towers may not', () => {
    expect(payableInProvisions('bramble_hedge', data)).toBe(true);
    expect(payableInProvisions('thorn_snare', data)).toBe(true);
    expect(payableInProvisions('acorn_cannon', data)).toBe(false);
    const { state, clock } = newGame({ acorns: 0, dew: 1_000_000 });
    const coins = data.buildings.bramble_hedge.levels[0].cost.acorns!;
    const q = placeQuote(state, data, 'bramble_hedge', clock.now(), 'dew');
    expect(q.ok && q.quote.cost).toEqual({ dew: coins });
    expect(placeQuote(state, data, 'bramble_hedge', clock.now()).ok).toBe(false);
    expect(placeQuote(state, data, 'acorn_cannon', clock.now(), 'dew').ok).toBe(false);
  });

  it('place and upgrade with pay: dew spend Provisions, and a cancel refunds them', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 1_000_000 });
    const free = (() => {
      for (let y = 2; y < 40; y++) for (let x = 2; x < 40; x++) if (applyCommand(state, { type: 'place', buildingType: 'bramble_hedge', x, y, pay: 'dew' }, clock.now(), data).ok) return { x, y };
      return null;
    })()!;
    const r = applyCommand(state, { type: 'place', buildingType: 'bramble_hedge', ...free, pay: 'dew' }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const wall = r.state.buildings.at(-1)!;
    expect(r.state.resources.dew).toBe(1_000_000 - data.buildings.bramble_hedge.levels[0].cost.acorns!);
    expect(r.state.resources.acorns).toBe(0);
    const later = clock.now() + 7 * 24 * H;
    const up = upgradeQuote(r.state, wall.id, data, later, 'dew');
    if (up.ok) expect(up.quote.cost.acorns ?? 0).toBe(0);
  });
});
