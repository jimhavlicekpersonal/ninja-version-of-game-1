/**
 * Beast Mode 2026-11-21 STB-03: Phaser asks for the next animation frame only after the step returns, so one throw in
 * a scene's update or render stopped the map for good (the DOM HUD kept going over a frozen canvas). The guard wraps
 * the loop's step: an error is reported and the loop restarted (sleep, then wake schedules the next frame); after
 * `maxErrors` errors within `windowMs` it stops and calls `onFatal` (save, then a reload card). Presentation only: a
 * battle's ticks are never re-run here (BattleSession owns them).
 */
export interface GuardableLoop {
  callback: (time: number, delta: number) => void;
  sleep(): void;
  wake(seamless?: boolean): void;
}

export interface FrameGuardOptions {
  onError(e: unknown, count: number): void;
  onFatal(e: unknown): void;
  now?: () => number;
  maxErrors?: number;
  windowMs?: number;
}

export function guardLoop(loop: GuardableLoop, o: FrameGuardOptions): () => void {
  const step = loop.callback;
  const now = o.now ?? (() => Date.now());
  const max = o.maxErrors ?? 3;
  const windowMs = o.windowMs ?? 10_000;
  let times: number[] = [];
  let stopped = false;
  loop.callback = (time, delta) => {
    if (stopped) return;
    try {
      step.call(loop, time, delta);
    } catch (e) {
      const t = now();
      times = [...times.filter((x) => t - x < windowMs), t];
      o.onError(e, times.length);
      if (times.length > max) {
        stopped = true;
        try {
          loop.sleep();
        } catch {
          /* already stopped */
        }
        o.onFatal(e);
        return;
      }
      // The frame that threw never asked for the next one: restart the loop's frame callback.
      setTimeout(() => {
        if (stopped) return;
        try {
          loop.sleep();
          loop.wake(true);
        } catch (e2) {
          o.onError(e2, times.length);
        }
      }, 0);
    }
  };
  return () => {
    loop.callback = step;
  };
}
