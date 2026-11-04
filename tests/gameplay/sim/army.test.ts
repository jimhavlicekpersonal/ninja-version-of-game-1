import { describe, expect, it } from 'vitest';
import { armyHousing, housingCapacity } from '../../../src/gameplay/sim/army';
import { capacity } from '../../../src/gameplay/sim/resources';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { migrate } from '../../../src/gameplay/sim/save';
import { advance, applyCommand } from '../../../src/gameplay/sim/village';
import { data, find, must, newGame } from './helpers';

function withArmyBuildings() {
  const g = newGame({ acorns: 1500, dew: 1500 });
  let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(22);
  s = advance(s, g.clock.now(), data).state;
  return { ...g, state: s };
}

describe('troop training', () => {
  it('needs a barracks and an army camp', () => {
    const { state, clock } = newGame();
    const r = applyCommand(state, { type: 'train', troop: 'hedgehog_roller' }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCKED');
  });

  it('trains troops one after another using timestamps', () => {
    const { state, clock } = withArmyBuildings();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: 'hedgehog_roller' }, t0);
    s = must(s, { type: 'train', troop: 'hedgehog_roller' }, t0);
    expect(s.training.map((q) => [q.startedAt - t0, q.endsAt - t0])).toEqual([[0, 20_000], [20_000, 40_000]]);
    expect(s.resources.dew).toBe(state.resources.dew - 2 * data.troops.hedgehog_roller.levels[0].cost.dew!);
    clock.advanceSeconds(20);
    s = advance(s, clock.now(), data).state;
    expect(s.army.hedgehog_roller).toBe(1);
    clock.advanceSeconds(20);
    s = advance(s, clock.now(), data).state;
    expect(s.army.hedgehog_roller).toBe(2);
    expect(s.training).toHaveLength(0);
  });

  it('respects army camp housing: one army in the camps, the next one waiting in the queue', () => {
    const { state, clock } = withArmyBuildings();
    expect(housingCapacity(state, data)).toBe(20);
    let s = { ...state, resources: { ...state.resources, dew: 1500 } };
    // A full army, then a full next army in the queue (economy.json queuedArmies = 1).
    for (let i = 0; i < 40; i++) s = must(s, { type: 'train', troop: 'hedgehog_roller' }, clock.now());
    const r = applyCommand(s, { type: 'train', troop: 'hedgehog_roller' }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ARMY_FULL');
    // Once everything has trained, only one army fits in the camps; the rest waits, done, in the queue.
    const later = advance(s, clock.now() + 3_600_000, data).state;
    expect(later.army.hedgehog_roller).toBe(20);
    expect(later.training).toHaveLength(20);
    expect(later.stats.troopsTrained).toBe(20);
  });

  it('locks troops behind barracks levels', () => {
    const { state, clock } = withArmyBuildings();
    const r = applyCommand(state, { type: 'train', troop: 'frog_lobber' }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCKED');
  });

  it('cancelling refunds and moves later troops up', () => {
    const { state, clock } = withArmyBuildings();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: 'hedgehog_roller' }, t0);
    s = must(s, { type: 'train', troop: 'hedgehog_roller' }, t0);
    s = must(s, { type: 'cancelTraining', index: 0 }, t0 + 5000);
    expect(s.training).toHaveLength(1);
    expect(s.training[0].startedAt).toBe(t0 + 5000);
    expect(s.training[0].endsAt).toBe(t0 + 25_000);
  });
});

describe('scouting and battle results', () => {
  it('the first look is free, Next costs acorns and gives a new opponent', () => {
    const { state, clock } = newGame();
    const r1 = applyCommand(state, { type: 'scout', paid: false }, clock.now(), data);
    expect(r1.ok && r1.state.resources.acorns).toBe(state.resources.acorns);
    const r2 = r1.ok ? applyCommand(r1.state, { type: 'scout', paid: true }, clock.now(), data) : null;
    expect(r2?.ok).toBe(true);
    if (r1.ok && r2?.ok) {
      expect(r2.state.resources.acorns).toBe(state.resources.acorns - data.battle.scoutFeeByHall[0]);
      const s1 = r1.events[0].kind === 'scout' ? r1.events[0].seed : 0;
      const s2 = r2.events[0].kind === 'scout' ? r2.events[0].seed : 0;
      expect(s1).not.toBe(s2);
    }
  });

  it('battleEnd re-simulates, spends used troops and adds loot (capped by storage)', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 0 });
    const s0 = { ...state, army: { hedgehog_roller: 20 } };
    const base = { name: 'Dummy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18, loot: { acorns: 5000, dew: 100 } }] };
    const deployments = Array.from({ length: 12 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const s1 = must(s0, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s0.army }, deployments } }, clock.now());
    expect(s1.army.hedgehog_roller).toBe(8);
    expect(s1.resources.acorns).toBe(capacity(s0, data).acorns); // capped by storage
    expect(s1.resources.dew).toBe(100);
    expect(s1.battleLog).toHaveLength(1);
    expect(s1.battleLog[0].result.stars).toBe(3);
    expect(find(s1, 'elder_toadstool')).toHaveLength(1);
  });

  it('army housing counts troop sizes', () => {
    expect(armyHousing({ hedgehog_roller: 3, beetle_brute: 2 }, data)).toBe(13);
    expect(generateOpponent(1, 1, data).buildings.length).toBeGreaterThan(3);
  });
});

describe('save migration', () => {
  it('upgrades a version 1 save', () => {
    const v1 = { version: 1, savedAt: 1, village: { createdAt: 1, lastSeenAt: 1, resources: { acorns: 1, dew: 1, nightsap: 0, moonstones: 0 }, buildings: [], nextId: 1 } };
    const m = migrate(v1);
    expect(m.version).toBeGreaterThanOrEqual(2);
    expect(m.village.army).toEqual({});
    expect(m.village.training).toEqual([]);
    expect(typeof m.village.seed).toBe('number');
  });
});
