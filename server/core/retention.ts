/**
 * Retention (roadmap step 11): attack records, with their replays, are kept
 * for 30 days, and so are tickets (a used ticket keeps its answer for retried
 * reports). Unused tickets go a day after they expire. A base version goes once
 * nothing refers to it. Handled moderation reports (with the message text kept
 * as evidence) go after 90 days, and so do purchase intents (purchases themselves are
 * financial records and stay). The server runs this every hour (server/main.ts); it
 * is idempotent, so several instances running it is harmless.
 */
import type { PruneResult } from '../repo';
import { HOUR, type ServerContext } from './context';
import { RESOLVED_REPORT_RETENTION_DAYS } from './moderation';

export const REPLAY_RETENTION_DAYS = 30;
export const REPLAY_RETENTION_MS = REPLAY_RETENTION_DAYS * 24 * HOUR;
/** How long an expired, unused ticket (and an unreferenced base version) is kept. */
export const STALE_MS = 24 * HOUR;

export function prune(ctx: ServerContext): Promise<PruneResult> {
  const t = ctx.now();
  return ctx.repo.prune({
    recordsBefore: t - REPLAY_RETENTION_MS,
    staleBefore: t - STALE_MS,
    resolvedReportsBefore: t - RESOLVED_REPORT_RETENTION_DAYS * 24 * HOUR,
    commandsBefore: t - REPLAY_RETENTION_MS,
    idempotencyBefore: t - STALE_MS,
    // Ask to Buy can take days; after 90 a purchase still redeems, just without its intent.
    intentsBefore: t - 90 * 24 * HOUR,
  });
}
