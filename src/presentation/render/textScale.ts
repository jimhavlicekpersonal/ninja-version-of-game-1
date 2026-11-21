/**
 * Beast Mode 2026-11-21 UX-08: the player's text size (100, 115 or 130 %), per device. The page's root font size
 * follows it (every HUD size is rem); `src/backend/pwa/boot.js` applies it before the first paint so the splash does
 * too, and the canvas labels scale their pixel sizes by it.
 */
export const TEXT_SCALES = [1, 1.15, 1.3] as const;
const KEY = 'tk.textScale';

export function textScale(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (TEXT_SCALES as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

/** Store and apply at once (HUD); the map's labels follow from the next scene start. */
export function setTextScale(v: number): void {
  const scale = (TEXT_SCALES as readonly number[]).includes(v) ? v : 1;
  try {
    localStorage.setItem(KEY, String(scale));
  } catch {
    /* storage blocked: this session only */
  }
  if (typeof document !== 'undefined') document.documentElement.style.fontSize = scale === 1 ? '' : `${Math.round(scale * 100)}%`;
}

/** A canvas font size in px, scaled. */
export const scaledPx = (px: number): string => `${Math.round(px * textScale())}px`;
