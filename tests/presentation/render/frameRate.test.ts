/**
 * Device F2 / R03 (2026-11-13 runtime batch): frames drawn, not display frames; 120 Hz phones
 * limited to the profile's 60; the battle verdict scaled to the display; a live downgrade.
 */
import { describe, expect, it } from 'vitest';
import { FrameMeter, expectedFps, limitFor, pacing, refreshHzFrom, setActiveLimit, slowDown } from '../../../src/presentation/render/frameRate';
import { FPS_SAMPLES, slowBattles } from '../../../src/presentation/render/quality';

describe('frame meter', () => {
  it('counts frames drawn in the last second, not display frames', () => {
    const m = new FrameMeter();
    // A 60 Hz display under a 30 FPS limit: Phaser draws every other frame.
    for (let i = 0; i < 120; i++) if (i % 2 === 0) m.tick(i * 16.67);
    const fps = m.fps(120 * 16.67);
    expect(fps).toBeGreaterThanOrEqual(29);
    expect(fps).toBeLessThanOrEqual(31);
    // Nothing drawn for a second: 0.
    expect(m.fps(120 * 16.67 + 1001)).toBe(0);
  });
});

describe('display refresh', () => {
  it('reads 60, 90 and 120 Hz from frame intervals and ignores stalls', () => {
    expect(refreshHzFrom(Array(30).fill(16.7))).toBeCloseTo(60, 0);
    expect(refreshHzFrom([...Array(28).fill(8.33), 250, 400])).toBeCloseTo(120, 0);
    expect(refreshHzFrom(Array(30).fill(11.1))).toBeCloseTo(90, 0);
    expect(refreshHzFrom([])).toBe(60);
  });

  it('limits high to 60 only on displays of 100 Hz or more; low keeps its 30', () => {
    expect(limitFor(60, 120)).toBe(64);
    expect(limitFor(60, 60)).toBe(1000);
    expect(limitFor(60, 90)).toBe(1000); // 45 FPS would be worse than 90
    expect(limitFor(30, 120)).toBe(31);
    // Two 120 Hz frames, even a little short, always reach the limit: 60 FPS, never 40.
    expect(2 * 8.0).toBeGreaterThanOrEqual(1000 / limitFor(60, 120));
  });

  it('judges battles against what the display can show', () => {
    expect(expectedFps(60, 120)).toBe(60);
    expect(expectedFps(60, 50)).toBe(50);
    const at = (fps: number) => Array(FPS_SAMPLES).fill(fps);
    expect(slowBattles(at(38))).toBe(true);
    expect(slowBattles(at(45))).toBe(false);
    // A 50 Hz display drawing 38 FPS keeps up with most of what it can show.
    expect(slowBattles(at(38), 50)).toBe(false);
    expect(slowBattles(at(30), 50)).toBe(true);
  });
});

describe('live downgrade', () => {
  it('drops the loop to 30 FPS for the session, never raises it, and idling returns to it', () => {
    const loop = { _limitRate: 1, hasFpsLimit: true };
    setActiveLimit(loop, 1000);
    slowDown(loop);
    expect(loop._limitRate).toBeCloseTo(1000 / 31);
    expect(pacing.activeMs).toBeCloseTo(1000 / 31);
    slowDown(loop);
    expect(loop._limitRate).toBeCloseTo(1000 / 31);
    const unlimited = { _limitRate: 0, hasFpsLimit: false };
    slowDown(unlimited);
    expect(unlimited._limitRate).toBe(0);
  });
});
