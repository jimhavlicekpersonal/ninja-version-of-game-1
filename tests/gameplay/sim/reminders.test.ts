import { describe, expect, it } from 'vitest';
import { upcomingReminders } from '../../../src/gameplay/sim/reminders';
import { advance } from '../../../src/gameplay/sim/village';
import { data, find, must, newGame } from './helpers';

describe('reminders', () => {
  it('lists finishing upgrades, ready armies, full collectors and the shield, in time order', () => {
    const { state, clock } = newGame();
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, clock.now());
    clock.advanceSeconds(10);
    s = advance(s, clock.now(), data).state;
    const hall = find(s, 'elder_toadstool')[0];
    s = must(s, { type: 'upgrade', id: hall.id }, clock.now());
    const list = upcomingReminders(s, clock.now(), data);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(`up-${hall.id}`);
    expect(ids).toContain('collectors');
    expect(ids).toContain('shield');
    for (let i = 1; i < list.length; i++) expect(list[i].at).toBeGreaterThanOrEqual(list[i - 1].at);
    const col = list.find((r) => r.id === 'collectors')!;
    expect(col.at - clock.now()).toBeCloseTo(8 * 3_600_000, -4);
  });

  it('new players start the tutorial', () => {
    expect(newGame().state.tutorial).toEqual({ step: 0, done: false });
  });
});
