/**
 * Beast Mode 2026-11-21 GT-04: find the factor on one warrior's HP and damage (every level, as `rolecut.mjs` scales a
 * role) that puts its Keep 15 kit-lab score (`kitValue`, the gate in kits-tiers.test.ts) at or above a target.
 * In memory only; `applyWarriorScale` writes the chosen factor to troops.json and roster.json.
 */
import type { GameData } from '../../src/gameplay/sim/types';
import { kitValue } from './kitValue';

export function scaled(data: GameData, id: string, f: number): GameData {
  const d = structuredClone(data);
  for (const lv of d.troops[id].levels) {
    lv.hp = Math.round(lv.hp * f);
    lv.damage = Math.round(lv.damage * f * 10) / 10;
  }
  return d;
}

export function scoreAt(data: GameData, id: string, f = 1, keep = 15): number {
  return kitValue(id, keep, f === 1 ? data : scaled(data, id, f)).score;
}

/** Smallest factor in [lo, hi] (to 0.01) whose score reaches `target`; null if even `hi` does not. */
export function factorFor(data: GameData, id: string, target: number, lo = 1, hi = 1.6): { f: number; score: number } | null {
  const top = scoreAt(data, id, hi);
  if (top < target) return null;
  let a = lo;
  let b = hi;
  let best = { f: hi, score: top };
  const base = scoreAt(data, id, lo);
  if (base >= target) return { f: lo, score: base };
  while (b - a > 0.01) {
    const m = Math.round(((a + b) / 2) * 100) / 100;
    const s = scoreAt(data, id, m);
    if (s >= target) {
      b = m;
      best = { f: m, score: s };
    } else a = m;
  }
  return best;
}
