import { describe, expect, it } from 'vitest';
import { computeOfflineProgress } from '../../../src/gameplay/sim/offline';
import { collectorAmount } from '../../../src/gameplay/sim/resources';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { advance } from '../../../src/gameplay/sim/village';
import { data, newGame, must, find } from './helpers';

describe('offline progress (simulated 8-hour absence)', () => {
  // P3-01 (2026-11-18): restated for the collector cap as data (8 -> 24 hours): away exactly that long.
  it('timers and collectors survive a save, reload and a full collector cap away', () => {
    const H = data.economy.collectorHoursCap;
    const { state, clock } = newGame({ acorns: 1500, dew: 1500 });
    // Build an orchard and a well, wait for them, then start a hall upgrade.
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, clock.now());
    s = must(s, { type: 'place', buildingType: 'dewdrop_well', x: 6, y: 2 }, clock.now());
    clock.advanceSeconds(10);
    s = advance(s, clock.now(), data).state;
    const hall = find(s, 'elder_toadstool')[0];
    s = must(s, { type: 'upgrade', id: hall.id }, clock.now());
    const leftAt = clock.now();

    // Save, "close the game", H hours pass, reload.
    const saved = JSON.stringify(serialize(s, leftAt));
    clock.advanceHours(H);
    const loaded = deserialize(JSON.parse(saved), data);
    const { state: after, summary } = computeOfflineProgress(loaded, clock.now(), data);

    expect(summary.awayMs).toBe(H * 3_600_000);
    expect(summary.finished.map((f) => f.type)).toEqual(['elder_toadstool']);
    expect(find(after, 'elder_toadstool')[0].level).toBe(2);
    // Collectors filled to their cap (200/h * H) and stopped.
    expect(summary.collectorGains.acorns).toBe(200 * H);
    expect(summary.collectorGains.dew).toBe(200 * H);
    const orchard = find(after, 'acorn_orchard')[0];
    expect(collectorAmount(orchard, clock.now(), data)).toBe(200 * H);
    // A further hour away adds nothing: the collectors are full.
    clock.advanceHours(1);
    expect(collectorAmount(orchard, clock.now(), data)).toBe(200 * H);
    expect(after.lastSeenAt).toBe(leftAt + H * 3_600_000);
  });

  it('handles a device clock that went backwards without losing anything', () => {
    const { state, clock } = newGame();
    const s = { ...state, lastSeenAt: clock.now() + 60_000 };
    const { summary } = computeOfflineProgress(s, clock.now(), data);
    expect(summary.awayMs).toBe(0);
  });
});
