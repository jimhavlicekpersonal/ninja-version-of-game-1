/** The Shadow Clans starting village through the normal rules (helpers default to the classic start). */
import { describe, expect, it } from 'vitest';
import { housingCapacity } from '../../../src/gameplay/sim/army';
import { simulateOfflineRaids } from '../../../src/gameplay/sim/defense';
import { applyCommand, hallLevel } from '../../../src/gameplay/sim/village';
import { aiCandidates } from '../../../src/gameplay/sim/world/opponents';
import { data, must, newGame } from './helpers';

const HOUR = 3_600_000;

describe('the starter village', () => {
  it('has a Keep, two huts, a Coin Mint, a Kunai Tower and three Shinobi', () => {
    const { state } = newGame({}, { starter: true });
    const types = state.buildings.map((b) => b.type).sort();
    expect(types).toEqual(['acorn_cannon', 'acorn_orchard', 'beaver_lodge', 'beaver_lodge', 'elder_toadstool']);
    expect(state.army).toEqual({ hedgehog_roller: 3 });
    expect(state.world.firstRaidDone).toBe(false);
  });

  it('follows the Keep 1 limits: another Coin Mint needs Keep 2', () => {
    const g = newGame({ acorns: 10_000, dew: 10_000 }, { starter: true });
    const r = applyCommand(g.state, { type: 'place', buildingType: 'acorn_orchard', x: 3, y: 3 }, g.clock.now(), data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('HALL_LEVEL_TOO_LOW');
  });

  it('collects, builds a Squad Courtyard and trains alongside the starting Shinobi', () => {
    const g = newGame({ acorns: 1000, dew: 2000 }, { starter: true });
    g.clock.advanceSeconds(3600);
    let s = must(g.state, { type: 'collect', id: g.state.buildings.find((b) => b.type === 'acorn_orchard')!.id }, g.clock.now());
    s = must(s, { type: 'place', buildingType: 'army_camp', x: 3, y: 3 }, g.clock.now());
    s = must(s, { type: 'place', buildingType: 'burrow_barracks', x: 8, y: 3 }, g.clock.now());
    g.clock.advanceSeconds(3600);
    s = must(s, { type: 'train', troop: 'hedgehog_roller' }, g.clock.now());
    g.clock.advanceSeconds(3600);
    s = must(s, { type: 'setPvpOptIn', on: false }, g.clock.now());
    expect(housingCapacity(s, data)).toBeGreaterThan(0);
    expect(s.army.hedgehog_roller).toBe(4);
  });

  it('the starting Kunai Tower takes part in defending against AI raids', () => {
    const g = newGame({ acorns: 2000 }, { starter: true });
    const s = { ...g.state, shieldUntil: 0, raidCheckAt: g.state.lastSeenAt };
    const out = simulateOfflineRaids(s, s.lastSeenAt + 4 * 24 * HOUR, data);
    expect(out.raids.length).toBeGreaterThan(0);
    for (const r of out.raids) expect(r.record.setup.base.buildings.some((b) => b.type === 'acorn_cannon')).toBe(true);
  });

  it('the first look at rivals is the training outpost, then the full board', () => {
    const g = newGame({}, { starter: true });
    expect(aiCandidates(1, g.state, data).map((c) => c.kind)).toEqual(['first']);
    const s = { ...g.state, world: { ...g.state.world, firstRaidDone: true } };
    expect(aiCandidates(1, s, data).length).toBeGreaterThan(1);
    expect(hallLevel(s, data)).toBe(1);
  });
});
