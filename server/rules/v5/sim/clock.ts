/**
 * All game time comes from a Clock. Timers store absolute timestamps
 * (startedAt / endsAt, in epoch milliseconds) and never count down in a loop.
 */
export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** A clock that only moves when told to. Used by tests to fast-forward time. */
export class FakeClock implements Clock {
  private t: number;
  constructor(start = Date.UTC(2026, 0, 1, 12, 0, 0)) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  advanceSeconds(s: number): void {
    this.t += s * 1000;
  }
  advanceHours(h: number): void {
    this.t += h * 3_600_000;
  }
  set(t: number): void {
    this.t = t;
  }
}

/** Wraps another clock and adds an offset (used by the debug "skip time" tool). */
export class OffsetClock implements Clock {
  constructor(
    private readonly base: Clock,
    private readonly getOffsetMs: () => number,
  ) {}
  now(): number {
    return this.base.now() + this.getOffsetMs();
  }
}

export const MS_PER_SECOND = 1000;
export const MS_PER_HOUR = 3_600_000;
