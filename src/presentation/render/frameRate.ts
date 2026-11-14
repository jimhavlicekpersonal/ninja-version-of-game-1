/**
 * Frames actually drawn, the display's refresh rate, and the loop's frame limit (device F2, R03;
 * 2026-11-13 runtime batch).
 *
 * - Phaser's `game.loop.actualFps` counts every display frame (requestAnimationFrame), also the
 *   ones its frame limit skips: on low (30 FPS limit) or in the idle village (~20 FPS) it read 60,
 *   and the HUD readout and the battle frame-rate check believed it. `frames` counts rendered
 *   frames (main.ts feeds it from `POST_RENDER`).
 * - A 120 Hz phone ran the high profile at 120 FPS (the loop had no real limit), twice the work of
 *   the 60 FPS the profile is meant for, and was then judged by the same 40 FPS line. On a display
 *   of 100 Hz or more, high is limited to 60 (`limitFor`), and the battle check compares the drawn
 *   rate with what this display and profile can show (`expectedFps`).
 * - `pacing` holds the frame limit the village returns to after idling; a live downgrade
 *   (`slowDown`) lowers it for the rest of the session when battles were measured slow.
 */

/** Rendered frames per second over a sliding window. Pure: tested without a browser. */
export class FrameMeter {
  private times: number[] = [];

  constructor(private readonly windowMs = 1000) {}

  /** A frame was drawn at `now` (ms). */
  tick(now: number): void {
    this.times.push(now);
    const from = now - this.windowMs;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] <= from) drop++;
    if (drop) this.times.splice(0, drop);
  }

  /** Frames drawn in the last window, as a per-second rate (0 before any frame). */
  fps(now: number): number {
    const from = now - this.windowMs;
    let n = 0;
    for (const t of this.times) if (t > from) n++;
    return (n * 1000) / this.windowMs;
  }
}

/** The game's rendered-frame meter (fed by main.ts). */
export const frames = new FrameMeter();

/** Median interval of `deltas` (ms) as a refresh rate in Hz; 60 when there is nothing to go on. */
export function refreshHzFrom(deltas: readonly number[]): number {
  const good = deltas.filter((d) => d > 2 && d < 100).sort((a, b) => a - b);
  if (good.length < 5) return 60;
  return 1000 / good[Math.floor(good.length / 2)];
}

let displayHz = 60;

/** The display's refresh rate as measured at start (60 until then). */
export function refreshHz(): number {
  return displayHz;
}

/** Measure the display's refresh rate from ~30 animation frames (about half a second). */
export function measureRefreshHz(frameCount = 30): Promise<number> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve(displayHz);
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = -1;
    const step = (t: number) => {
      if (last >= 0) deltas.push(t - last);
      last = t;
      if (deltas.length < frameCount) requestAnimationFrame(step);
      else resolve((displayHz = refreshHzFrom(deltas)));
    };
    requestAnimationFrame(step);
  });
}

/**
 * The loop's frame limit for a profile on a display: the profile's rate where the display is
 * faster than it (a limit just above it, so a 60/90/120 Hz display steps every 2nd/3rd/4th
 * frame), otherwise no real limit (1000).
 */
export function limitFor(profileFps: number, hz: number): number {
  if (profileFps < 60) return profileFps + 1;
  // 64, not 61: two 120 Hz frames (2 x 8.3 ms) must always reach the limit, despite jitter.
  return hz >= 100 ? 64 : 1000;
}

/** What a display at `hz` can show for a profile's target rate. */
export function expectedFps(profileFps: number, hz: number): number {
  return Math.min(profileFps, hz);
}

/** The frame limit (ms per frame) the village uses while active; main.ts's idle throttle returns to it. */
export const pacing = { activeMs: 0 };

type Loop = { _limitRate: number; hasFpsLimit: boolean };

/** Set the active frame limit (`limit` frames per second) now and for later returns from idle. */
export function setActiveLimit(loop: Loop, limit: number): void {
  pacing.activeMs = 1000 / limit;
  if (loop.hasFpsLimit) loop._limitRate = pacing.activeMs;
}

/**
 * A live downgrade after slow battles were measured: the loop drops to 30 FPS for the rest of the
 * session (textures and canvas size change at the next start). Never raises the rate.
 */
export function slowDown(loop: Loop): void {
  if (!loop.hasFpsLimit || pacing.activeMs >= 1000 / 31) return;
  setActiveLimit(loop, 31);
}
