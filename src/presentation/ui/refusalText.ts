/**
 * A refused command in the player's language. Balance CU-7: a cancel whose refund would not fit in storage
 * is refused with `STORAGE_FULL` and `params { refund, lost }` (both a `Cost`); the toast names both amounts
 * instead of the bare "Storage is too full". Everything else is the simulation's message through `messageText`.
 */
import { listText, messageText, t } from './i18n';
import { formatNumber } from './format';
import { RES_LABEL } from './chips';
import { RESOURCE_KINDS, type Cost } from '../../gameplay/sim/types';
import type { CommandResult } from '../../gameplay/sim/village';

/** "1,200 Coins and 300 Provisions"; empty for a cost of nothing. */
export function costWords(cost: Cost | undefined): string {
  if (!cost) return '';
  return listText(
    RESOURCE_KINDS.filter((k) => (cost[k] ?? 0) > 0).map((k) => t('ui.message_14677cb26f', { arg1: formatNumber(cost[k]!), arg2: RES_LABEL[k] })),
    'conjunction',
  );
}

const isCost = (v: unknown): v is Cost => Boolean(v) && typeof v === 'object';

export function refusalText(r: Extract<CommandResult, { ok: false }>): string {
  const refund = r.params?.refund;
  const lost = r.params?.lost;
  if (r.code === 'STORAGE_FULL' && isCost(refund) && isCost(lost)) {
    const lostText = costWords(lost);
    if (lostText) return t('refusal.storageFullRefund', { lost: lostText, refund: costWords(refund) || '0' });
  }
  return messageText(r.message, true);
}
