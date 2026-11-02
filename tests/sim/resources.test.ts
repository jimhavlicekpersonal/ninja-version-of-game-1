import { describe, expect, it } from 'vitest';
import { capacity, collectorAmount } from '../../src/sim/resources';
import { applyCommand, advance } from '../../src/sim/village';
import { data, newGame, must, find } from './helpers';

function withOrchard() {
  const g = newGame({ dew: 1500 });
  let s = must(g.state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(10);
  s = advance(s, g.clock.now(), data).state;
  return { ...g, state: s, id: find(s, 'acorn_orchard')[0].id };
}

describe('storage', () => {
  const hallStore = data.buildings.elder_toadstool.levels[0].storage!.acorns!;
  it('the Elder Toadstool provides base storage', () => {
    const { state } = newGame();
    expect(capacity(state, data).acorns).toBe(hallStore);
    expect(capacity(state, data).dew).toBe(hallStore);
  });

  it('a finished silo adds storage; one under construction does not', () => {
    const { state, clock } = newGame({ dew: 1000 });
    let s = must(state, { type: 'place', buildingType: 'acorn_silo', x: 2, y: 2 }, clock.now());
    expect(capacity(s, data).acorns).toBe(hallStore);
    clock.advanceSeconds(10);
    s = advance(s, clock.now(), data).state;
    expect(capacity(s, data).acorns).toBe(hallStore + 1500);
  });
});

describe('collectors', () => {
  it('produce at the per-hour rate for their level', () => {
    const { state, clock, id } = withOrchard();
    clock.advanceHours(1);
    const b = find(state, 'acorn_orchard')[0];
    expect(collectorAmount(b, clock.now(), data)).toBeCloseTo(200);
    expect(b.id).toBe(id);
  });

  it('stop at 8 hours of output', () => {
    const { state, clock } = withOrchard();
    clock.advanceHours(30);
    expect(collectorAmount(find(state, 'acorn_orchard')[0], clock.now(), data)).toBe(200 * 8);
  });

  it('do not produce while under construction', () => {
    const { state, clock } = newGame({ dew: 1000 });
    const s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, clock.now());
    clock.advanceSeconds(5);
    expect(collectorAmount(find(s, 'acorn_orchard')[0], clock.now(), data)).toBe(0);
    // Production starts when construction ends, not when it was placed.
    clock.advanceSeconds(5 + 3600);
    expect(collectorAmount(find(s, 'acorn_orchard')[0], clock.now(), data)).toBeCloseTo(200);
  });

  it('tapping collects into storage up to its capacity and keeps the rest', () => {
    const g = withOrchard();
    const { clock, id } = g;
    const cap = capacity(g.state, data).acorns;
    const state = { ...g.state, resources: { ...g.state.resources, acorns: cap - 500 } };
    clock.advanceHours(8); // 1600 acorns waiting, room for 500
    const s = must(state, { type: 'collect', id }, clock.now());
    expect(s.resources.acorns).toBe(cap);
    const left = collectorAmount(find(s, 'acorn_orchard')[0], clock.now(), data);
    expect(left).toBeCloseTo(1100);
  });

  it('reports STORAGE_FULL when there is no room', () => {
    const { state, clock, id } = withOrchard();
    const full = { ...state, resources: { ...state.resources, acorns: capacity(state, data).acorns } };
    clock.advanceHours(1);
    const r = applyCommand(full, { type: 'collect', id }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('STORAGE_FULL');
  });

  it('keep what they hold during an upgrade but do not produce more', () => {
    const { state, clock, id } = withOrchard();
    clock.advanceHours(2); // 400 waiting
    let s = must(state, { type: 'upgrade', id }, clock.now());
    clock.advanceSeconds(10);
    expect(collectorAmount(find(s, 'acorn_orchard')[0], clock.now(), data)).toBeCloseTo(400);
    // After the 22 s upgrade, it produces at the level 2 rate (400/h).
    clock.advanceSeconds(12);
    s = advance(s, clock.now(), data).state;
    clock.advanceHours(1);
    expect(collectorAmount(find(s, 'acorn_orchard')[0], clock.now(), data)).toBeCloseTo(800);
  });
});
