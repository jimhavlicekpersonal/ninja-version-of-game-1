/**
 * Local days and the 28-day calendar (state-of-the-game report, section 5 step 8, growth 9 and 19).
 *
 * Local days: task days and weeks used to roll at UTC midnight (19:00 in New York, 16:00 in Los Angeles),
 * mid-session for much of the world. They now roll at the player's own midnight (`localTime.offsetMinutes`,
 * set from the device by `setLocalTime`; changed at most once a week, so moving the clock cannot farm task
 * days). The free chest and the stipend keep the UTC day: the chest's draw depends on it.
 *
 * The calendar: a fixed list of 28 rewards (`daily.json` `calendar`), one claim per local day, nothing random,
 * never sold. A missed day loses nothing (the next claim is the next day on the list), like the streak. Day 28
 * gives a Keep look the first time and Jade after that; then the list starts again.
 */
import { scaleReward } from './economy';
import type { CalendarState, Cost, GameData, VillageState } from './types';

const DAY = 86_400_000;
const MINUTE = 60_000;
/** Offsets the world uses: UTC−12 to UTC+14. */
export const MAX_OFFSET_MINUTES = 14 * 60;
/** A new offset is taken at most this often (moving the clock must not farm task days). */
export const LOCAL_TIME_CHANGE_DAYS = 7;

export function emptyCalendar(): CalendarState {
  return { claimed: 0, lastDay: -1, cycles: 0 };
}

/** The player's offset from UTC in minutes (east positive), within the world's range. */
export function localOffsetMinutes(state: VillageState): number {
  const m = state.localTime?.offsetMinutes ?? 0;
  return Math.max(-12 * 60, Math.min(MAX_OFFSET_MINUTES, Math.round(m)));
}

/** The day index (pass days, like `dayIndex`) on the player's own calendar: it rolls at their midnight. */
export function localDayIndex(state: VillageState, t: number, data: GameData): number {
  return Math.floor((t + localOffsetMinutes(state) * MINUTE - data.pass.epoch) / DAY);
}

/** When the player's next local day begins. */
export function nextLocalDayAt(state: VillageState, t: number, data: GameData): number {
  return data.pass.epoch + (localDayIndex(state, t, data) + 1) * DAY - localOffsetMinutes(state) * MINUTE;
}

/** Set the device's offset; refused (null) for a bad value or a change within `LOCAL_TIME_CHANGE_DAYS`. Mutates. */
export function setLocalTime(state: VillageState, minutes: number, now: number): string | null {
  if (!Number.isInteger(minutes) || minutes % 15 !== 0 || minutes < -12 * 60 || minutes > MAX_OFFSET_MINUTES) return 'Not a time zone.';
  const lt = state.localTime;
  if (lt && lt.offsetMinutes === minutes) return null;
  if (lt && lt.setAt > 0 && now - lt.setAt < LOCAL_TIME_CHANGE_DAYS * DAY) return 'Your time zone can change once a week.';
  state.localTime = { offsetMinutes: minutes, setAt: now };
  return null;
}

export interface CalendarView {
  /** 1..28: the day the next claim gives. */
  next: number;
  /** A claim is possible now. */
  ready: boolean;
  days: { day: number; reward: Cost & { skin?: string }; claimed: boolean }[];
  nextAt: number;
}

/** What day `n` (1..28) gives at this Keep, this cycle. */
export function calendarReward(state: VillageState, n: number, hall: number, data: GameData): Cost & { skin?: string } {
  const def = data.daily.calendar;
  if (!def) return {};
  const entry = def.days[Math.max(1, Math.min(def.days.length, n)) - 1];
  if (entry.skin) {
    const owned = state.cosmetics.owned.includes(entry.skin);
    return owned ? { moonstones: def.repeatJade } : { skin: entry.skin };
  }
  const { moonstones, ...res } = entry.reward ?? {};
  return { ...scaleReward(res, hall, data), ...(moonstones ? { moonstones } : {}) };
}

export function calendarView(state: VillageState, now: number, hall: number, data: GameData): CalendarView | null {
  const def = data.daily.calendar;
  if (!def) return null;
  const c = state.calendar ?? emptyCalendar();
  const days = def.days.map((_, i) => ({ day: i + 1, reward: calendarReward(state, i + 1, hall, data), claimed: i < c.claimed }));
  return { next: c.claimed + 1, ready: c.lastDay < localDayIndex(state, now, data), days, nextAt: nextLocalDayAt(state, now, data) };
}

/** Claim today's calendar day. Returns what to grant (the caller grants it), or an error. Mutates the calendar only. */
export function claimCalendarDay(state: VillageState, now: number, hall: number, data: GameData): { day: number; reward: Cost & { skin?: string } } | { error: string } {
  const def = data.daily.calendar;
  if (!def) return { error: 'No calendar.' };
  state.calendar = state.calendar ?? emptyCalendar();
  const today = localDayIndex(state, now, data);
  if (state.calendar.lastDay >= today) return { error: "Today's calendar reward is claimed. The next one is ready tomorrow." };
  const day = state.calendar.claimed + 1;
  const reward = calendarReward(state, day, hall, data);
  state.calendar.lastDay = today;
  state.calendar.claimed = day >= def.days.length ? 0 : day;
  if (day >= def.days.length) state.calendar.cycles += 1;
  return { day, reward };
}
