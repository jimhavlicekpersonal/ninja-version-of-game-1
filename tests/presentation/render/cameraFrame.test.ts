import { describe, expect, it } from 'vitest';
import { BOTTOM_BAND_PX, PORTRAIT_CLEAR, battleOpening, villageStartFrame } from '../../../src/presentation/render/cameraFrame';

// The Keep image at zoom 1 (world px), as measured in the sandbox's new village.
const KEEP = { keepW: 256, keepH: 324 };

describe('village start frame during the tutorial (art audit F13)', () => {
  it('keeps the usual framing outside the tutorial', () => {
    expect(villageStartFrame({ cssW: 360, cssH: 640, ...KEEP, zoom: 0.625, minZoom: 0.3, tutorial: false })).toBeNull();
  });

  for (const [w, h, zoom] of [[320, 568, 0.556], [360, 640, 0.625], [390, 844, 0.677]]) {
    it(`puts the Keep below the bubble and above the buttons at ${w}x${h}`, () => {
      const f = villageStartFrame({ cssW: w, cssH: h, ...KEEP, zoom, minZoom: 0.3, tutorial: true })!;
      const top = f.keepY - (KEEP.keepH * f.zoom) / 2;
      const bottom = f.keepY + (KEEP.keepH * f.zoom) / 2;
      expect(top).toBeGreaterThanOrEqual(h * PORTRAIT_CLEAR - 0.01);
      expect(bottom).toBeLessThanOrEqual(h - BOTTOM_BAND_PX + 0.01);
      expect(f.keepX).toBe(w / 2);
      expect(f.zoom).toBeLessThanOrEqual(zoom);
      // Still the largest thing on screen: at least ~40 % of the width.
      expect(KEEP.keepW * f.zoom).toBeGreaterThan(w * 0.33);
    });
  }

  it('puts the Keep beside the bubble on a landscape screen', () => {
    const f = villageStartFrame({ cssW: 844, cssH: 390, ...KEEP, zoom: 0.6, minZoom: 0.3, tutorial: true })!;
    const strip = (844 - 500) / 2;
    expect(f.keepX + (KEEP.keepW * f.zoom) / 2).toBeLessThanOrEqual(strip);
    expect(f.keepX - (KEEP.keepW * f.zoom) / 2).toBeGreaterThanOrEqual(0);
  });
});

describe('battle opening shot (art audit F4)', () => {
  it('shows the base closer when the point fit is a postage stamp', () => {
    const z = battleOpening({ fitZoom: 0.14, baseW: 1200, baseH: 700, freeW: 352, freeH: 380, skip: false });
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(0.14 * 1.25);
  });

  it('does nothing when the fit is readable, for replays or reduced motion', () => {
    expect(battleOpening({ fitZoom: 0.24, baseW: 1200, baseH: 700, freeW: 800, freeH: 300, skip: false })).toBeNull();
    expect(battleOpening({ fitZoom: 0.14, baseW: 1200, baseH: 700, freeW: 352, freeH: 380, skip: true })).toBeNull();
    // A base as wide as the points gains nothing.
    expect(battleOpening({ fitZoom: 0.14, baseW: 2400, baseH: 1200, freeW: 352, freeH: 380, skip: false })).toBeNull();
  });
});
