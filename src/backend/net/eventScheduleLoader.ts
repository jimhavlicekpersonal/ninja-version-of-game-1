/**
 * The game's side of the server-delivered event schedule (retention audit G10, `eventSchedule.ts`).
 *
 * At start `applyCached` plays the schedule kept from the last online session (so an offline player
 * sees the same countdowns the server plays); with none, the built-in schedule. Each `/v1/hello` `offer`s what the server sends: a valid schedule is applied at
 * once and kept, none clears the kept one and brings the built-in schedule back, a refused one
 * changes nothing. Only the timing of built-in events ever changes.
 */
import type { EventsDef } from '../../gameplay/sim/types';
import type { KeyValue } from './connection';
import { forgetDataVersion } from './dataVersion';
import { applyEventSchedule, checkEventSchedule, sameSchedule, type EventSchedule } from './eventSchedule';

const KEY = 'tk.events.schedule';

export type ScheduleSource = 'built-in' | 'server';

export class EventScheduleLoader {
  private readonly builtIn: EventsDef;
  /** The schedule played now, or null for the built-in one. */
  applied: EventSchedule | null = null;
  /** Called after the schedule changed (the HUD redraws its Events pill). */
  onChange: (() => void) | null = null;

  constructor(
    private readonly kv: KeyValue,
    /** The game's data object; its `events` is replaced in place. */
    private readonly target: { events: EventsDef },
  ) {
    this.builtIn = structuredClone(target.events);
  }

  get source(): ScheduleSource {
    return this.applied ? 'server' : 'built-in';
  }

  /** Play the schedule kept from the last session, if it still checks out. Call once at start, before the village loads. */
  applyCached(): EventSchedule | null {
    let raw: unknown;
    try {
      raw = JSON.parse(this.kv.get(KEY) ?? 'null');
    } catch {
      raw = null;
    }
    if (!raw) return null;
    const s = checkEventSchedule(raw, this.builtIn);
    if ('error' in s) {
      this.kv.set(KEY, null);
      return null;
    }
    this.use(s);
    return s;
  }

  /** What `/v1/hello` sent (`events`, absent for none). */
  offer(raw: unknown): 'applied' | 'same' | 'cleared' | 'refused' | 'none' {
    if (raw === undefined || raw === null) {
      if (!this.applied && this.kv.get(KEY) === null) return 'none';
      this.kv.set(KEY, null);
      this.use(null);
      return 'cleared';
    }
    const s = checkEventSchedule(raw, this.builtIn);
    if ('error' in s) return 'refused';
    if (sameSchedule(s, this.applied)) return 'same';
    this.kv.set(KEY, JSON.stringify(s));
    this.use(s);
    return 'applied';
  }

  private use(s: EventSchedule | null): void {
    this.target.events = s ? applyEventSchedule(this.builtIn, s) : structuredClone(this.builtIn);
    forgetDataVersion(this.target);
    this.applied = s;
    this.onChange?.();
  }
}
