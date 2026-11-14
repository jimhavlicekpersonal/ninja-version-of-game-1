/**
 * Battle motion as pure arithmetic (no Phaser), read from the battle state each frame and never fed back into it:
 * warrior poses (art audit F6), building damage stages (F7) and defense aim (F27). Visual only; the simulation does
 * not know about any of it.
 */

/** `prefers-reduced-motion: reduce`, read live (false outside a browser). */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface Pose {
  /** Offset in world px (x toward where the warrior faces, y up is negative). */
  dx: number;
  dy: number;
  /** Scale multipliers on the warrior's base scale. */
  sx: number;
  sy: number;
  /** Lean in degrees (positive leans toward where the warrior faces). */
  lean: number;
}

export type PoseState = 'idle' | 'walk' | 'attack';

export const NEUTRAL: Readonly<Pose> = { dx: 0, dy: 0, sx: 1, sy: 1, lean: 0 };

/** One step (two per stride) and one attack swing, in ms. */
export const STEP_MS = 280;
export const SWING_MS = 520;

/**
 * A cheap procedural cycle for a single-frame warrior sprite (art audit F6).
 * - walk: a hop per step (up 3 px), squash as the foot lands and stretch as it lifts, a forward lean of ~6°;
 * - attack: a wind-up (lean back, crouch), a fast strike (lunge 3 px, lean in 10°, wide squash) and a recovery;
 * - idle: a slow breath (1.5 % stretch).
 * `phase` desynchronises warriors (their index). Reduced motion: no hop, lean or lunge, only a small strike squash so
 * an attack still reads. `lean: false` (the low profile) drops the rotation and keeps hop and squash.
 */
export function warriorPose(state: PoseState, now: number, phase: number, opts: { reduced?: boolean; lean?: boolean } = {}): Pose {
  const leanOn = opts.lean !== false && !opts.reduced;
  if (state === 'walk') {
    if (opts.reduced) return { ...NEUTRAL };
    const p = (now / STEP_MS + phase * 0.37) % 1; // 0 = foot down, 0.5 = top of the hop
    const hop = Math.sin(p * Math.PI); // 0..1..0
    const land = Math.max(0, 1 - p * 6) + Math.max(0, (p - 0.86) * 7); // short squash around foot-down
    return { dx: 0, dy: -hop * 3, sx: 1 + land * 0.06 - hop * 0.02, sy: 1 - land * 0.08 + hop * 0.04, lean: leanOn ? 6 : 0 };
  }
  if (state === 'attack') {
    const p = (now / SWING_MS + phase * 0.29) % 1;
    if (opts.reduced) {
      const hit = p > 0.55 && p < 0.75 ? 1 : 0;
      return { dx: 0, dy: 0, sx: 1 + hit * 0.04, sy: 1 - hit * 0.03, lean: 0 };
    }
    if (p < 0.55) {
      // Wind-up: lean back and crouch a little.
      const k = Math.sin((p / 0.55) * (Math.PI / 2));
      return { dx: -k * 1.5, dy: 0, sx: 1 + k * 0.03, sy: 1 - k * 0.05, lean: leanOn ? -7 * k : 0 };
    }
    if (p < 0.72) {
      // Strike: lunge in, flatten wide.
      const k = Math.sin(((p - 0.55) / 0.17) * (Math.PI / 2));
      return { dx: -1.5 + k * 4.5, dy: 0, sx: 1.03 + k * 0.07, sy: 0.95 - k * 0.03, lean: leanOn ? -7 + k * 17 : 0 };
    }
    // Recover back to neutral.
    const k = (p - 0.72) / 0.28;
    const e = 1 - k * k;
    return { dx: 3 * e, dy: 0, sx: 1 + 0.1 * e, sy: 1 - 0.08 * e, lean: leanOn ? 10 * e : 0 };
  }
  if (opts.reduced) return { ...NEUTRAL };
  const b = Math.sin((now / 900 + phase * 0.41) * Math.PI * 2);
  return { dx: 0, dy: 0, sx: 1 - b * 0.006, sy: 1 + b * 0.015, lean: 0 };
}

/** Building damage stage (art audit F7): 0 above 66 % health, 1 at 66 % or less, 2 at 33 % or less (ruins at 0). */
export function damageStage(hp: number, maxHp: number): 0 | 1 | 2 {
  if (maxHp <= 0 || hp >= maxHp) return 0;
  const f = hp / maxHp;
  return f <= 1 / 3 ? 2 : f <= 2 / 3 ? 1 : 0;
}

/** Multiply tint per damage stage: scorched and darker as it falls apart (WebGL; the Canvas renderer ignores tint). */
export const DAMAGE_TINT = [0xffffff, 0xe6ddd2, 0xb9aea3] as const;

/**
 * Turn an angle (radians) toward a target angle by at most `maxStep`, the short way round (art audit F27: a defense's
 * barrel swings toward the warrior it shoots at instead of snapping).
 */
export function turnToward(angle: number, target: number, maxStep: number): number {
  let d = (target - angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}
