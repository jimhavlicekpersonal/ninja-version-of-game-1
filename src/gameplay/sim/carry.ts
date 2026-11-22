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
import { troopUnlock } from './army';
import type { BattleResult, BattleSetup } from './battle/types';
import type { ContractDef, Cost, GameData, ResourceKind, VillageState } from './types';

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

/** How many roster roles the village can train now (P2-15: a choice the player does not have yet costs nothing). */
export function trainableRoles(state: VillageState, data: GameData): number {
  const roles = new Set<string>();
  for (const t of Object.keys(data.troops)) if (troopUnlock(state, t, data).unlocked) roles.add(ROLE_OF[t] ?? t);
  return roles.size;
}

/**
 * The share of loot an army of diversity `d` carries (1 without the rule, and 1 while the village can train fewer
 * than `fullBelowRoles` roles: pass `roles` from `trainableRoles`).
 */
export function diversityShare(d: number, data: GameData, roles = Infinity): number {
  const def = data.raids.diversity;
  if (!def) return 1;
  if (def.fullBelowRoles !== undefined && roles < def.fullBelowRoles) return 1;
  return def.minShare + (1 - def.minShare) * Math.min(1, def.fullAt > 0 ? d / def.fullAt : 1);
}

/** Beast Mode GT-10: stakes open from `raids.stakes.minKeep` (below it three stars are the usual result: free money). */
export function stakesOpenAt(keep: number, data: GameData): boolean {
  return keep >= (data.raids.stakes?.minKeep ?? 1);
}

/** The star counts an attacker may declare (none without the rule, or at a Keep below `minKeep` when `keep` is given). */
export function stakeOptions(data: GameData, keep?: number): number[] {
  if (keep !== undefined && !stakesOpenAt(keep, data)) return [];
  return Object.keys(data.raids.stakes?.byStars ?? {}).map(Number).filter((n) => n >= 1 && n <= 3).sort((a, b) => a - b);
}

/** A declarable stake (at that Keep, when `keep` is given; a stake the server fixed is checked without one). */
export function validStake(stake: unknown, data: GameData, keep?: number): stake is number {
  return typeof stake === 'number' && stakeOptions(data, keep).includes(stake);
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

const DAY_MS = 86_400_000;

/** P5-03: a contract by id (a record keeps the id of the one it met). */
export function contractById(id: string | undefined, data: GameData): ContractDef | null {
  return (id && data.raids.contracts?.list.find((c) => c.id === id)) || null;
}

/** P5-03: the contract of the UTC day containing `at`, the same for everyone (none without `raids.contracts`). */
export function contractFor(at: number, data: GameData): ContractDef | null {
  const list = data.raids.contracts?.list;
  if (!list?.length) return null;
  const day = Math.floor(at / DAY_MS);
  return list[((day % list.length) + list.length) % list.length];
}

/** When the contract of the day containing `at` ends (the next UTC midnight). */
export function contractEndsAt(at: number): number {
  return (Math.floor(at / DAY_MS) + 1) * DAY_MS;
}

/**
 * P5-03: what a contract multiplies a won raid's carry by (1 when it does not apply). `diversity` is the ratio of the
 * diversity share with the army's diversity counted double to the plain share.
 */
export function contractMultiplier(c: ContractDef | null, result: Pick<BattleResult, 'used' | 'stars'>, setup: Pick<BattleSetup, 'hero'> & { base?: Pick<BattleSetup['base'], 'rival'> }, stake: number | undefined, data: GameData, roles = Infinity): number {
  if (!c || result.stars < 1) return 1;
  const bonus = 1 + (c.bonus ?? 0);
  switch (c.kind) {
    case 'rival':
      return setup.base?.rival !== undefined && setup.base.rival === c.clan ? bonus : 1;
    case 'stakes':
      return validStake(stake, data) && result.stars >= stake ? bonus : 1;
    case 'threeStar':
      return result.stars >= 3 ? bonus : 1;
    case 'diversity': {
      const d = armyDiversity(result.used, setup, data);
      const plain = diversityShare(d, data, roles);
      return plain > 0 ? diversityShare(d + d, data, roles) / plain : 1;
    }
  }
  return 1;
}

/**
 * The share of a raid's loot the attacker carries home: diversity times stake (`roles`: `trainableRoles`), times the
 * daily contract's multiplier when one is given (P5-03).
 */
export function raidCarry(result: Pick<BattleResult, 'used' | 'stars'>, setup: Pick<BattleSetup, 'hero'> & { base?: Pick<BattleSetup['base'], 'rival'> }, stake: number | undefined, data: GameData, roles = Infinity, contract: ContractDef | null = null): number {
  return diversityShare(armyDiversity(result.used, setup, data), data, roles) * stakeMultiplier(stake, result.stars, data) * contractMultiplier(contract, result, setup, stake, data, roles);
}

/** The diversity part of a record's `carry` (absent = 1), for the result screen: the stake's multiplier taken out. */
export function diversityPartOf(carry: number | undefined, stake: number | undefined, stars: number, data: GameData, contract = 1): number {
  // P5-03: a met contract's multiplier (`contract`) is taken out too.
  const m = stakeMultiplier(stake, stars, data) * contract;
  return carry === undefined || m <= 0 ? 1 : carry / m;
}

/**
 * P5-03: the carry and the event bonus after `raids.carryCap`: everything that multiplies a raid's own loot (contract,
 * stake, diversity, event bonus) stops at the cap times the plain loot, and the event bonus is what gives way.
 * Returns the capped carry and the event bonus share to apply on top of it.
 */
export function cappedCarry(carry: number, eventBonus: number, data: GameData): { carry: number; eventBonus: number } {
  const cap = data.raids.carryCap;
  if (cap === undefined) return { carry, eventBonus };
  const c = Math.min(carry, cap);
  return { carry: c, eventBonus: c > 0 ? Math.max(0, Math.min(eventBonus, cap / c - 1)) : eventBonus };
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
