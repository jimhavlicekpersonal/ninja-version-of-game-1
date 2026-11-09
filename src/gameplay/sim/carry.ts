/**
 * What a won raid carries home (balance audit 2026-11-08, docs/game-theory/SIMULATION_ROUND2_2026-11-09.md):
 *
 * - Diversity carries more: `raids.diversity` turns the Gini-Simpson diversity of the warriors that fought (housing
 *   shares by roster role; the free hero and abilities are not counted) into a share of the loot, so one-role armies
 *   (180 Eclipse Ninjas, 90 Dragon Kites) carry a little less than mixed ones.
 * - Declared stakes (opt-in): `raids.stakes.byStars` multiplies the loot when the declared star count is reached;
 *   a declared raid that misses carries nothing (a real defender keeps it).
 *
 * Only raids against generated bases and real players carry; Trials, wars, bounties and rematches pay fixed rewards.
 * Uses only + − × ÷.
 */
import roster from '../data/roster.json';
import type { BattleResult, BattleSetup } from './battle/types';
import type { Cost, GameData, ResourceKind } from './types';

const ROLE_OF: Record<string, string> = Object.fromEntries(
  (roster.warriors as { role: string; liveTroop?: string }[]).filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.role]),
);

/** The roster role of a trainable warrior (undefined for abilities, heroes and unknown ids). */
export function troopRole(id: string): string | undefined {
  return ROLE_OF[id];
}

/** Gini-Simpson diversity (1 − Σ share²) of the housing that fought, by role: 0 for one role, up to 0.9 for ten. */
export function armyDiversity(used: Record<string, number>, setup: Pick<BattleSetup, 'hero'>, data: GameData): number {
  const byRole: Record<string, number> = {};
  let total = 0;
  for (const [t, n] of Object.entries(used)) {
    const def = data.troops[t];
    if (!def || n <= 0 || t === setup.hero?.id) continue;
    const role = ROLE_OF[t] ?? t;
    byRole[role] = (byRole[role] ?? 0) + def.housing * n;
    total += def.housing * n;
  }
  if (!total) return 0;
  let sum = 0;
  for (const h of Object.values(byRole)) sum += (h / total) * (h / total);
  return 1 - sum;
}

/** The share of loot an army of diversity `d` carries (1 without the rule). */
export function diversityShare(d: number, data: GameData): number {
  const def = data.raids.diversity;
  if (!def) return 1;
  return def.minShare + (1 - def.minShare) * Math.min(1, def.fullAt > 0 ? d / def.fullAt : 1);
}

/** The star counts an attacker may declare (none without the rule). */
export function stakeOptions(data: GameData): number[] {
  return Object.keys(data.raids.stakes?.byStars ?? {}).map(Number).filter((n) => n >= 1 && n <= 3).sort((a, b) => a - b);
}

/** A declarable stake. */
export function validStake(stake: unknown, data: GameData): stake is number {
  return typeof stake === 'number' && stakeOptions(data).includes(stake);
}

/** Whether a declared stake was reached (true without one). */
export function stakeMet(stake: number | undefined, stars: number, data: GameData): boolean {
  return !validStake(stake, data) || stars >= stake;
}

/** The loot multiplier of a stake: 1 without one, its `byStars` value when reached, 0 when missed. */
export function stakeMultiplier(stake: number | undefined, stars: number, data: GameData): number {
  if (!validStake(stake, data)) return 1;
  return stars >= stake ? data.raids.stakes!.byStars[String(stake)] : 0;
}

/** The share of a raid's loot the attacker carries home: diversity times stake. */
export function raidCarry(result: Pick<BattleResult, 'used' | 'stars'>, setup: Pick<BattleSetup, 'hero'>, stake: number | undefined, data: GameData): number {
  return diversityShare(armyDiversity(result.used, setup, data), data) * stakeMultiplier(stake, result.stars, data);
}

/** `loot` times `share`, rounded down per resource. */
export function carriedLoot(loot: Cost, share: number): Cost {
  if (share === 1) return { ...loot };
  const out: Cost = {};
  for (const [k, v] of Object.entries(loot) as [ResourceKind, number][]) {
    const c = Math.floor(v * share);
    if (c > 0) out[k] = c;
  }
  return out;
}
