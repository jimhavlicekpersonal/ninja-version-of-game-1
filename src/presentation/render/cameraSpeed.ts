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

/** A pinch's zoom factor for the fingers' distance ratio, scaled by the zoom speed. */
export const pinchFactor = (ratio: number): number => Math.pow(ratio, zoomSpeed());

/** Forget the cached values (tests). */
export function resetCameraSpeedCache(): void {
  pan = null;
  zoom = null;
}
