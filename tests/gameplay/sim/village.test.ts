import { describe, expect, it } from 'vitest';
import { applyCommand, advance, builderStatus, hallLevel, upgradeQuote } from '../../../src/gameplay/sim/village';
import { data, newGame, must, find } from './helpers';

describe('new village', () => {
  it('starts with a level 1 Elder Toadstool and 2 Beaver Builders', () => {
    const { state, clock } = newGame();
    expect(hallLevel(state, data)).toBe(1);
    expect(find(state, 'beaver_lodge')).toHaveLength(2);
    expect(builderStatus(state, data, clock.now())).toEqual({ total: 2, busy: 0, free: 2 });
    expect(state.resources.acorns).toBe(data.economy.startingResources.acorns);
  });
});

describe('building and upgrading', () => {
  it('placing a building charges its cost and starts a 10 second timer', () => {
    const { state, clock } = newGame();
    const t0 = clock.now();
    const s1 = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 5, y: 5 }, t0);
    const orchard = find(s1, 'acorn_orchard')[0];
    expect(orchard.level).toBe(0);
    expect(orchard.upgrade).toMatchObject({ toLevel: 1, startedAt: t0, endsAt: t0 + 10_000 });
    expect(s1.resources.dew).toBe(state.resources.dew - 150);
  });

  it('a timer finishes when the clock passes endsAt, not before', () => {
    const { state, clock } = newGame();
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 5, y: 5 }, clock.now());
    clock.advanceSeconds(9);
    s = advance(s, clock.now(), data).state;
    expect(find(s, 'acorn_orchard')[0].level).toBe(0);
    clock.advanceSeconds(1);
    const r = advance(s, clock.now(), data);
    expect(find(r.state, 'acorn_orchard')[0].level).toBe(1);
    expect(find(r.state, 'acorn_orchard')[0].upgrade).toBeNull();
    expect(r.finished).toHaveLength(1);
  });

  it('only 2 things can be built at once with 2 builders', () => {
    const { state, clock } = newGame({ acorns: 5000, dew: 5000 });
    const now = clock.now();
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, now);
    s = must(s, { type: 'place', buildingType: 'dewdrop_well', x: 6, y: 2 }, now);
    expect(builderStatus(s, data, now)).toEqual({ total: 2, busy: 2, free: 0 });
    const r = applyCommand(s, { type: 'place', buildingType: 'acorn_silo', x: 10, y: 2 }, now, data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NO_FREE_BUILDER');
    // After the timers end, the builders are free again.
    clock.advanceSeconds(10);
    expect(builderStatus(s, data, clock.now()).free).toBe(2);
    expect(applyCommand(s, { type: 'place', buildingType: 'acorn_silo', x: 10, y: 2 }, clock.now(), data).ok).toBe(true);
  });

  it('rejects building when resources are short and charges nothing', () => {
    const { state, clock } = newGame({ dew: 100 });
    const r = applyCommand(state, { type: 'place', buildingType: 'acorn_orchard', x: 5, y: 5 }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_ENOUGH_RESOURCES');
  });

  it('enforces the Elder Toadstool building count limit', () => {
    const { state, clock } = newGame({ dew: 1500 });
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, clock.now());
    clock.advanceSeconds(10);
    const r = applyCommand(s, { type: 'place', buildingType: 'acorn_orchard', x: 6, y: 2 }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('HALL_LEVEL_TOO_LOW');
      expect(r.message).toContain('level 2');
    }
  });

  it('enforces the Elder Toadstool level cap on upgrades', () => {
    const { state, clock } = newGame({ dew: 1500 });
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, clock.now());
    const id = find(s, 'acorn_orchard')[0].id;
    clock.advanceSeconds(10);
    s = must(s, { type: 'upgrade', id }, clock.now()); // to level 2 (hall 1 cap)
    clock.advanceSeconds(22);
    const q = upgradeQuote(s, id, data, clock.now());
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('HALL_LEVEL_TOO_LOW');
  });

  it('upgrading the Elder Toadstool raises limits', () => {
    const { state, clock } = newGame({ acorns: 1500 });
    const hall = find(state, 'elder_toadstool')[0];
    let s = must(state, { type: 'upgrade', id: hall.id }, clock.now());
    clock.advanceSeconds(data.buildings.elder_toadstool.levels[1].buildSeconds);
    s = advance(s, clock.now(), data).state;
    expect(hallLevel(s, data)).toBe(2);
  });

  it('cannot upgrade a building that is already upgrading', () => {
    const { state, clock } = newGame();
    const hall = find(state, 'elder_toadstool')[0];
    const s = must(state, { type: 'upgrade', id: hall.id }, clock.now());
    const r = applyCommand(s, { type: 'upgrade', id: hall.id }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BUSY');
  });

  it('cancelling refunds part of the cost and frees the builder', () => {
    const { state, clock } = newGame({ acorns: 1000 });
    const hall = find(state, 'elder_toadstool')[0];
    let s = must(state, { type: 'upgrade', id: hall.id }, clock.now());
    expect(s.resources.acorns).toBe(0);
    s = must(s, { type: 'cancel', id: hall.id }, clock.now());
    expect(s.resources.acorns).toBe(1000 * data.economy.cancelRefundFraction);
    expect(builderStatus(s, data, clock.now()).busy).toBe(0);
    expect(find(s, 'elder_toadstool')[0].level).toBe(1);
  });

  it('cancelling a new building removes it', () => {
    const { state, clock } = newGame();
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 5, y: 5 }, clock.now());
    s = must(s, { type: 'cancel', id: find(s, 'acorn_orchard')[0].id }, clock.now());
    expect(find(s, 'acorn_orchard')).toHaveLength(0);
  });

  it('commands never mutate the input state', () => {
    const { state, clock } = newGame();
    const before = JSON.stringify(state);
    must(state, { type: 'place', buildingType: 'acorn_orchard', x: 5, y: 5 }, clock.now());
    expect(JSON.stringify(state)).toBe(before);
  });
});
