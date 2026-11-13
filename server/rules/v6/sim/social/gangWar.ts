/**
 * Gang War rules shared by the server and the game (roadmap steps 65-66).
 * Pure and deterministic.
 */
import { createRng, int, mixSeed, next } from '../rng';
import type { GameData } from '../types';

export type GangWarPhase = 'prep' | 'battle' | 'ended';

export function gangWarTimes(createdAt: number, data: GameData): { prepEndsAt: number; endsAt: number } {
  const g = data.social.gangWar;
  const prepEndsAt = createdAt + g.prepHours * 3_600_000;
  return { prepEndsAt, endsAt: prepEndsAt + g.battleHours * 3_600_000 };
}

export function gangWarPhase(t: number, w: { prepEndsAt: number; endsAt: number }): GangWarPhase {
  return t < w.prepEndsAt ? 'prep' : t < w.endsAt ? 'battle' : 'ended';
}

export interface BaseScore {
  stars: number;
  destruction: number;
}

/** A side's total: every enemy base counts its best result. */
export function sideTotal(best: BaseScore[]): { stars: number; destruction: number } {
  return { stars: best.reduce((s, b) => s + b.stars, 0), destruction: best.reduce((s, b) => s + b.destruction, 0) };
}

/** More stars wins; equal stars go to more total destruction. */
export function gangWarOutcome(ours: { stars: number; destruction: number }, theirs: { stars: number; destruction: number }): 'win' | 'draw' | 'loss' {
  if (ours.stars !== theirs.stars) return ours.stars > theirs.stars ? 'win' : 'loss';
  if (ours.destruction !== theirs.destruction) return ours.destruction > theirs.destruction ? 'win' : 'loss';
  return 'draw';
}

/**
 * What a generated (bot) Gang has done to our bases by time `t`:
 * deterministic from its seed, the same odds as a bot Alliance (by Keep
 * difference), spread over the battle day.
 */
export function botGangScores(seed: number, ourKeeps: number[], botKeeps: number[], start: number, end: number, t: number, data: GameData): BaseScore[] {
  const odds = data.social.groveRaid.starOdds;
  const rng = createRng(mixSeed(seed, 0x6a96));
  const best: BaseScore[] = ourKeeps.map(() => ({ stars: 0, destruction: 0 }));
  const attacks = botKeeps.length * data.social.gangWar.attacksPerMember;
  for (let i = 0; i < attacks; i++) {
    const at = start + Math.floor(next(rng) * (end - start));
    const target = int(rng, 0, ourKeeps.length - 1);
    const p3 = Math.max(0.02, Math.min(0.9, odds.base3 + (botKeeps[i % botKeeps.length] - ourKeeps[target]) * odds.perHallDiff));
    const r = next(rng);
    const stars = r < p3 ? 3 : r < p3 + odds.base2 ? 2 : r < p3 + odds.base2 + odds.base1 ? 1 : 0;
    const destruction = stars === 3 ? 100 : Math.round(stars * 25 + next(rng) * 25);
    if (at > t) continue;
    const b = best[target];
    if (stars > b.stars || (stars === b.stars && destruction > b.destruction)) best[target] = { stars, destruction };
  }
  return best;
}

/**
 * The damage a relay strike hands to the next one (roadmap step 69): each
 * building keeps `relayCarry` of what it lost, because defenders patch up
 * between strikes. A destroyed building comes back damaged, not destroyed.
 * Without this, two full strikes 3-starred nearly every base.
 */
export function carryRelayDamage(damage: Record<string, number>, data: GameData): Record<string, number> {
  const k = data.social.gangWar.relayCarry;
  const out: Record<string, number> = {};
  for (const [id, lost] of Object.entries(damage)) if (lost > 0) out[id] = lost * k;
  return out;
}
