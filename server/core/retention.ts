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
import { FRIEND_REQUEST_DAYS } from './friends';
import { forfeitExpired, LATE_REPORT_MS } from './pvp';
import { pruneTokens } from './links';
import { STATS_RETENTION_DAYS } from './stats';
import { requireLease, type StillHeld } from '../jobs';
import { deleteAccount } from './account';

/** Backend A18: retention deletes in batches of this many rows, and gives up for the hour after this long. */
export const RETENTION_BATCH = 5000;
export const RETENTION_BUDGET_MS = 10 * 60_000;
/** Backend A23: dormant accounts deleted per run (the job runs daily). */
export const DORMANT_BATCH = 200;

export const REPLAY_RETENTION_DAYS = 30;
export const REPLAY_RETENTION_MS = REPLAY_RETENTION_DAYS * 24 * HOUR;
/** How long an expired, unused ticket (and an unreferenced base version) is kept. */
export const STALE_MS = 24 * HOUR;

export async function prune(ctx: ServerContext, stillHeld?: StillHeld): Promise<PruneResult & { friendRequests: number; duels: number; forfeits: number; stats: number }> {
  const t = ctx.now();
  // Raids never reported settle as losses before their tickets can be pruned (re-audit).
  let forfeits = 0;
  for (let n = -1; n !== 0; ) {
    // Backend A21: each batch of forfeits is committed only while this instance still holds the job.
    await requireLease(stillHeld);
    forfeits += n = await forfeitExpired(ctx);
  }
  await requireLease(stillHeld);
  // Friend requests lapse after 14 days (step 59).
  const friendRequests = await ctx.repo.pruneFriendRequests(t - FRIEND_REQUEST_DAYS * 24 * HOUR);
  // Duels and challenges keep 30 days, like replays (step 62).
  const duels = await ctx.repo.pruneDuels(t - REPLAY_RETENTION_MS);
  const result = await ctx.repo.prune({
    recordsBefore: t - REPLAY_RETENTION_MS,
    staleBefore: t - STALE_MS,
    // A raid may be reported up to LATE_REPORT_MS after its ticket expired (audit R02).
    ticketsBefore: t - STALE_MS - LATE_REPORT_MS,
    resolvedReportsBefore: t - RESOLVED_REPORT_RETENTION_DAYS * 24 * HOUR,
    commandsBefore: t - REPLAY_RETENTION_MS,
    idempotencyBefore: t - STALE_MS,
    // Ask to Buy can take days; after 90 a purchase still redeems, just without its intent.
    intentsBefore: t - 90 * 24 * HOUR,
    // Handled deletion requests are kept a year as the record that it was done, then go (re-audit).
    deletionRequestsBefore: t - 365 * 24 * HOUR,
    // Sign-in nonces (backend A15) live minutes.
    noncesBefore: t,
    // Handled complaints (EU DSA / UK OSA) a year after they were handled, with the contact address.
    complaintsBefore: t - 365 * 24 * HOUR,
    // App Store notifications seen (backend A29): a year, far beyond Apple's retry window.
    storeNotificationsBefore: t - 365 * 24 * HOUR,
    // Backend A18: short batches, and at most RETENTION_BUDGET_MS of deleting per run.
    batchSize: RETENTION_BATCH,
    deadline: Date.now() + RETENTION_BUDGET_MS,
  });
  ctx.metrics.count('tk_retention_runs_total', {});
  for (const [table, n] of Object.entries(result)) if (n) ctx.metrics.count('tk_retention_rows_total', { table }, n);
  await requireLease(stillHeld);
  // Extra device tokens unused for 400 days are signed out (re-audit; links.ts TOKEN_UNUSED_DAYS).
  await pruneTokens(ctx);
  // Shared play statistics (report section 5 step 5) are kept 400 days.
  const stats = await ctx.repo.pruneStats(t - STATS_RETENTION_DAYS * 24 * HOUR);
  return { ...result, friendRequests, duels, forfeits, stats };
}

/**
 * Backend A23: delete anonymous accounts nobody has used for `policy.dormantAccountDays` (DORMANT_ACCOUNT_DAYS,
 * default 730; 0 turns it off). Only accounts nothing else holds: no purchase (financial records), no linked
 * sign-in (a way back in), not staff or suspended, and no server-held village above `policy.dormantMaxKeep`
 * (progress the device may not have). They go the same way as a player's own deletion (`deleteAccount`), a
 * batch per run, each only while this instance still holds the job's lease. A player who comes back to
 * such an account finds it gone; the village on their device is untouched and plays offline, and the game
 * registers a new online account (GDPR storage limitation: the policy and its notice are an owner decision,
 * docs/SHIPPING.md).
 */
export async function pruneDormant(ctx: ServerContext, stillHeld?: StillHeld): Promise<number> {
  const days = ctx.policy.dormantAccountDays;
  if (!days) return 0;
  const ids = await ctx.repo.dormantPlayers(ctx.now() - days * 24 * HOUR, ctx.policy.dormantMaxKeep, DORMANT_BATCH);
  let n = 0;
  for (const id of ids) {
    await requireLease(stillHeld);
    const p = await ctx.repo.getPlayer(id);
    if (!p) continue;
    await deleteAccount(ctx, p);
    n++;
  }
  if (n) ctx.metrics.count('tk_dormant_accounts_deleted_total', {}, n);
  return n;
}
