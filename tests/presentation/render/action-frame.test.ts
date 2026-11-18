/**
 * P6-11 (PLY-05): the action frame puts the fight inside the HUD-free area, closer than the entry fit and never
 * closer than ACTION_MAX_ZOOM.
 */
import { describe, expect, it } from 'vitest';
import { ACTION_MAX_ZOOM, ACTION_PAD, actionShot } from '../../../src/presentation/render/cameraFrame';

const phone = { left: 0, top: 120, right: 360, bottom: 470, cssW: 360, cssH: 640 };

describe('the action frame (P6-11)', () => {
  it('a squad at one tower is framed far closer than the entry fit (0.14)', () => {
    const s = actionShot({ x0: 1000, y0: 800, x1: 1300, y1: 950 }, phone, 0.14);
    expect(s.zoom).toBeGreaterThan(0.4);
    expect(s.zoom).toBeLessThanOrEqual(ACTION_MAX_ZOOM);
  });

  it('the padded box fits inside the free area, centred in it', () => {
    const box = { x0: 400, y0: 300, x1: 2400, y1: 1500 };
    const s = actionShot(box, phone, 0.1);
    const w = (box.x1 - box.x0 + 2 * ACTION_PAD) * s.zoom;
    const h = (box.y1 - box.y0 + 2 * ACTION_PAD) * s.zoom;
    expect(w).toBeLessThanOrEqual(phone.right - phone.left + 1e-6);
    expect(h).toBeLessThanOrEqual(phone.bottom - phone.top + 1e-6);
    // The box's middle lands on the free area's middle.
    const sx = ((box.x0 + box.x1) / 2 - s.x) * s.zoom + phone.cssW / 2;
    const sy = ((box.y0 + box.y1) / 2 - s.y) * s.zoom + phone.cssH / 2;
    expect(sx).toBeCloseTo((phone.left + phone.right) / 2, 6);
    expect(sy).toBeCloseTo((phone.top + phone.bottom) / 2, 6);
  });

  it('never goes below the entry fit, and one warrior is not a close-up', () => {
    expect(actionShot({ x0: 0, y0: 0, x1: 9000, y1: 9000 }, phone, 0.14).zoom).toBe(0.14);
    expect(actionShot({ x0: 50, y0: 50, x1: 50, y1: 50 }, phone, 0.14).zoom).toBe(ACTION_MAX_ZOOM);
  });
});
