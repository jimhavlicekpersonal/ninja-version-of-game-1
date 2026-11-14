import { describe, expect, it } from 'vitest';
import { NEUTRAL, STEP_MS, SWING_MS, damageStage, turnToward, warriorPose } from '../../../src/presentation/render/motion';

const sample = (state: 'walk' | 'attack' | 'idle', ms: number, opts = {}) => Array.from({ length: 40 }, (_, k) => warriorPose(state, (k / 40) * ms, 0, opts));

describe('warrior poses (art audit F6)', () => {
  it('walking hops and squashes within a few pixels and leans forward', () => {
    const poses = sample('walk', STEP_MS);
    const dys = poses.map((p) => p.dy);
    expect(Math.min(...dys)).toBeLessThan(-2.5);
    expect(Math.max(...dys)).toBeLessThanOrEqual(0);
    expect(Math.min(...poses.map((p) => p.sy))).toBeLessThan(0.97);
    for (const p of poses) {
      expect(p.lean).toBe(6);
      expect(Math.abs(1 - p.sx)).toBeLessThan(0.1);
      expect(Math.abs(1 - p.sy)).toBeLessThan(0.1);
    }
  });

  it('an attack winds up, strikes forward and comes back', () => {
    const poses = sample('attack', SWING_MS);
    expect(Math.min(...poses.map((p) => p.lean))).toBeLessThan(-5);
    expect(Math.max(...poses.map((p) => p.lean))).toBeGreaterThan(8);
    expect(Math.max(...poses.map((p) => p.dx))).toBeGreaterThan(2.5);
    expect(Math.max(...poses.map((p) => p.sx))).toBeGreaterThan(1.08);
    // The cycle is continuous where it wraps.
    const end = warriorPose('attack', SWING_MS - 0.001, 0);
    const start = warriorPose('attack', 0, 0);
    expect(Math.abs(end.dx - start.dx)).toBeLessThan(0.1);
    expect(Math.abs(end.lean - start.lean)).toBeLessThan(0.5);
  });

  it('reduced motion keeps warriors still except a small strike squash', () => {
    for (const p of sample('walk', STEP_MS, { reduced: true })) expect(p).toEqual(NEUTRAL);
    for (const p of sample('idle', 900, { reduced: true })) expect(p).toEqual(NEUTRAL);
    const att = sample('attack', SWING_MS, { reduced: true });
    for (const p of att) expect([p.dx, p.dy, p.lean]).toEqual([0, 0, 0]);
    expect(Math.max(...att.map((p) => p.sx))).toBeGreaterThan(1);
  });

  it('the low profile drops the lean only', () => {
    for (const p of sample('attack', SWING_MS, { lean: false })) expect(p.lean).toBe(0);
    expect(Math.min(...sample('walk', STEP_MS, { lean: false }).map((p) => p.dy))).toBeLessThan(-2.5);
  });
});

describe('building damage stages (art audit F7)', () => {
  it('changes at two thirds and one third of health', () => {
    expect(damageStage(100, 100)).toBe(0);
    expect(damageStage(67, 100)).toBe(0);
    expect(damageStage(66, 100)).toBe(1);
    expect(damageStage(34, 100)).toBe(1);
    expect(damageStage(33, 100)).toBe(2);
    expect(damageStage(1, 100)).toBe(2);
    expect(damageStage(5, 0)).toBe(0);
  });
});

describe('defense aim (art audit F27)', () => {
  it('turns the short way round, by at most the step', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
    // From just under +pi to just over -pi is a small step across the seam, not a full turn back.
    const a = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(a).toBeCloseTo(Math.PI - 0.05);
  });
});
