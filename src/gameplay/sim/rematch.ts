/**
 * Settle the score (re-audit: defense had nothing to do). After a bot raid, the
 * player may attack that raider's own base once, within `raids.rematch.windowHours`.
 * The raider is generated (labelled as such): its base comes from the seed, Keep
 * and level bias stored on the defense record (`raider`), with no loot inside.
 * No honor moves (bots never move ratings or honor through a rematch). A win
 * (1+ stars) pays a small fixed reward: `shareOfRaidLoot` x stars/3 of the
 * player's Keep's lowest raid loot, in Coins and Provisions, storage-capped.
 */
import { generateOpponent } from './battle/basegen';
import type { BaseLayout, BattleRecord } from './battle/types';
import type { Cost, GameData, VillageState } from './types';

const HOUR = 3_600_000;

/** The raider's base for a defense record (null when the record has no raider: real players, older saves). */
export function rematchBase(record: BattleRecord, data: GameData): BaseLayout | null {
  if (record.kind !== 'defense' || !record.raider) return null;
  const r = record.raider;
  const base = generateOpponent(r.seed, Math.max(1, Math.min(data.hall.levels.length, r.hall)), data, { levelBias: r.bias });
  for (const b of base.buildings) delete b.loot;
  base.name = `${record.opponentName}'s base (simulated raider)`;
  base.practice = 'Settle the score';
  return base;
}

/** Whether this defense can still be answered with a rematch at `now`, and why not. */
export function rematchStatus(state: VillageState, recordId: string, now: number, data: GameData): { ok: true; record: BattleRecord } | { ok: false; message: string } {
  const cfg = data.raids.rematch;
  const record = state.defenseLog.find((d) => d.id === recordId);
  if (!cfg || !record || record.kind !== 'defense' || !record.raider || !record.simulated) return { ok: false, message: 'This raid cannot be answered.' };
  if (record.rematch) return { ok: false, message: 'You already settled the score with this raider.' };
  if (now - record.at > cfg.windowHours * HOUR) return { ok: false, message: 'Too long ago: the raider has moved on.' };
  return { ok: true, record };
}

/** The defenses that can be answered now, newest first. */
export function rematchable(state: VillageState, now: number, data: GameData): BattleRecord[] {
  return state.defenseLog.filter((d) => rematchStatus(state, d.id, now, data).ok).reverse();
}

/** What a rematch with this many stars pays at a Keep (before the storage check). */
export function rematchReward(stars: number, keep: number, data: GameData): Cost {
  const share = data.raids.rematch?.shareOfRaidLoot ?? 0;
  const amount = Math.floor(((data.battle.generatedLootByHall[keep - 1]?.min ?? 0) * share * Math.max(0, Math.min(3, stars))) / 3);
  return amount > 0 ? { acorns: amount, dew: amount } : {};
}
