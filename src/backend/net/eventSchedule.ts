/**
 * Server-delivered event schedule (retention audit G10, growth batch 2026-11-14).
 *
 * The operators may change WHEN the built-in limited-time events run without an app release: the
 * server's `EVENT_SCHEDULE_FILE` holds an `EventSchedule`, `/v1/hello` sends it as `events`, and the
 * game plays it. Rules (checked here, by the server at start and by the game on every hello):
 * - Timing only. Every entry names a built-in event id (`events.json`); its name, text, effect and
 *   goal come from the game's own data. Unknown or repeated ids refuse the whole schedule.
 * - A schedule repeats every `periodDays` (7-56) from `epoch`; each entry starts at `startHour` and
 *   lasts `durationHours` (1-168) inside one period. It stays until the operators replace or remove
 *   the file and restart the server; the game then follows at its next hello.
 * - The server plays the same schedule (its live data carries it), so a server-held village and the
 *   server's raid loot agree with what the game shows.
 * - Change it only between events: a goal event's key is `<id>#<period number>`, so moving the epoch
 *   or period mid-event starts a new bounty ladder.
 * Pure: browser and Node.
 */
import type { EventsDef } from '../../gameplay/sim/types';

export interface EventScheduleEntry {
  /** A built-in event id (events.json `schedule[].id`). */
  id: string;
  startHour: number;
  durationHours: number;
}

export interface EventSchedule {
  format: 1;
  /** The operators' name for it, e.g. "2026-12-winter". */
  id: string;
  /** UTC ms the first period starts. */
  epoch: number;
  periodDays: number;
  entries: EventScheduleEntry[];
}

const MAX_SCHEDULE_ENTRIES = 16;
const ID = /^[a-z0-9_.:-]{1,60}$/i;
const MIN_EPOCH = Date.UTC(2024, 0, 1);
const MAX_EPOCH = Date.UTC(2100, 0, 1);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** The schedule as it may be played, or why it is refused. */
export function checkEventSchedule(raw: unknown, builtIn: EventsDef): EventSchedule | { error: string } {
  const x = (raw ?? {}) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || x.format !== 1) return { error: 'not an event schedule' };
  if (typeof x.id !== 'string' || !ID.test(x.id)) return { error: 'bad id' };
  if (!int(x.epoch, MIN_EPOCH, MAX_EPOCH)) return { error: 'bad epoch' };
  if (!int(x.periodDays, 7, 56)) return { error: 'periodDays must be 7 to 56' };
  if (!Array.isArray(x.entries) || !x.entries.length || x.entries.length > MAX_SCHEDULE_ENTRIES) return { error: `1 to ${MAX_SCHEDULE_ENTRIES} entries` };
  const known = new Set(builtIn.schedule.map((e) => e.id));
  const seen = new Set<string>();
  const periodHours = (x.periodDays as number) * 24;
  const entries: EventScheduleEntry[] = [];
  for (const e of x.entries as Record<string, unknown>[]) {
    if (!e || typeof e.id !== 'string' || !known.has(e.id)) return { error: `unknown event ${String(e?.id)}` };
    if (seen.has(e.id)) return { error: `event ${e.id} listed twice` };
    seen.add(e.id);
    if (!int(e.durationHours, 1, 168)) return { error: `${e.id}: durationHours must be 1 to 168` };
    if (!int(e.startHour, 0, periodHours - (e.durationHours as number))) return { error: `${e.id}: must start and end inside one period` };
    entries.push({ id: e.id, startHour: e.startHour, durationHours: e.durationHours as number });
  }
  return { format: 1, id: x.id, epoch: x.epoch as number, periodDays: x.periodDays as number, entries };
}

/** The built-in events with this schedule's timing (a copy; names, text, effects and goals are the built-in ones). */
export function applyEventSchedule(builtIn: EventsDef, s: EventSchedule): EventsDef {
  const byId = new Map(builtIn.schedule.map((e) => [e.id, e]));
  return {
    epoch: s.epoch,
    periodDays: s.periodDays,
    schedule: s.entries.map((e) => ({ ...structuredClone(byId.get(e.id)!), startHour: e.startHour, durationHours: e.durationHours })),
  };
}

/** Same schedule (for "nothing changed")? */
export function sameSchedule(a: EventSchedule | null, b: EventSchedule | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
