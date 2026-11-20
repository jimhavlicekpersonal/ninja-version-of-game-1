/**
 * Settle the score (re-audit: defense had nothing to do). After a bot raid, the
 * player may attack that raider's own base once, within `raids.rematch.windowHours`.
 * The raider is generated (labelled as such): its base comes from the seed, Keep
 * and level bias stored on the defense record (`raider`), with no loot inside.
 * No honor moves (bots never move ratings or honor through a rematch). A win
 * (1+ stars) pays the larger of `shareOfRaidLoot` x stars/3 of the player's Keep's
 * lowest raid loot (in Coins and Provisions) and, per resource, `recoverShare` x
 * stars/3 of what that raid took (P2-07: three stars used to pay back less than the
 * army cost), storage-capped.
 */
import { generateOpponent } from './battle/basegen';
import type { BaseLayout, BattleRecord } from './battle/types';
import { hallLevel } from './keep';
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
  // Review 2026-11-17 (R3-04): a raid dated after `now` has not happened; such a record could be answered for ever.
  if (!Number.isFinite(record.at) || record.at > now) return { ok: false, message: 'This raid cannot be answered.' };
  if (now - record.at > cfg.windowHours * HOUR) return { ok: false, message: 'Too long ago: the raider has moved on.' };
  // A record dated after now is not a raid that happened (a forged save would keep it answerable forever).
  if (record.at > now) return { ok: false, message: 'This raid cannot be answered.' };
  return { ok: true, record };
}

/** The defenses that can be answered now, newest first. */
export function rematchable(state: VillageState, now: number, data: GameData): BattleRecord[] {
  return state.defenseLog.filter((d) => rematchStatus(state, d.id, now, data).ok).reverse();
}

/**
 * The Keep a rematch's reward is read at: the player's, but never more than one above the raider's own. A raider
 * comes from the player's Keep or the one below, so this is the player's Keep for every raid the game sends; it
 * stops a record naming a Keep 1 raider from paying a Keep 15 reward for beating a Keep 1 base (review R3-04).
 */
export function rematchKeep(state: VillageState, record: BattleRecord, data: GameData): number {
  const own = hallLevel(state, data);
  const raider = Number.isFinite(record.raider?.hall) ? Math.max(1, Math.floor(record.raider!.hall)) : 1;
  return Math.min(own, raider + 1);
}

/**
 * What a rematch with this many stars pays at a Keep (before the storage check): per resource, the larger of the
 * fixed share of the Keep's lowest raid loot (Coins and Provisions) and `recoverShare` of what the raid `took`.
 */
export function rematchReward(stars: number, keep: number, data: GameData, took: Cost = {}): Cost {
  const cfg = data.raids.rematch;
  const s = Math.max(0, Math.min(3, stars));
  const fixed = Math.floor(((data.battle.generatedLootByHall[keep - 1]?.min ?? 0) * (cfg?.shareOfRaidLoot ?? 0) * s) / 3);
  const out: Cost = {};
  if (fixed > 0) out.acorns = out.dew = fixed;
  const recover = cfg?.recoverShare ?? 0;
  // Independent review 2026-11-18: only what a raid can take (Coins and Provisions), and never more than a raid on this
  // Keep could take (twice the storage loot cap, storages plus collectors): a forged record pays nothing extra.
  const caps = data.raids.storageLootCapByHall;
  const most = 2 * (caps[Math.max(1, Math.min(caps.length, keep)) - 1] ?? 0);
  for (const k of ['acorns', 'dew'] as const) {
    const back = Math.floor((Math.min(most, Math.max(0, took[k] ?? 0)) * recover * s) / 3);
    if (back > (out[k] ?? 0)) out[k] = back;
  }
  return out;
}
