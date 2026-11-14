/**
 * Floating battle callouts (ability names, counter effects) without overlap (art audit F8). Callouts used to be
 * throttled per unit only, so three warriors casting "Moon Cut" side by side printed three labels on top of each
 * other. A new callout now goes through `placeCallout` against the labels still on screen:
 *
 * - the same text near a live copy of it is merged into that copy (`merge`: the caller refreshes it);
 * - otherwise it stacks above whatever it would overlap (`place` with the screen y to use);
 * - when `MAX_LIVE` labels already show, or the stack would leave the screen, it is dropped.
 *
 * Pure (no Phaser): boxes are CSS px on screen; `y` is the label's bottom edge (labels hang from origin 0.5, 1).
 */
export interface CalloutBox {
  text: string;
  /** Centre x and bottom y, CSS px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CalloutPlacement = { kind: 'place'; y: number } | { kind: 'merge'; index: number } | { kind: 'drop' };

/** Labels on screen at once; more than this is noise at the moment the player decides where to drop. */
export const MAX_LIVE = 4;
/** The same text within this distance (CSS px, either axis) is one callout. */
export const MERGE_PX = 80;
/** Space kept between stacked labels. */
export const GAP_PX = 2;

function overlaps(a: CalloutBox, b: CalloutBox): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP_PX && a.y - a.h - GAP_PX < b.y && b.y - b.h - GAP_PX < a.y;
}

/** Where a new label goes, given the labels still showing (any order). `top` is the highest y a label may reach. */
export function placeCallout(live: readonly CalloutBox[], next: CalloutBox, top = 0): CalloutPlacement {
  const twin = live.findIndex((b) => b.text === next.text && Math.abs(b.x - next.x) < MERGE_PX && Math.abs(b.y - next.y) < MERGE_PX);
  if (twin >= 0) return { kind: 'merge', index: twin };
  if (live.length >= MAX_LIVE) return { kind: 'drop' };
  const box = { ...next };
  // Move up past each label it hits until it hits none; every step moves strictly up, so this ends.
  for (let guard = 0; guard <= live.length; guard++) {
    const hit = live.filter((b) => overlaps(box, b));
    if (!hit.length) return box.y - box.h < top ? { kind: 'drop' } : { kind: 'place', y: box.y };
    box.y = Math.min(...hit.map((b) => b.y - b.h)) - GAP_PX;
  }
  return { kind: 'drop' };
}
