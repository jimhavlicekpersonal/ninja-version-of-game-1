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

export function trialInfo(tier: number, data: GameData): TrialInfo {
  const t = Math.max(1, Math.floor(tier));
  const cfg = data.trials;
  const halls = data.hall.levels.length;
  const hall = Math.min(halls, 1 + Math.floor((t - 1) / cfg.tiersPerHall));
  const beyond = Math.max(0, t - halls * cfg.tiersPerHall);
  const modifiers = cfg.modifiers.filter((m) => t % m.every === 0);
  let power = Math.min(cfg.maxPower, Math.pow(1 + cfg.powerGrowthPerTier, beyond));
  let wallPower = 1;
  for (const m of modifiers) {
    power = Math.min(cfg.maxPower, power * (m.power ?? 1));
    wallPower *= m.wallPower ?? 1;
  }
  return { tier: t, hall, layout: LAYOUTS[(t - 1) % LAYOUTS.length], power, wallPower, modifiers };
}

/** The fortress for a tier. Deterministic: same tier, same base. Carries no loot. */
export function trialBase(tier: number, data: GameData): BaseLayout {
  const info = trialInfo(tier, data);
  const within = (info.tier - 1) % data.trials.tiersPerHall;
  const levelBias = data.trials.tiersPerHall > 1 ? within / (data.trials.tiersPerHall - 1) : 1;
  const base = generateOpponent(mixSeed(0x5ad0_77a1, info.tier), info.hall, data, { levelBias: info.tier > data.hall.levels.length * data.trials.tiersPerHall ? 1 : levelBias, layout: info.layout });
  for (const b of base.buildings) delete b.loot;
  base.name = `Shadow Trial ${info.tier}`;
  base.trialTier = info.tier;
  base.practice = info.layout.name;
  if (info.power !== 1) base.power = info.power;
  if (info.wallPower !== 1) base.wallPower = info.wallPower;
  return base;
}

/** First-clear reward for a tier: a share of that hall's raid loot, growing slowly with the tier. */
export function trialReward(tier: number, data: GameData): Cost {
  const info = trialInfo(tier, data);
  const cfg = data.trials;
  const loot = data.battle.generatedLootByHall[info.hall - 1];
  const amount = Math.floor(loot.min * cfg.rewardShareOfRaidLoot * (1 + cfg.rewardLog2Growth * Math.log2(info.tier)));
  const out: Cost = { acorns: amount, dew: amount };
  if (info.tier % cfg.jadeEveryTiers === 0) out.moonstones = cfg.jadeReward;
  return out;
}

/** The next tier the player can earn a reward on. */
export function nextTrialTier(best: number): number {
  return Math.max(0, Math.floor(best)) + 1;
}
