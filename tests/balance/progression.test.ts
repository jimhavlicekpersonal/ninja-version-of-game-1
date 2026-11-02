import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../src/sim/data';
import { activeHour, ModelPlayer, normalDays } from './playerModel';

const opts = { lootEfficiency: 0.55, raidsPerSession: 2 };

describe('progression pacing (model player)', () => {
  it('a new player reaches Elder Toadstool 3 in about an hour of active play', () => {
    const p = new ModelPlayer(data, opts);
    activeHour(p, 90, 2);
    const h3 = p.hallReachedAt[3];
    console.log(`hall 2 at ${(p.hallReachedAt[2] * 60).toFixed(0)} min, hall 3 at ${h3 !== undefined ? (h3 * 60).toFixed(0) : 'n/a'} min, raids ${p.raids}`);
    expect(h3).toBeDefined();
    expect(h3 * 60).toBeGreaterThanOrEqual(40);
    expect(h3 * 60).toBeLessThanOrEqual(80);
  });

  it('Elder Toadstool 6 takes about two weeks of normal play', { timeout: 120_000 }, () => {
    const p = new ModelPlayer(data, opts);
    activeHour(p, 60, 2);
    normalDays(p, 24);
    const reached = Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [k, +(v / 24).toFixed(1)]));
    console.log('hall reached (days):', JSON.stringify(reached), 'raids', p.raids, 'trophies', p.state.trophies, 'defenses', p.state.defenseLog.length);
    const h6 = p.hallReachedAt[6];
    expect(h6).toBeDefined();
    expect(h6 / 24).toBeGreaterThanOrEqual(11);
    expect(h6 / 24).toBeLessThanOrEqual(17);
  });
});
