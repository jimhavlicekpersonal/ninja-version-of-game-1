/**
 * Report section 5 step 8 (docs/audit/STATE_OF_THE_GAME.md): return hooks (growth 7, 9, 19).
 */
import { describe, expect, it } from 'vitest';
import { calendarView, localDayIndex, LOCAL_TIME_CHANGE_DAYS } from '../../../src/gameplay/sim/calendar';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { nextObjective } from '../../../src/gameplay/sim/objective';
import { migrate, serialize } from '../../../src/gameplay/sim/save';
import { PLAYER_COMMANDS } from '../../../src/gameplay/sim/serverEconomy';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';

const DAY = 86_400_000;
const HOUR = 3_600_000;
// 03:00 UTC on 2 November: noon the same day in Tokyo (UTC+9), 22:00 on 1 November in New York (UTC−5).
const T = Date.UTC(2026, 10, 2, 3);

const run = (s: VillageState, cmd: Parameters<typeof applyCommand>[1], at: number) => {
  const r = applyCommand(s, cmd, at, data);
  if (!r.ok) throw new Error(r.message);
  return r.state;
};

describe('growth 9: task days roll at the player\'s midnight', () => {
  it('uses the device offset, changed at most once a week', () => {
    let s = createNewVillage(T, data);
    const utc = localDayIndex(s, T, data);
    s = run(s, { type: 'setLocalTime', minutes: -300 }, T);
    expect(localDayIndex(s, T, data)).toBe(utc - 1);
    // Within the week: refused (moving the clock must not farm task days).
    expect(applyCommand(s, { type: 'setLocalTime', minutes: 540 }, T + HOUR, data).ok).toBe(false);
    s = run(s, { type: 'setLocalTime', minutes: 540 }, T + LOCAL_TIME_CHANGE_DAYS * DAY);
    expect(localDayIndex(s, T + LOCAL_TIME_CHANGE_DAYS * DAY, data)).toBe(utc + LOCAL_TIME_CHANGE_DAYS);
    expect(applyCommand(s, { type: 'setLocalTime', minutes: 7 }, T + 30 * DAY, data).ok).toBe(false);
  });

  it('new tasks arrive at local midnight, not at UTC midnight', () => {
    let s = run(createNewVillage(T, data), { type: 'setLocalTime', minutes: -300 }, T);
    s = advance(s, T, data).state;
    const day = s.tasks.day;
    // A day never goes back (it began on UTC's 2 November). 04:59 UTC on 3 November is 23:59 on
    // 2 November in New York: still the same task day; 05:01 UTC is New York's midnight.
    s = advance(s, Date.UTC(2026, 10, 3, 4, 59), data).state;
    expect(s.tasks.day).toBe(day);
    s = advance(s, Date.UTC(2026, 10, 3, 5, 1), data).state;
    expect(s.tasks.day).toBe(day + 1);
  });

  it('the server replays the new commands', () => {
    expect(PLAYER_COMMANDS.has('setLocalTime')).toBe(true);
    expect(PLAYER_COMMANDS.has('claimCalendar')).toBe(true);
  });
});

describe('growth 19: the 28-day calendar', () => {
  it('one claim a day, nothing lost on a missed day, a Keep look on day 28 (then Jade)', () => {
    let s = createNewVillage(T, data);
    expect(calendarView(s, T, 1, data)?.ready).toBe(true);
    s = run(s, { type: 'claimCalendar' }, T);
    expect(applyCommand(s, { type: 'claimCalendar' }, T + HOUR, data).ok).toBe(false);
    // Skip three days: the next claim is still day 2.
    s = run(s, { type: 'claimCalendar' }, T + 4 * DAY);
    expect(s.calendar.claimed).toBe(2);
    for (let d = 3; d <= 28; d++) s = run(s, { type: 'claimCalendar' }, T + (d + 2) * DAY);
    expect(s.cosmetics.owned).toContain('moonlit_shrine');
    expect(s.calendar).toMatchObject({ claimed: 0, cycles: 1 });
    // Jade only on days 7, 14 and 21 of the first cycle (resources the other days).
    expect(data.daily.calendar!.days.reduce((n, d) => n + (d.reward?.moonstones ?? 0), 0)).toBe(10 + 15 + 20);
    // The look is never sold.
    s.resources.moonstones = 10_000;
    expect(applyCommand(s, { type: 'buySkin', skin: 'moonlit_shrine' }, T + 40 * DAY, data).ok).toBe(false);
    // Second cycle: day 28 gives Jade instead.
    const view = calendarView(s, T + 40 * DAY, 1, data)!;
    expect(view.days[27].reward).toEqual({ moonstones: data.daily.calendar!.repeatJade });
  });

  it('save v19 adds the calendar to older saves', () => {
    const s = createNewVillage(T, data);
    const old = { ...serialize(s, T), version: 18 } as unknown as { version: number; village: Record<string, unknown> };
    delete old.village.calendar;
    expect(migrate(old, data).village.calendar).toEqual({ claimed: 0, lastDay: -1, cycles: 0 });
  });
});

describe('growth 7: the next objective', () => {
  it('free rewards first, then a full army, then an upgrade the village can pay for', () => {
    let s = createNewVillage(T, data);
    expect(nextObjective(s, T, data).kind).toBe('chest');
    s = run(s, { type: 'openDailyChest' }, T);
    s = run(s, { type: 'claimCalendar' }, T);
    const o = nextObjective(s, T, data);
    expect(['upgrade', 'save']).toContain(o.kind);
    if (o.kind === 'upgrade') expect(s.buildings.find((b) => b.id === o.buildingId)).toBeTruthy();
    // Nothing affordable: what is missing for the cheapest upgrade.
    s.resources = { ...s.resources, acorns: 0, dew: 0 };
    expect(nextObjective(s, T, data).kind).toBe('save');
  });
});
