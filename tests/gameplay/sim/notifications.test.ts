/** Notifications: opt-in types, quiet hours and a daily cap. */
import { describe, expect, it } from 'vitest';
import { defaultNotificationTypes, planNotifications, upcomingReminders, type Reminder } from '../../../src/gameplay/sim/reminders';
import { data, must, newGame } from './helpers';

const HOUR = 3_600_000;
const day0 = Date.UTC(2026, 4, 4, 0, 0, 0);
const r = (id: string, type: Reminder['type'], hourUtc: number): Reminder => ({ id, type, at: day0 + hourUtc * HOUR, title: id, body: '' });
const all = new Set(data.notifications.types.map((t) => t.id));

describe('notification plan', () => {
  it('sends only the types the player switched on', () => {
    const list = [r('a', 'builds', 10), r('b', 'events', 11), r('c', 'dailyChest', 12)];
    expect(planNotifications(list, new Set(['builds']), day0, 0, data).map((x) => x.id)).toEqual(['a']);
    expect(planNotifications(list, new Set(), day0, 0, data)).toEqual([]);
  });

  it('waits until quiet hours end (in local time)', () => {
    const { start, end } = data.notifications.quietHours;
    const late = r('late', 'builds', start + 1);
    const [moved] = planNotifications([late], all, day0, 0, data);
    expect(moved.at).toBe(day0 + (24 + end) * HOUR);
    // In UTC-5 (offset +300), 03:00 UTC is 22:00 local: also quiet, moved to 08:00 local = 13:00 UTC.
    const [ny] = planNotifications([r('ny', 'builds', 3)], all, day0, 300, data);
    expect(ny.at).toBe(day0 + (end + 5) * HOUR);
    // Daytime reminders are untouched.
    expect(planNotifications([r('noon', 'builds', 12)], all, day0, 0, data)[0].at).toBe(day0 + 12 * HOUR);
  });

  it('never sends more than the daily cap, keeping the most useful types', () => {
    const max = data.notifications.maxPerDay;
    const list = [r('ev', 'events', 9), r('sh', 'shield', 9.5), ...Array.from({ length: max + 3 }, (_, i) => r(`b${i}`, 'builds', 10 + i * 0.5))];
    const plan = planNotifications(list, all, day0, 0, data);
    expect(plan.length).toBe(max);
    expect(plan.every((x) => x.type === 'builds')).toBe(true);
    // Spread over two days, each day gets its own cap.
    const twoDays = [...list, ...list.map((x) => ({ ...x, id: `${x.id}-2`, at: x.at + 24 * HOUR }))];
    expect(planNotifications(twoDays, all, day0, 0, data).length).toBe(2 * max);
  });

  it('is off until the player turns it on, and only some types default on', () => {
    expect(defaultNotificationTypes(data)).toContain('builds');
    expect(defaultNotificationTypes(data)).not.toContain('events');
    // Report section 5 step 8 (growth 8): the player's own free chest is on once they turn notifications on.
    expect(defaultNotificationTypes(data)).toContain('dailyChest');
  });

  it('every reminder has a type the settings know about', () => {
    const { state, clock } = newGame();
    let s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }, clock.now());
    s = must(s, { type: 'openDailyChest' }, clock.now());
    const list = upcomingReminders(s, clock.now(), data);
    expect(list.some((x) => x.type === 'dailyChest')).toBe(true);
    for (const x of list) expect(all.has(x.type)).toBe(true);
  });
});
