/**
 * Start cameras as pure arithmetic (no Phaser), so they can be tested.
 *
 * Village (art audit F13): during the tutorial the Sensei's bubble sits under the top bar (up to 440 px wide, centred
 * clear of the rail) and on a 320-390 px phone it is a third of the screen tall; centring the camera on the Keep put
 * the Keep under it. `villageStartFrame` places the Keep where the bubble is not: in the lower part of a portrait
 * screen, above the bottom buttons, and beside the bubble on a landscape one. Out of the tutorial the old framing
 * stays (the Keep a little below the middle).
 *
 * Battle (art audit F4): `battleOpening` decides the opening shot. The fit of every open Infiltration Point is
 * width-bound on a portrait phone (the six points span ~2,400 world px, so 360 px needs ~0.137 zoom); the opening
 * shows the base itself at a readable zoom first and then glides out to that fit, so the player still sees every point
 * before the first drop.
 */

export interface VillageFrameIn {
  /** Canvas size, CSS px. */
  cssW: number;
  cssH: number;
  /** The Keep image's size in world px (zoom 1). */
  keepW: number;
  keepH: number;
  /** The zoom the scene would use anyway (fits ~9 tiles across a phone). */
  zoom: number;
  /** Lowest zoom the scene allows. */
  minZoom: number;
  /** The tutorial bubble is showing (tutorial not done). */
  tutorial: boolean;
}

export interface VillageFrame {
  zoom: number;
  /** Where the Keep image's centre goes on screen, CSS px from the canvas's top-left. */
  keepX: number;
  keepY: number;
}

/** The bubble's widest size plus its side margins (`.tut-bubble` in styles.css: `min(440px, 100% - 24px)`), a little more for the rail. */
export const BUBBLE_SPAN_PX = 500;
/** Height the bottom buttons take on a phone (73-80 px measured at 320-390 px), plus a margin. */
export const BOTTOM_BAND_PX = 92;
/** Portrait: the Keep's top stays below this fraction of the screen (the bubble ends at 31-56 % at 320-390 px in English). */
export const PORTRAIT_CLEAR = 0.58;
/** Landscape: the top bar's height. */
export const TOP_BAND_PX = 64;

/** The tutorial framing, or null to keep the usual one. */
export function villageStartFrame(f: VillageFrameIn): VillageFrame | null {
  if (!f.tutorial || f.keepW <= 0 || f.keepH <= 0) return null;
  if (f.cssH >= f.cssW) {
    // Portrait: the band between the bubble's usual bottom and the bottom buttons.
    const top = f.cssH * PORTRAIT_CLEAR;
    const bottom = f.cssH - BOTTOM_BAND_PX;
    const room = bottom - top;
    if (room <= 40) return null;
    const zoom = Math.max(f.minZoom, Math.min(f.zoom, room / f.keepH));
    return { zoom, keepX: f.cssW / 2, keepY: bottom - (f.keepH * zoom) / 2 };
  }
  // Landscape: the strip beside the centred bubble on the start side (left), between the top bar and the buttons.
  const strip = (f.cssW - BUBBLE_SPAN_PX) / 2;
  if (strip < 80) return null;
  const height = f.cssH - TOP_BAND_PX - BOTTOM_BAND_PX;
  const zoom = Math.max(f.minZoom, Math.min(f.zoom, (strip - 16) / f.keepW, height / f.keepH));
  return { zoom, keepX: strip / 2, keepY: TOP_BAND_PX + height / 2 };
}

export interface BattleOpeningIn {
  /** Zoom that fits every open point in the free area (`BattleScene.fitEntry`). */
  fitZoom: number;
  /** World size of the base's buildings (their bounding box). */
  baseW: number;
  baseH: number;
  /** The HUD-free area, CSS px. */
  freeW: number;
  freeH: number;
  /** Replays, reduced motion and refits skip the shot. */
  skip: boolean;
}

/** A start fit under this zoom gets the opening shot (the base was a postage stamp: buildings 8-14 px). */
export const OPENING_BELOW = 0.2;
/** The shot never zooms closer than this (the base should still read as a whole). */
export const OPENING_MAX = 0.42;
/** How long the shot holds on the base and how long the glide out takes (ms). */
export const OPENING_HOLD_MS = 900;
export const OPENING_GLIDE_MS = 700;

/** The zoom of the opening shot on the base, or null for none (the fit is already readable, or it is skipped). */
export function battleOpening(o: BattleOpeningIn): number | null {
  if (o.skip || o.fitZoom >= OPENING_BELOW || o.baseW <= 0 || o.baseH <= 0) return null;
  const z = Math.min(OPENING_MAX, (o.freeW * 0.92) / o.baseW, (o.freeH * 0.92) / o.baseH);
  // Not worth a camera move unless the base gets clearly bigger.
  return z >= o.fitZoom * 1.25 ? z : null;
}
