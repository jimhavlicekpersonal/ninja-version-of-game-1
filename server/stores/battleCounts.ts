/**
 * Security fixes 2026-11-24 (SECR-01): how one statistics event counts in the staff Battles report
 * (`statsLocal.ts` `battleOutcomes`), shared by the memory store and the pure `battleOutcomesOf`; the
 * Postgres store computes the same key in SQL (`stores/pg/growth.ts` `statsBattleCounts`).
 */
import type { StatsBattleCount } from './types';

export function battleCountKey(name: string, props: Record<string, unknown>): Omit<StatsBattleCount, 'n'> | null {
  if (name === 'trial_end') return typeof props.tier === 'number' ? { name, num: props.tier, flag: props.cleared === true } : null;
  if (name === 'raid_end') return typeof props.keep === 'number' ? { name, num: props.keep, flag: props.endReason === 'surrender' } : null;
  if (name === 'scout_leave') return typeof props.keep === 'number' ? { name, num: props.keep, flag: false } : null;
  if (name === 'webgl_lost') return { name, num: null, flag: props.stuck === true };
  return null;
}
