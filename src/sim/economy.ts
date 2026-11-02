/** Moonstone prices for skipping time and buying missing resources, from curves in store.json. */
import type { Cost, GameData, ResourceKind } from './types';

/** Piecewise-linear interpolation through sorted (x, y) points; extrapolates the last segment. */
export function interpolate(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  const [x0, y0] = points[points.length - 2];
  const [x1, y1] = points[points.length - 1];
  return y1 + ((x - x1) * (y1 - y0)) / (x1 - x0);
}

/** Moonstones to finish `seconds` of waiting right now (at least 1 if any time is left). */
export function skipCost(seconds: number, data: GameData): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.ceil(interpolate(data.store.skipCurve, seconds)));
}

/** Moonstones to buy `amount` of a soft resource. */
export function topUpOne(amount: number, data: GameData): number {
  if (amount <= 0) return 0;
  return Math.max(1, Math.ceil(interpolate(data.store.topUpCurve, amount)));
}

export function topUpCost(missing: Cost, data: GameData): number {
  let total = 0;
  for (const [k, v] of Object.entries(missing) as [ResourceKind, number][]) {
    if (k === 'moonstones') continue;
    total += topUpOne(v, data);
  }
  return total;
}
