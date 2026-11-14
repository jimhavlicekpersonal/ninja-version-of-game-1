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
 *   (GET /v1/notices; migration 0024). A muted chat send says why and until when.
 */
import { isolateName } from '../../src/gameplay/sim/social/names';
import { REPORT_REASONS, type BlocksResponse, type NoticesResponse, type ReportReason, type ReportRequest, type ReportResponse } from '../../src/backend/net/protocol';
import type { Player, PlayerNotice, Report } from '../repo';
import { HOUR, type ServerContext } from './context';
import { fail, staffError, msg, utcDate, appeal, english, type ServerMessage } from './errors';

/** Distinct reporters after which a message is hidden pending review. */
export const HIDE_AFTER_REPORTS = 3;
export const MAX_BLOCKS = 500;
/** Handled reports (and the message text kept as evidence) are deleted after this many days. */
export const RESOLVED_REPORT_RETENTION_DAYS = 90;
/** Longest chat mute staff can give at once. */
export const MAX_MUTE_HOURS = 24 * 365;

const text = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function report(ctx: ServerContext, me: Player, req: Partial<ReportRequest> | undefined): Promise<ReportResponse> {
  const reason = req?.reason;
  if (!reason || !REPORT_REASONS.includes(reason)) throw fail(400, 'bad_request', 'report.pick_reason');
  const base = { id: ctx.uuid(), at: ctx.now(), reporterId: me.id, reason, note: text(req?.note, 500), status: 'open' as const, resolvedAt: null, resolution: null };
  let r: Report;
  if (req?.kind === 'chat') {
    const membership = await ctx.repo.getMembership(me.id);
    const gang = await ctx.repo.squadOf(me.id);
    const c = req.messageId ? await ctx.repo.getChat(String(req.messageId)) : null;
    // Only messages the reporter can see: their own Alliance's or Gang's chat (step 63), written by a player.
    if (!c || (c.groveId !== membership?.groveId && c.groveId !== gang?.squadId) || !c.playerId) throw fail(404, 'not_found', 'report.message_gone');
    if (c.playerId === me.id) throw fail(400, 'bad_request', 'report.own_message');
    r = { ...base, kind: 'chat', targetId: c.playerId, targetName: c.name ?? '', messageId: c.id, groveId: c.groveId, text: c.text };
  } else if (req?.kind === 'player') {
    const p = req.playerId ? await ctx.repo.getPlayer(String(req.playerId)) : null;
    if (!p) throw fail(404, 'not_found', 'report.no_player');
    if (p.id === me.id) throw fail(400, 'bad_request', 'report.self');
    r = { ...base, kind: 'player', targetId: p.id, targetName: p.name, messageId: null, groveId: null, text: null };
  } else {
    throw fail(400, 'bad_request', 'report.bad_kind');
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
  if (!id || id === me.id) throw fail(400, 'bad_request', 'block.self');
  const p = await ctx.repo.getPlayer(id);
  if (!p) throw fail(404, 'not_found', 'report.no_player');
  const list = await ctx.repo.blocksOf(me.id);
  if (list.length >= MAX_BLOCKS && !list.some((b) => b.blockedId === id)) throw fail(409, 'full', 'block.full');
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
  const first = hours > 48 ? msg('chat.muted_days', { days: Math.ceil(hours / 24), until: utcDate(until) }) : msg('chat.muted_hours', { hours, until: utcDate(until) });
  throw fail(403, 'muted', first.key, first.params, { more: [...(me.muteReason ? [reasonMessage(me.muteReason)] : []), appeal(ctx)] });
}

// ------------------------------------------------------------------ notices (re-audit: EU DSA 16(5), 17)

/** Words a player understands, for each report reason. */
export const REASON_TEXT = Object.fromEntries(REPORT_REASONS.map((r) => [r, english([msg(`moderation.rule.${r}`)])])) as Record<ReportReason, string>;

/** How to disagree with a decision, in English (the notice and error texts use `appeal`, its code). */
export function appealText(ctx: ServerContext): string {
  return english([appeal(ctx)]);
}

/**
 * "Reason: …." for a stored reason (`REASON_TEXT` words, maybe with a moderator's note in brackets).
 * The words become the game's own text in the player's language; the note stays as the moderator wrote it.
 */
export function reasonMessage(stored: string): ServerMessage {
  for (const words of Object.values(REASON_TEXT)) {
    if (stored === words) return msg('moderation.reason', { reason: words });
    if (stored.startsWith(`${words} (`) && stored.endsWith(')')) return msg('moderation.reason_note', { reason: words, note: stored.slice(words.length + 2, -1) });
  }
  return msg('moderation.reason', { reason: stored });
}

/** Most notices kept per player (older ones are only listed, newest first, up to this many). */
export const MAX_NOTICES = 50;

/** A notice as codes (`core/errors.ts`); its English text is kept for older games. */
export async function notify(ctx: ServerContext, playerId: string, kind: PlayerNotice['kind'], parts: ServerMessage[]): Promise<void> {
  await ctx.repo.addNotice({ id: ctx.uuid(), playerId, at: ctx.now(), kind, text: english(parts), read: false, parts });
  ctx.metrics.count('tk_notices_total', { kind });
}

/** GET /v1/notices */
export async function notices(ctx: ServerContext, me: Player): Promise<NoticesResponse> {
  return { notices: (await ctx.repo.noticesOf(me.id, MAX_NOTICES)).map((n) => ({ id: n.id, at: n.at, kind: n.kind, text: n.text, read: n.read, ...(n.parts?.length ? { parts: n.parts } : {}) })) };
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
  if (!r) throw staffError(404, 'not_found', 'No such report.');
  if (r.status !== 'open') throw staffError(409, 'conflict', 'That report was already handled.');
  const action = body?.action as ModerationAction;
  if (action !== 'dismiss' && action !== 'remove_message' && action !== 'mute') throw staffError(400, 'bad_request', "action must be 'dismiss', 'remove_message' or 'mute'");
  if (action === 'remove_message' && !r.messageId) throw staffError(400, 'bad_request', 'That report is about a player, not a message.');
  const t = ctx.now();
  const note = text(body?.note, 500);
  let resolution: string;
  const same = r.messageId ? await ctx.repo.openReportsOn(r.messageId) : [r];
  // The rule broken, in words: what most reporters picked (staff's note adds detail).
  const counts = new Map<ReportReason, number>();
  for (const x of same) counts.set(x.reason, (counts.get(x.reason) ?? 0) + 1);
  const reason = REASON_TEXT[[...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? r.reason] ?? REASON_TEXT.other;
  const why = note ? msg('moderation.reason_note', { reason, note }) : msg('moderation.reason', { reason });
  const quote = r.text ? (r.text.length > 80 ? `${r.text.slice(0, 80)}…` : r.text) : '';
  let outcome: ServerMessage;
  let toTarget: ServerMessage | null = null;
  if (action === 'dismiss') {
    if (r.messageId) await ctx.repo.setChatHidden(r.messageId, false);
    resolution = note || 'No action needed.';
    outcome = msg('moderation.outcome_none');
  } else if (action === 'remove_message') {
    await ctx.repo.setChatHidden(r.messageId!, true);
    resolution = note || 'Message removed.';
    outcome = msg('moderation.outcome_removed');
    toTarget = quote ? msg('moderation.message_removed_quote', { quote }) : msg('moderation.message_removed');
  } else {
    const hours = Math.max(1, Math.min(MAX_MUTE_HOURS, Math.floor(Number(body?.hours ?? 24)) || 24));
    const target = await ctx.repo.getPlayer(r.targetId);
    const until = Math.max(target?.mutedUntil ?? 0, t + hours * HOUR);
    if (target) await ctx.repo.updatePlayer(target.id, { mutedUntil: until, muteReason: `${reason}${note ? ` (${note})` : ''}`.slice(0, 300) });
    if (r.messageId) await ctx.repo.setChatHidden(r.messageId, true);
    resolution = note || `Chat muted for ${hours} hours${r.messageId ? '; message removed' : ''}.`;
    outcome = msg(r.messageId ? 'moderation.outcome_paused_removed' : 'moderation.outcome_paused');
    toTarget = !r.messageId ? msg('moderation.chat_paused', { until: utcDate(until) }) : quote ? msg('moderation.chat_paused_removed_quote', { until: utcDate(until), quote }) : msg('moderation.chat_paused_removed', { until: utcDate(until) });
  }
  const status = action === 'dismiss' ? 'dismissed' : 'actioned';
  for (const x of same) await ctx.repo.resolveReport(x.id, status, resolution, t);
  // Statement of reasons to the affected player, outcome to each reporter (never naming the reporters).
  if (toTarget) await notify(ctx, r.targetId, 'moderation_action', [toTarget, why, appeal(ctx)]);
  const about = msg(r.kind === 'chat' ? 'moderation.reviewed_message' : 'moderation.reviewed_player', { name: isolateName(r.targetName) });
  for (const reporter of new Set(same.map((x) => x.reporterId))) await notify(ctx, reporter, 'report_outcome', [about, outcome]);
  return (await ctx.repo.getReport(r.id))!;
}
