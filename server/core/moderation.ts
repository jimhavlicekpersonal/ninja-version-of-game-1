/**
 * Reports, blocks and the moderation queue (roadmap step 15; Apple 1.2 for
 * user-generated content: a filter, a way to report, a way to block, and
 * timely action). Chat is always filtered (groves.ts); this adds the rest.
 *
 * - A player reports a message in their Alliance chat (its text is kept as it
 *   was, as evidence) or a player. Once HIDE_AFTER_REPORTS different players
 *   report one message, it is hidden from everyone until staff look at it.
 * - Blocking hides the blocked player's messages and troop requests from the
 *   blocker, on every device.
 * - Staff work through open reports with the admin API: dismiss (a hidden
 *   message comes back), remove the message, or mute the player's chat.
 */
import { cutTies } from './friends';
import { DELETION_DUE_MS } from './account';
import { REPORT_REASONS, type BlocksResponse, type ReportRequest, type ReportResponse } from '../../src/backend/net/protocol';
import type { Player, Report } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';

/** Distinct reporters after which a message is hidden pending review. */
export const HIDE_AFTER_REPORTS = 3;
export const MAX_BLOCKS = 500;
/** Handled reports (and the message text kept as evidence) are deleted after this many days. */
export const RESOLVED_REPORT_RETENTION_DAYS = 90;
/** Longest chat mute staff can give at once. */
export const MAX_MUTE_HOURS = 24 * 365;

const text = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function report(ctx: ServerContext, me: Player, req: ReportRequest | undefined): Promise<ReportResponse> {
  const reason = req?.reason;
  if (!reason || !REPORT_REASONS.includes(reason)) throw new ApiError(400, 'bad_request', 'Pick a reason for the report.');
  const base = { id: ctx.uuid(), at: ctx.now(), reporterId: me.id, reason, note: text(req?.note, 500), status: 'open' as const, resolvedAt: null, resolution: null };
  let r: Report;
  if (req?.kind === 'chat') {
    const membership = await ctx.repo.getMembership(me.id);
    const gang = await ctx.repo.squadOf(me.id);
    const c = req.messageId ? await ctx.repo.getChat(String(req.messageId)) : null;
    // Only messages the reporter can see: their own Alliance's or Gang's chat (step 63), written by a player.
    const mine = (scope: string) => scope === membership?.groveId || (gang !== null && scope === `squad:${gang.id}`);
    if (!c || !mine(c.groveId) || !c.playerId) throw new ApiError(404, 'not_found', 'That message is gone.');
    if (c.playerId === me.id) throw new ApiError(400, 'bad_request', 'You cannot report your own message.');
    r = { ...base, kind: 'chat', targetId: c.playerId, targetName: c.name ?? '', messageId: c.id, groveId: c.groveId, text: c.text };
  } else if (req?.kind === 'player') {
    const p = req.playerId ? await ctx.repo.getPlayer(String(req.playerId)) : null;
    if (!p) throw new ApiError(404, 'not_found', 'No such player.');
    if (p.id === me.id) throw new ApiError(400, 'bad_request', 'You cannot report yourself.');
    r = { ...base, kind: 'player', targetId: p.id, targetName: p.name, messageId: null, groveId: null, text: null };
  } else {
    throw new ApiError(400, 'bad_request', "kind must be 'chat' or 'player'");
  }
  const fresh = await ctx.repo.addReport(r);
  if (fresh && r.messageId) {
    const reporters = new Set((await ctx.repo.openReportsOn(r.messageId)).map((x) => x.reporterId));
    if (reporters.size >= HIDE_AFTER_REPORTS) await ctx.repo.setChatHidden(r.messageId, true);
  }
  if (req.block) await block(ctx, me, r.targetId);
  return { id: fresh ? r.id : null, alreadyReported: !fresh, blocked: Boolean(req.block) };
}

export async function block(ctx: ServerContext, me: Player, playerId: unknown): Promise<void> {
  const id = String(playerId ?? '');
  if (!id || id === me.id) throw new ApiError(400, 'bad_request', 'You cannot block yourself.');
  const p = await ctx.repo.getPlayer(id);
  if (!p) throw new ApiError(404, 'not_found', 'No such player.');
  const list = await ctx.repo.blocksOf(me.id);
  if (list.length >= MAX_BLOCKS && !list.some((b) => b.blockedId === id)) throw new ApiError(409, 'full', 'You have blocked as many players as you can. Unblock someone first.');
  await ctx.repo.addBlock({ playerId: me.id, blockedId: id, blockedName: p.name, at: ctx.now() });
  // Blocking ends a friendship and any open requests (step 59).
  await cutTies(ctx, me.id, id);
}

export async function unblock(ctx: ServerContext, me: Player, playerId: unknown): Promise<void> {
  await ctx.repo.removeBlock(me.id, String(playerId ?? ''));
}

export async function blocks(ctx: ServerContext, me: Player): Promise<BlocksResponse> {
  return { blocked: (await ctx.repo.blocksOf(me.id)).map((b) => ({ id: b.blockedId, name: b.blockedName, at: b.at })) };
}

/** Ids of the players `me` blocked. */
export async function blockedIds(ctx: ServerContext, me: Player): Promise<Set<string>> {
  return new Set((await ctx.repo.blocksOf(me.id)).map((b) => b.blockedId));
}

/** Refuse chat from a muted player, saying for how long. */
export function checkNotMuted(ctx: ServerContext, me: Player): void {
  const left = (me.mutedUntil ?? 0) - ctx.now();
  if (left <= 0) return;
  const hours = Math.ceil(left / HOUR);
  throw new ApiError(403, 'muted', `A moderator paused your chat for ${hours > 48 ? `${Math.ceil(hours / 24)} more days` : `${hours} more hour${hours === 1 ? '' : 's'}`}.`);
}

// ------------------------------------------------------------------ staff

export interface ReportQueueEntry extends Report {
  /** Open reports on the same player, to spot repeat problems. */
  openOnTarget: number;
  /** The player's current chat mute (0: none). */
  targetMutedUntil: number;
  /** The message is hidden right now (enough reports, or staff). */
  messageHidden: boolean;
  /** We commit to acting on reports within a day (step 56, store UGC rules); `overdue` once passed. */
  dueAt: number;
  overdue: boolean;
}

/** Staff: reports, oldest first, with context. */
/** Open staff work and what is overdue (step 56), for the tk_staff_queue gauge and its alerts. */
export async function staffQueues(ctx: ServerContext) {
  const now = ctx.now();
  return ctx.repo.queueStats(now - DELETION_DUE_MS, now - REPORT_DUE_MS);
}

/** Reports are acted on within a day (the commitment in docs/store/PRIVACY.md). */
export const REPORT_DUE_MS = 24 * 3_600_000;

export async function reportQueue(ctx: ServerContext, status: 'open' | 'all'): Promise<{ reports: ReportQueueEntry[] }> {
  const list = await ctx.repo.reports(status, 200);
  const open = status === 'open' ? list : await ctx.repo.reports('open', 1000);
  const perTarget = new Map<string, number>();
  for (const r of open) perTarget.set(r.targetId, (perTarget.get(r.targetId) ?? 0) + 1);
  const out: ReportQueueEntry[] = [];
  for (const r of list) {
    const target = await ctx.repo.getPlayer(r.targetId);
    const msg = r.messageId ? await ctx.repo.getChat(r.messageId) : null;
    const dueAt = r.at + REPORT_DUE_MS;
    out.push({ ...r, openOnTarget: perTarget.get(r.targetId) ?? 0, targetMutedUntil: target?.mutedUntil ?? 0, messageHidden: Boolean(msg?.hidden), dueAt, overdue: r.status === 'open' && ctx.now() > dueAt });
  }
  return { reports: out };
}

export type ModerationAction = 'dismiss' | 'remove_message' | 'mute';

/**
 * Staff: act on a report. A decision about a message settles every open
 * report on that message. 'dismiss' brings an auto-hidden message back;
 * 'remove_message' hides it for good; 'mute' also stops the player chatting
 * for `hours` (default 24) and hides the message.
 */
export async function resolveReport(ctx: ServerContext, id: string, body: { action?: unknown; hours?: unknown; note?: unknown } | undefined): Promise<Report> {
  const r = await ctx.repo.getReport(String(id));
  if (!r) throw new ApiError(404, 'not_found', 'No such report.');
  if (r.status !== 'open') throw new ApiError(409, 'conflict', 'That report was already handled.');
  const action = body?.action as ModerationAction;
  if (action !== 'dismiss' && action !== 'remove_message' && action !== 'mute') throw new ApiError(400, 'bad_request', "action must be 'dismiss', 'remove_message' or 'mute'");
  if (action === 'remove_message' && !r.messageId) throw new ApiError(400, 'bad_request', 'That report is about a player, not a message.');
  const t = ctx.now();
  const note = text(body?.note, 500);
  let resolution: string;
  if (action === 'dismiss') {
    if (r.messageId) await ctx.repo.setChatHidden(r.messageId, false);
    resolution = note || 'No action needed.';
  } else if (action === 'remove_message') {
    await ctx.repo.setChatHidden(r.messageId!, true);
    resolution = note || 'Message removed.';
  } else {
    const hours = Math.max(1, Math.min(MAX_MUTE_HOURS, Math.floor(Number(body?.hours ?? 24)) || 24));
    const target = await ctx.repo.getPlayer(r.targetId);
    if (target) await ctx.repo.updatePlayer(target.id, { mutedUntil: Math.max(target.mutedUntil ?? 0, t + hours * HOUR) });
    if (r.messageId) await ctx.repo.setChatHidden(r.messageId, true);
    resolution = note || `Chat muted for ${hours} hours${r.messageId ? '; message removed' : ''}.`;
  }
  const status = action === 'dismiss' ? 'dismissed' : 'actioned';
  const same = r.messageId ? await ctx.repo.openReportsOn(r.messageId) : [r];
  for (const x of same) await ctx.repo.resolveReport(x.id, status, resolution, t);
  return (await ctx.repo.getReport(r.id))!;
}
