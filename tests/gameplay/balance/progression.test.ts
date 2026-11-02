import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { activeHour, ModelPlayer, normalDays } from './playerModel';

// The model fights every raid as a real battle (no assumed loot share), so
// these targets check the actual battle, loot and matchmaking rules.

const opts = { raidsPerSession: 2 };

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
    console.log('hall reached (days):', JSON.stringify(reached), 'raids', p.raids, 'trophies', p.state.trophies, 'defenses', p.defenseLog.length);
    for (let h = 1; h <= 6; h++) {
      const rs = p.raidLog.filter((r) => r.hall === h);
      if (!rs.length) continue;
      const avg = (f: (r: (typeof rs)[number]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
      console.log(`  hall ${h}: ${rs.length} raids, stars ${avg((r) => r.stars)}, destruction ${avg((r) => r.destruction)}%, loot ${avg((r) => r.loot)}, opp hall ${avg((r) => r.opponentHall)}, trophies end ${rs[rs.length - 1].trophies}`);
    }
    for (let h = 1; h <= 6; h++) {
      const ds = p.defenseLog.filter((r) => r.hall === h);
      if (!ds.length) continue;
      const avg = (f: (r: (typeof ds)[number]) => number) => (ds.reduce((a, r) => a + f(r), 0) / ds.length).toFixed(1);
      console.log(`  defended at hall ${h}: ${ds.length} raids, stars ${avg((r) => r.stars)}, destruction ${avg((r) => r.destruction)}%, lost ${avg((r) => r.lost)}`);
    }
    console.log('  research', JSON.stringify(p.state.research.levels), 'resources', JSON.stringify(p.state.resources));
    // Every raid was a real battle against a matched opponent.
    expect(p.raidLog.length).toBeGreaterThan(50);
    const late = p.raidLog.filter((r) => r.hall >= 4);
    const avgDestruction = late.reduce((a, r) => a + r.destruction, 0) / late.length;
    expect(avgDestruction).toBeGreaterThan(40);
    expect(avgDestruction).toBeLessThan(95);
    // Opponents follow the player's trophies, which follow its hall.
    expect(p.raidLog[p.raidLog.length - 1].opponentHall).toBeGreaterThanOrEqual(5);
    expect(p.state.trophies).toBeLessThan(2600);
    const h6 = p.hallReachedAt[6];
    expect(h6).toBeDefined();
    expect(h6 / 24).toBeGreaterThanOrEqual(11);
    expect(h6 / 24).toBeLessThanOrEqual(17);
  });
});
