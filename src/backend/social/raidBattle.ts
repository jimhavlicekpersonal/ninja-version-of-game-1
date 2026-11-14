/**
 * A battle the Alliance (or a Gang War) hands the game. In its own file so `net/connection.ts` can name
 * it without importing `groveSource.ts`, which imports the connection (quality 22). `groveSource.ts`
 * re-exports it for the presentation side.
 */
import type { BattleRecord, BattleSetup, Deployment } from '../../gameplay/sim/battle/types';

/** A Grove Raid battle ready to play: the base, and how to report it when done. */
export interface RaidBattle {
  setup: BattleSetup;
  enemyName: string;
  /** The enemy base attacked (for interrupted-battle recovery). */
  target: number;
  /** Server ticket of an online Alliance War attack. */
  ticket?: string;
  /** A Gang War strike (step 67): reported to the Gang War. */
  channel?: 'gangwar';
  /** Bank the attack. The record is kept in the battle log so it can be replayed. */
  finish(deployments: Deployment[], endTick: number | undefined): { stars: number; destruction: number; record: BattleRecord } | null;
}
