/**
 * The defender's reward for stars denied (raids.defenseWin; P2-01): shared by bot raids (`raidVillage`) and real
 * players' raids (`applyDefense`). Its own module so `village.ts` and `defense.ts` can both use it without a cycle.
 */
import { capacity } from './resources';
import type { Cost, GameData, VillageState } from './types';

/**
 * What holding off a bot raid pays (`raids.defenseWin`): a share of the Keep's lowest generated
 * raid loot in Coins and Provisions, as far as storage has room. Mutates; returns what was added.
 */
export function defenseWinReward(s: VillageState, data: GameData, part = 1): { added: Cost; overflow: Cost } {
  const share = (data.raids.defenseWin?.shareOfRaidLoot ?? 0) * part;
  const hl = Math.max(1, s.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
  const amount = Math.floor((data.battle.generatedLootByHall[hl - 1]?.min ?? 0) * share);
  if (amount <= 0) return { added: {}, overflow: {} };
  const cap = capacity(s, data);
  const out: Cost = {};
  const overflow: Cost = {};
  for (const k of ['acorns', 'dew'] as const) {
    const uncapped = data.raids.defenseWin?.uncapped === true;
    // A debt (negative balance) is repaid first, never past the storage cap.
    const add = uncapped ? amount : Math.max(0, Math.min(amount, cap[k] - s.resources[k]));
    if (add > 0) {
      s.resources[k] += add;
      out[k] = add;
    }
    if (amount - add > 0) overflow[k] = amount - add;
  }
  return { added: out, overflow };
}

