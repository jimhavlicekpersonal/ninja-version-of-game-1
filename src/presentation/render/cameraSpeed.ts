/**
 * The player's camera speeds (Settings → Graphics), per device: how far the map moves for a drag (and the glide
 * after it), and how strongly the wheel, the +/− keys and a pinch zoom. Both are multipliers, 1 = the original feel.
 * Cached in memory so the per-frame pointer code does not touch storage.
 */
export const CAMERA_SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;
const PAN_KEY = 'tk.panSpeed';
const ZOOM_KEY = 'tk.zoomSpeed';

function valid(v: number): number {
  return (CAMERA_SPEEDS as readonly number[]).includes(v) ? v : 1;
}

function load(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? 1 : valid(Number(raw));
  } catch {
    return 1;
  }
}

function store(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* storage blocked: this session only */
  }
}

let pan: number | null = null;
let zoom: number | null = null;

export function panSpeed(): number {
  return (pan ??= load(PAN_KEY));
}

export function zoomSpeed(): number {
  return (zoom ??= load(ZOOM_KEY));
}

export function setPanSpeed(v: number): void {
  pan = valid(v);
  store(PAN_KEY, pan);
}

export function setZoomSpeed(v: number): void {
  zoom = valid(v);
  store(ZOOM_KEY, zoom);
}

/** One zoom step (wheel notch or key) as a factor: `base` > 1 zooms in, < 1 out, scaled by the zoom speed. */
export const zoomStep = (base: number): number => Math.pow(base, zoomSpeed());

/** Wheel distance of one mouse notch, in CSS pixels (Chrome, Edge and Safari report 100; Firefox 3 lines). */
const NOTCH_PX = 100;
const LINE_PX = NOTCH_PX / 3;
const PAGE_PX = 800;
/** A trackpad pinch arrives as a ctrl+wheel with small deltas: each pixel counts this much more than a scroll. */
const PINCH_GAIN = 5;

/**
 * The zoom factor for one wheel event (STB-N2). It follows the wheel's distance, not only its direction: a mouse notch
 * (100 px) is the old step (×0.85 out, ×1.18 in), and a trackpad's many small events add up to the same over the same
 * distance instead of a whole notch each. `deltaMode` lines and pages are turned into pixels; one event is capped at
 * one notch, so a fast flick or a ctrl+wheel cannot jump. Scaled by the zoom speed like every other step.
 */
export function wheelZoomFactor(dy: number, deltaMode = 0, ctrlKey = false): number {
  if (!Number.isFinite(dy) || dy === 0) return 1;
  const px = Math.abs(dy) * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1) * (ctrlKey ? PINCH_GAIN : 1);
  const notches = Math.min(px, NOTCH_PX) / NOTCH_PX;
  return zoomStep(Math.pow(dy > 0 ? 0.85 : 1.18, notches));
}

/** A pinch's zoom factor for the fingers' distance ratio, scaled by the zoom speed. */
export const pinchFactor = (ratio: number): number => Math.pow(ratio, zoomSpeed());

/** Forget the cached values (tests). */
export function resetCameraSpeedCache(): void {
  pan = null;
  zoom = null;
}

/** The browser wheel event's `deltaMode` behind a Phaser pointer (0, pixels, when unknown). */
export const wheelMode = (p: { event?: unknown }): number => (p.event as { deltaMode?: number } | undefined)?.deltaMode ?? 0;

/** Whether a wheel event is a trackpad pinch (browsers send it as ctrl+wheel). */
export const wheelPinch = (p: { event?: unknown }): boolean => Boolean((p.event as { ctrlKey?: boolean } | undefined)?.ctrlKey);
