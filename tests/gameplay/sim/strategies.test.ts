/** Prebuilt strategies and Jade batches in the Army panel (2026-11-25). */
import { describe, expect, it } from 'vitest';
import { housingCapacity, troopUnlock } from '../../../src/gameplay/sim/army';
import { armyView, TOP_UP_BATCHES, trainRow } from '../../../src/gameplay/sim/armyView';
import { availableStrategies, STRATEGIES, suggestedArmy } from '../../../src/gameplay/sim/suggest';
import roster from '../../../src/gameplay/data/roster.json';
import { advance, applyCommand } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { data, must, newGame } from './helpers';

const ROLE_OF: Record<string, string> = Object.fromEntries(roster.warriors.filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.role]));
const housing = (army: Record<string, number>) => Object.entries(army).reduce((a, [t, n]) => a + data.troops[t].housing * n, 0);
const key = (army: Record<string, number>) => JSON.stringify(Object.entries(army).sort());

function armyVillage(dew = 50_000): { s: VillageState; clock: { now(): number } } {
  const { state, clock } = newGame({ dew: 50_000, acorns: 50_000 });
  let s = must(state, { type: 'place', buildingType: 'burrow_barracks', x: 10, y: 10 }, clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 10, y: 14 }, clock.now());
  clock.advanceHours(2);
  s = advance(s, clock.now(), data).state;
  return { s: { ...s, resources: { ...s.resources, dew } }, clock };
}

/** Every warrior unlocked by research levels and Dojo/Keep levels high enough (a late-game village). */
function lateVillage(s: VillageState): VillageState {
  const top = (type: string) => data.buildings[type].levels.length;
  return {
    ...s,
    buildings: s.buildings.map((b) => (['burrow_barracks', 'elder_toadstool', 'army_camp'].includes(b.type) ? { ...b, level: top(b.type) } : b)),
  };
}

describe('prebuilt strategies', () => {
  it('offers nothing without camps', () => {
    const { state } = newGame();
    expect(availableStrategies(state, data)).toEqual([]);
  });

  it('every offered strategy fits the camps, uses trainable warriors, keeps its lead role and trains in one step', () => {
    for (const { s, clock } of [armyVillage(), (({ s, clock }) => ({ s: lateVillage(s), clock }))(armyVillage())]) {
      const cap = housingCapacity(s, data);
      const list = availableStrategies(s, data);
      for (const st of list) {
        const def = STRATEGIES.find((x) => x.id === st.id)!;
        const lead = Object.keys(def.shares)[0];
        expect(housing(st.army)).toBeLessThanOrEqual(cap);
        expect(housing(st.army)).toBeGreaterThan(cap * 0.8);
        for (const t of Object.keys(st.army)) expect(troopUnlock(s, t, data).unlocked).toBe(true);
        expect(Object.keys(st.army).some((t) => ROLE_OF[t] === lead)).toBe(true);
        expect(applyCommand(s, { type: 'trainArmy', army: st.army }, clock.now(), data).ok).toBe(true);
      }
      // No strategy repeats the suggested army or another strategy.
      const keys = [key(suggestedArmy(s, data)), ...list.map((x) => key(x.army))];
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('a late village gets more strategies than a new one, and every strategy id has its English text', async () => {
    const early = availableStrategies(armyVillage().s, data);
    const late = availableStrategies(lateVillage(armyVillage().s), data);
    expect(late.length).toBeGreaterThan(early.length);
    const en = (await import('../../../locales/en/ui.json')).default as Record<string, string>;
    for (const st of STRATEGIES) {
      expect(en[`strategy.${st.id}.name`]).toBeTruthy();
      expect(en[`strategy.${st.id}.text`]).toBeTruthy();
    }
  });
});

describe('Jade batches (+1, +5, +10 besides Fill)', () => {
  it('offers smaller batches only when something is missing for them, and each buys exactly its count', () => {
    const { s, clock } = armyVillage(0);
    const now = clock.now();
    const troop = 'hedgehog_roller';
    const row = trainRow(armyView(s, now, data), troop, now, data);
    expect(row.fill).toBe(0);
    expect(row.topUp).not.toBeNull();
    expect(row.topUps.length).toBeGreaterThan(0);
    for (const x of row.topUps) {
      expect(TOP_UP_BATCHES).toContain(x.count);
      expect(x.count).toBeLessThan(row.topUp!.count);
      expect(x.moonstones).toBeLessThanOrEqual(row.topUp!.moonstones);
      const r = applyCommand({ ...s, resources: { ...s.resources, moonstones: 1_000_000 } }, { type: 'topUp', then: { type: 'train', troop, count: x.count } }, now, data);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state.training.length).toBe(x.count);
    }
    // Ascending and priced in order.
    expect(row.topUps.map((x) => x.count)).toEqual([...row.topUps.map((x) => x.count)].sort((a, b) => a - b));
  });

  it('leaves out batches the player can already pay for', () => {
    const { s, clock } = armyVillage(50_000);
    const row = trainRow(armyView(s, clock.now(), data), 'hedgehog_roller', clock.now(), data);
    expect(row.topUps).toEqual([]);
  });
});
