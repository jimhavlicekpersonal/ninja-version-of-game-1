/**
 * Shadow Trials: an endless difficulty ladder of practice fortresses.
 *
 * Tier t is fully determined by t and the game data (no randomness from the
 * player), so the reward check can rebuild the base instead of trusting it.
 * - Tiers 1..(halls * tiersPerHall) walk through every Clan Keep level, from
 *   fresh to maxed buildings, rotating through the layout archetypes.
 * - Past the last Keep level, defenses grow geometrically (+6% per tier), so
 *   the ladder never ends; numbers are capped at `maxPower` to stay finite.
 * - Every `every`-th tier adds a modifier (affix) such as Ironclad Walls.
 * - Rewards are paid once per tier, on the first clear of the next tier, and
 *   grow logarithmically, so the ladder can't be farmed.
 */
import { generateOpponent, LAYOUTS, type LayoutArchetype } from './battle/basegen';
import type { BaseLayout } from './battle/types';
import { mixSeed } from './rng';
import { temperBase } from './battle/temper';
import type { Cost, GameData, TrialModifierDef } from './types';

export interface TrialInfo {
  tier: number;
  hall: number;
  layout: LayoutArchetype;
  /** Multiplier on defense HP and damage. */
  power: number;
  /** Multiplier on wall HP. */
  wallPower: number;
  modifiers: TrialModifierDef[];
}

/**
 * A tier's settings. `variant` > 0 is an alternate fortress for the same tier
 * (another layout), which a player may switch to after failing it: the reward
 * and the strength curve are the same.
 */
export function trialInfo(tier: number, data: GameData, variant = 0): TrialInfo {
  const t = Math.max(1, Math.floor(tier));
  const cfg = data.trials;
  const halls = data.hall.levels.length;
  const hall = Math.min(halls, 1 + Math.floor((t - 1) / cfg.tiersPerHall));
  const beyond = Math.max(0, t - halls * cfg.tiersPerHall);
  // P1-07: each modifier on its own period and offset; a rival's tempers need the Keep that unlocks tempering.
  const temperKeep = data.battle.temper?.unlockKeep ?? Infinity;
  const layout = LAYOUTS[(t - 1 + Math.max(0, Math.floor(variant))) % LAYOUTS.length];
  const modifiers = cfg.modifiers.filter((m) => (t - (m.offset ?? 0)) % m.every === 0 && t >= (m.offset ?? 0) && (!m.rival || hall >= temperKeep) && (!m.layouts || m.layouts.includes(layout.id)));
  // XPL-08 (P1-17): repeated multiplication, never Math.pow (engines need not agree on it to the last bit).
  let power = 1;
  for (let i = 0; i < beyond && power < cfg.maxPower; i++) power *= 1 + cfg.powerGrowthPerTier;
  power = Math.min(cfg.maxPower, power);
  let wallPower = 1;
  for (const m of modifiers) {
    power = Math.min(cfg.maxPower, power * (m.power ?? 1));
    wallPower *= m.wallPower ?? 1;
  }
  // Layouts are not equally hard for the same buildings: an authored factor evens them out.
  power = Math.min(cfg.maxPower, power * (cfg.layoutPower?.[layout.id] ?? 1));
  return { tier: t, hall, layout, power, wallPower, modifiers };
}

/** Rough defensive strength of a base: defense HP times damage per tick, summed (power applies on top). */
export function defenseStrength(base: BaseLayout, data: GameData): number {
  let total = 0;
  for (const b of base.buildings) {
    const def = data.buildings[b.type];
    if (def?.category !== 'defense' || !def.combat) continue;
    const lv = def.levels[Math.max(1, Math.min(def.levels.length, b.level)) - 1];
    total += lv.hp * ((lv.damage ?? 0) / def.combat.fireIntervalTicks);
  }
  return total;
}

/**
 * The fortress for a tier. Deterministic: same tier (and variant), same base.
 * Carries no loot. Several candidates are generated and the one of median
 * strength is used, so one unlucky roll of the generator can't make a tier
 * a wall (or a gift).
 */
export function trialBase(tier: number, data: GameData, variant = 0): BaseLayout {
  const info = trialInfo(tier, data, variant);
  const within = (info.tier - 1) % data.trials.tiersPerHall;
  const levelBias = data.trials.tiersPerHall > 1 ? within / (data.trials.tiersPerHall - 1) : 1;
  const opts = { levelBias: info.tier > data.hall.levels.length * data.trials.tiersPerHall ? 1 : levelBias, layout: info.layout };
  const n = Math.max(1, data.trials.candidates ?? 1);
  const candidates = Array.from({ length: n }, (_, k) => generateOpponent(mixSeed(0x5ad0_77a1 + variant * 0x9e37, info.tier * 16 + k), info.hall, data, opts))
    .map((b, k) => ({ b, k, s: defenseStrength(b, data) }))
    .sort((a, c) => a.s - c.s || a.k - c.k);
  const base = candidates[Math.floor((candidates.length - 1) / 2)].b;
  for (const b of base.buildings) delete b.loot;
  base.name = `Shadow Trial ${info.tier}`;
  base.trialTier = info.tier;
  base.practice = info.layout.name;
  if (info.power !== 1) base.power = info.power;
  if (info.wallPower !== 1) base.wallPower = info.wallPower;
  // P1-07: a rival clan's outpost tempers.
  for (const m of info.modifiers) if (m.rival) temperBase(base, data.battle.temper?.rivals[m.rival]?.tempers, data);
  return base;
}

/** First-clear reward for a tier: a share of that hall's raid loot, growing slowly with the tier. */
export function trialReward(tier: number, data: GameData): Cost {
  const info = trialInfo(tier, data);
  const cfg = data.trials;
  const loot = data.battle.generatedLootByHall[info.hall - 1];
  // P1-06: past the Keep ladder the reward keeps growing a little (it was flat but for the log term).
  const beyond = Math.max(0, info.tier - data.hall.levels.length * cfg.tiersPerHall);
  const raw = loot.min * cfg.rewardShareOfRaidLoot * (1 + cfg.rewardLog2Growth * log2Exact(info.tier)) * (1 + (cfg.rewardGrowthPerTierBeyond ?? 0) * beyond);
  // XPL-08 (P1-17): an integer-safe floor. The product lands exactly on a whole number at tiers 2, 4, 16, 32 and
  // 64; an engine whose result is one unit in the last place low would pay one less and the economies would differ.
  const amount = Math.floor(raw + 1e-7);
  const out: Cost = { acorns: amount, dew: amount };
  if (info.tier % cfg.jadeEveryTiers === 0) out.moonstones = cfg.jadeReward;
  return out;
}

/** log2 of a whole tier, exact at powers of two (Math.log2 is not guaranteed exact on every engine). */
function log2Exact(n: number): number {
  let p = 0;
  let v = n;
  while (v > 1 && v % 2 === 0) {
    v /= 2;
    p++;
  }
  return v === 1 ? p : p + Math.log2(v);
}

/** Whether the player may switch the next tier to an alternate fortress: after failing it, a few times per tier. */
export function canTryAlternate(trials: { best: number; alternate?: number; failedTier?: number }, data: GameData): boolean {
  return trials.failedTier === nextTrialTier(trials.best) && (trials.alternate ?? 0) < data.trials.maxAlternates;
}

/** The fortress variant the next tier uses for this player (0 unless they switched after a failure). */
export function trialVariant(trials: { best: number; alternate?: number }, tier: number): number {
  return tier === nextTrialTier(trials.best) ? trials.alternate ?? 0 : 0;
}

/** The next tier the player can earn a reward on. */
export function nextTrialTier(best: number): number {
  return Math.max(0, Math.floor(best)) + 1;
}
