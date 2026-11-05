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
 * - Every decision is explained (re-audit, EU DSA art. 16(5) and 17): the
 *   reporters get the outcome, and the affected player the decision, the
 *   reason and how to appeal (SUPPORT_CONTACT), as notices in their inbox
 *   (GET /v1/notices; migration 0025). A muted chat send says why and until when.
 */
import { isolateName } from '../../src/gameplay/sim/social/names';
import { REPORT_REASONS, type BlocksResponse, type NoticesResponse, type ReportReason, type ReportRequest, type ReportResponse } from '../../src/backend/net/protocol';
import type { Player, PlayerNotice, Report } from '../repo';
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
    if (!c || (c.groveId !== membership?.groveId && c.groveId !== gang?.squadId) || !c.playerId) throw new ApiError(404, 'not_found', 'That message is gone.');
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
  // A block ends a friendship and its requests either way (step 59).
  await ctx.repo.removeFriendship(me.id, id);
  await ctx.repo.deleteFriendRequestsBetween(me.id, id);
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

/** Refuse chat from a muted player, saying why, until when, and how to appeal. */
export function checkNotMuted(ctx: ServerContext, me: Player): void {
  const until = me.mutedUntil ?? 0;
  const left = until - ctx.now();
  if (left <= 0) return;
  const hours = Math.ceil(left / HOUR);
  const howLong = hours > 48 ? `${Math.ceil(hours / 24)} more days` : `${hours} more hour${hours === 1 ? '' : 's'}`;
  throw new ApiError(403, 'muted', `A moderator paused your chat for ${howLong} (until ${new Date(until).toUTCString()})${me.muteReason ? `. Reason: ${me.muteReason}` : ''}. ${appealText(ctx)}`);
}

// ------------------------------------------------------------------ notices (re-audit: EU DSA 16(5), 17)

/** Words a player understands, for each report reason. */
export const REASON_TEXT: Record<ReportReason, string> = {
  harassment: 'harassment or bullying',
  hate: 'hate speech',
  sexual: 'sexual content',
  spam: 'spam or scams',
  cheating: 'cheating',
  name: 'an inappropriate name',
  other: 'breaking the community rules',
};

/** How to disagree with a decision. */
export function appealText(ctx: ServerContext): string {
  const contact = ctx.account?.supportContact;
  return contact
    ? `If you think this was a mistake, write to ${contact} with your Player ID (Settings → Online play → Account) and we will look again.`
    : 'If you think this was a mistake, contact support from Settings → Privacy and help with your Player ID, and we will look again.';
}

/** Most notices kept per player (older ones are only listed, newest first, up to this many). */
export const MAX_NOTICES = 50;

export async function notify(ctx: ServerContext, playerId: string, kind: PlayerNotice['kind'], text: string): Promise<void> {
  await ctx.repo.addNotice({ id: ctx.uuid(), playerId, at: ctx.now(), kind, text, read: false });
  ctx.metrics.count('tk_notices_total', { kind });
}

/** GET /v1/notices */
export async function notices(ctx: ServerContext, me: Player): Promise<NoticesResponse> {
  return { notices: (await ctx.repo.noticesOf(me.id, MAX_NOTICES)).map((n) => ({ id: n.id, at: n.at, kind: n.kind, text: n.text, read: n.read })) };
}

/** POST /v1/notices/read { ids } */
export async function markNoticesRead(ctx: ServerContext, me: Player, ids: unknown): Promise<void> {
  const list = (Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === 'string' && x.length <= 64).slice(0, MAX_NOTICES);
  await ctx.repo.markNoticesRead(me.id, list);
}

// ------------------------------------------------------------------ staff

export interface ReportQueueEntry extends Report {
  /** Open reports on the same player, to spot repeat problems. */
  openOnTarget: number;
  /** The player's current chat mute (0: none). */
  targetMutedUntil: number;
  /** The message is hidden right now (enough reports, or staff). */
  messageHidden: boolean;
}

/** Staff: reports, oldest first, with context. */
export async function reportQueue(ctx: ServerContext, status: 'open' | 'all'): Promise<{ reports: ReportQueueEntry[] }> {
  const list = await ctx.repo.reports(status, 200);
  const open = status === 'open' ? list : await ctx.repo.reports('open', 1000);
  const perTarget = new Map<string, number>();
  for (const r of open) perTarget.set(r.targetId, (perTarget.get(r.targetId) ?? 0) + 1);
  const out: ReportQueueEntry[] = [];
  for (const r of list) {
    const target = await ctx.repo.getPlayer(r.targetId);
    const msg = r.messageId ? await ctx.repo.getChat(r.messageId) : null;
    out.push({ ...r, openOnTarget: perTarget.get(r.targetId) ?? 0, targetMutedUntil: target?.mutedUntil ?? 0, messageHidden: Boolean(msg?.hidden) });
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
  const same = r.messageId ? await ctx.repo.openReportsOn(r.messageId) : [r];
  // The rule broken, in words: what most reporters picked (staff's note adds detail).
  const counts = new Map<ReportReason, number>();
  for (const x of same) counts.set(x.reason, (counts.get(x.reason) ?? 0) + 1);
  const reason = REASON_TEXT[[...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? r.reason] ?? REASON_TEXT.other;
  const why = `Reason: ${reason}${note ? ` (${note})` : ''}.`;
  const quoted = r.text ? ` ("${r.text.length > 80 ? `${r.text.slice(0, 80)}…` : r.text}")` : '';
  let outcome: string;
  let toTarget: string | null = null;
  if (action === 'dismiss') {
    if (r.messageId) await ctx.repo.setChatHidden(r.messageId, false);
    resolution = note || 'No action needed.';
    outcome = 'we did not find a rule broken, so nothing was removed. Thank you for helping keep Kagemura friendly.';
  } else if (action === 'remove_message') {
    await ctx.repo.setChatHidden(r.messageId!, true);
    resolution = note || 'Message removed.';
    outcome = 'the message was removed.';
    toTarget = `A moderator removed your chat message${quoted}. ${why}`;
  } else {
    const hours = Math.max(1, Math.min(MAX_MUTE_HOURS, Math.floor(Number(body?.hours ?? 24)) || 24));
    const target = await ctx.repo.getPlayer(r.targetId);
    const until = Math.max(target?.mutedUntil ?? 0, t + hours * HOUR);
    if (target) await ctx.repo.updatePlayer(target.id, { mutedUntil: until, muteReason: `${reason}${note ? ` (${note})` : ''}`.slice(0, 300) });
    if (r.messageId) await ctx.repo.setChatHidden(r.messageId, true);
    resolution = note || `Chat muted for ${hours} hours${r.messageId ? '; message removed' : ''}.`;
    outcome = `the player's chat was paused${r.messageId ? ' and the message removed' : ''}.`;
    toTarget = `A moderator paused your chat until ${new Date(until).toUTCString()}${r.messageId ? ` and removed your message${quoted}` : ''}. ${why}`;
  }
  const status = action === 'dismiss' ? 'dismissed' : 'actioned';
  for (const x of same) await ctx.repo.resolveReport(x.id, status, resolution, t);
  // Statement of reasons to the affected player, outcome to each reporter (never naming the reporters).
  if (toTarget) await notify(ctx, r.targetId, 'moderation_action', `${toTarget} ${appealText(ctx)}`);
  const about = r.kind === 'chat' ? `a chat message by ${isolateName(r.targetName)}` : isolateName(r.targetName);
  for (const reporter of new Set(same.map((x) => x.reporterId))) await notify(ctx, reporter, 'report_outcome', `Thanks, we reviewed your report about ${about}: ${outcome}`);
  return (await ctx.repo.getReport(r.id))!;
}
