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

/**
 * Moonstones to finish `seconds` of army training at a Keep. Skipping training and raiding again
 * turns Jade into loot, so it is priced on the same Keep scale as a top-up (store.json
 * `trainingSkipScaleByHall`), never below the plain time price.
 */
export function trainingSkipCost(seconds: number, hallLevel: number, data: GameData): number {
  if (seconds <= 0) return 0;
  const t = data.store.trainingSkipScaleByHall;
  const scale = Math.max(1, t[Math.max(1, Math.min(t.length, hallLevel)) - 1] ?? 1);
  return Math.max(1, Math.ceil(interpolate(data.store.skipCurve, seconds) * scale));
}

/**
 * How much the buyer's Keep stretches the top-up curve (store.json `topUpScaleByHall`).
 * The curve is priced for Keep 5 (scale 1); later Keeps buy more per Jade, earlier ones less,
 * so a raid's worth of loot costs a similar share of a Keep's economy everywhere.
 */
export function topUpScale(hallLevel: number, data: GameData): number {
  const t = data.store.topUpScaleByHall;
  return t[Math.max(1, Math.min(t.length, hallLevel)) - 1] ?? 1;
}

/** Moonstones to buy `amount` of a soft resource at a Keep (the plain curve when `hallLevel` is left out). */
export function topUpOne(amount: number, data: GameData, hallLevel?: number): number {
  if (amount <= 0) return 0;
  const scale = hallLevel === undefined ? 1 : topUpScale(hallLevel, data);
  return Math.max(1, Math.ceil(interpolate(data.store.topUpCurve, amount / scale)));
}

export function topUpCost(missing: Cost, data: GameData, hallLevel?: number): number {
  let total = 0;
  for (const [k, v] of Object.entries(missing) as [ResourceKind, number][]) {
    if (k === 'moonstones') continue;
    total += topUpOne(v, data, hallLevel);
  }
  return total;
}

/** Reward multiplier for the player's Elder Toadstool level (economy.json `rewardScaleByHall`). */
export function rewardScale(hallLevel: number, data: GameData): number {
  const t = data.economy.rewardScaleByHall;
  return t[Math.max(1, Math.min(t.length, hallLevel)) - 1] ?? 1;
}

/** Scale the soft resources of a fixed reward to the player's hall level; Moonstones stay as they are. */
export function scaleReward(reward: Cost, hallLevel: number, data: GameData): Cost {
  const m = rewardScale(hallLevel, data);
  const out: Cost = {};
  for (const [k, v] of Object.entries(reward) as [ResourceKind, number][]) {
    if (typeof v !== 'number') continue;
    out[k] = k === 'moonstones' ? v : Math.round(v * m);
  }
  return out;
}
