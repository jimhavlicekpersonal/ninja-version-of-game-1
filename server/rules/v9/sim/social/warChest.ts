/** Beast Mode GT-13: war chests split by the member's own stars (Alliance Wars online and offline, Gang Wars). */
import type { Cost, ResourceKind } from '../types';

/** Beast Mode GT-13: a chest with `share` of it paid by the member's own stars (0..1); no `starShare`: the whole chest. */
export function byOwnStars(chest: Cost, share: number | undefined, starShare: number | undefined): Cost {
  if (starShare === undefined || !share) return chest;
  const f = 1 - share + share * Math.max(0, Math.min(1, starShare));
  const out: Cost = {};
  for (const [k, v] of Object.entries(chest) as [ResourceKind, number][]) out[k] = Math.floor(v * f);
  return out;
}

/** Beast Mode GT-13: a member's own-star share in a war: stars won over `attacks` x 3. */
export function ownStarShare(stars: number, attacks: number): number {
  return attacks > 0 ? Math.max(0, Math.min(1, stars / (attacks * 3))) : 0;
}

