/**
 * Limited-time events on a fixed, repeating schedule (events.json). Start and
 * end times come only from the schedule: nothing a player does (or doesn't
 * do) moves, resets or extends them, so every countdown shown is real.
 */
import type { EventEffect, GameData } from './types';

const HOUR = 3_600_000;

export interface EventWindow {
  /** Schedule entry id plus the repeat number, unique per occurrence. */
  key: string;
  id: string;
  name: string;
  description: string;
  start: number;
  end: number;
  effect: EventEffect;
}

function periodMs(data: GameData): number {
  return data.events.periodDays * 24 * HOUR;
}

/** Every event occurrence overlapping [from, to). */
export function eventsBetween(from: number, to: number, data: GameData): EventWindow[] {
  const ev = data.events;
  const p = periodMs(data);
  const out: EventWindow[] = [];
  const longest = Math.max(0, ...ev.schedule.map((e) => (e.startHour + e.durationHours) * HOUR));
  const first = Math.floor((from - ev.epoch - longest) / p);
  const last = Math.floor((to - ev.epoch) / p);
  for (let k = first; k <= last; k++) {
    for (const e of ev.schedule) {
      const start = ev.epoch + k * p + e.startHour * HOUR;
      const end = start + e.durationHours * HOUR;
      if (end > from && start < to) out.push({ key: `${e.id}#${k}`, id: e.id, name: e.name, description: e.description, start, end, effect: e.effect });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Events running at time t (start inclusive, end exclusive). */
export function activeEvents(t: number, data: GameData): EventWindow[] {
  return eventsBetween(t, t + 1, data);
}

/** The next `count` events that start after t. */
export function upcomingEvents(t: number, count: number, data: GameData): EventWindow[] {
  const out: EventWindow[] = [];
  for (let span = periodMs(data); out.length < count && span <= periodMs(data) * 8; span *= 2) {
    out.length = 0;
    for (const e of eventsBetween(t, t + span, data)) if (e.start > t && out.length < count) out.push(e);
  }
  return out;
}

/** Combined effect of everything running at t. */
export function eventEffect(t: number, data: GameData): Required<EventEffect> {
  const out: Required<EventEffect> = { collectBonus: 0, raidLootBonus: 0, trainingDiscount: 0 };
  for (const e of activeEvents(t, data)) {
    out.collectBonus += e.effect.collectBonus ?? 0;
    out.raidLootBonus += e.effect.raidLootBonus ?? 0;
    out.trainingDiscount = Math.max(out.trainingDiscount, e.effect.trainingDiscount ?? 0);
  }
  return out;
}
