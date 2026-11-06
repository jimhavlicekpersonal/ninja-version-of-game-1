/** Real Groves: membership, filtered chat, troop requests and donations. */
import { filterText } from '../../src/gameplay/sim/social/grove';
import { isolateName } from '../../src/gameplay/sim/social/names';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import type { ChatResponse, ChatView, DonateRequest, DonateResponse, GroveSummary, GroveView, GrovesResponse, InboxResponse, MemberView, RequestView, RequestsResponse } from '../../src/backend/net/protocol';
import type { ChatRow, Grove, Player, TroopRequest } from '../repo';
import { requireRules } from './rules';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { chosenName } from './identity';
import { blockedIds, checkNotMuted } from './moderation';
import { checkChatAllowed } from './age';
import { maxReinforcementAt } from './pvp';
import { applyServerResult } from './village';


/** Longest chat message accepted (the game's input allows 160 characters). */
export const CHAT_MAX_CHARS = 200;

export function maxMembers(ctx: ServerContext): number {
  return ctx.data.social.membersMax;
}

/** Largest Grove Lodge a player at this hall level can have. */
export function maxReinforcement(hall: number, ctx: ServerContext): number {
  return maxReinforcementAt(hall, ctx.data);
}

async function requireGrove(ctx: ServerContext, me: Player): Promise<{ grove: Grove; role: MemberView['role']; xp: number; joinedAt: number }> {
  const m = await ctx.repo.getMembership(me.id);
  const grove = m ? await ctx.repo.getGrove(m.groveId) : null;
  if (!m || !grove) throw new ApiError(404, 'not_in_grove', 'You are not in an Alliance.');
  return { grove, role: m.role, xp: m.xp, joinedAt: m.joinedAt };
}

export { requireGrove };

function chatView(c: ChatRow): ChatView {
  return { id: c.id, at: c.at, from: c.playerId ? { id: c.playerId, name: c.name ?? 'Friend' } : null, text: c.text, kind: c.kind };
}

async function system(ctx: ServerContext, groveId: string, text: string): Promise<void> {
  await ctx.repo.addChat({ id: ctx.uuid(), groveId, at: ctx.now(), playerId: null, name: null, text, kind: 'system' });
}

export async function groveView(ctx: ServerContext, me: Player, grove: Grove): Promise<GroveView> {
  const rows = await ctx.repo.members(grove.id);
  const members: MemberView[] = [];
  for (const r of rows) {
    const p = await ctx.repo.getPlayer(r.playerId);
    if (!p) continue;
    members.push({ id: p.id, name: p.name, role: r.role, trophies: p.trophies, hallLevel: p.hallLevel, lastSeenAt: p.lastSeenAt, xp: r.xp });
  }
  members.sort((a, b) => b.trophies - a.trophies);
  const mine = rows.find((r) => r.playerId === me.id);
  return { id: grove.id, name: grove.name, color: grove.color, maxMembers: maxMembers(ctx), members, you: { id: me.id, role: mine?.role ?? 'Member', xp: mine?.xp ?? 0 } };
}

export async function listGroves(ctx: ServerContext, me: Player, query: string): Promise<GrovesResponse> {
  const rows = await ctx.repo.listGroves(String(query ?? ''), 200);
  const max = maxMembers(ctx);
  const groves: GroveSummary[] = rows
    .filter((g) => g.members < max)
    .sort((a, b) => Math.abs(a.averageTrophies - me.trophies) - Math.abs(b.averageTrophies - me.trophies) || b.lastActiveAt - a.lastActiveAt)
    .slice(0, 30)
    .map((g) => ({ id: g.id, name: g.name, color: g.color, members: g.members, maxMembers: max, averageTrophies: g.averageTrophies }));
  return { groves };
}

export async function createGrove(ctx: ServerContext, me: Player, name: unknown): Promise<GroveView> {
  requireRules(ctx, me);
  if (await ctx.repo.getMembership(me.id)) throw new ApiError(409, 'already_in_grove', 'Leave your Alliance first.');
  const clean = chosenName(name, ctx);
  const colors = ctx.data.social.colors;
  const grove: Grove = { id: ctx.uuid(), name: clean, color: colors[Math.floor(ctx.random() * colors.length)], createdAt: ctx.now() };
  await ctx.repo.createGrove(grove);
  if (!(await ctx.repo.addMember({ groveId: grove.id, playerId: me.id, role: 'Leader', joinedAt: ctx.now(), xp: 0 }))) throw new ApiError(409, 'already_in_grove', 'Leave your Alliance first.');
  await ctx.repo.updatePlayer(me.id, { groveId: grove.id });
  await system(ctx, grove.id, `${isolateName(me.name)} founded ${isolateName(grove.name)}!`);
  return groveView(ctx, { ...me, groveId: grove.id }, grove);
}

export async function joinGrove(ctx: ServerContext, me: Player, id: string): Promise<GroveView> {
  if (await ctx.repo.getMembership(me.id)) throw new ApiError(409, 'already_in_grove', 'Leave your Alliance first.');
  const grove = await ctx.repo.getGrove(String(id));
  if (!grove) throw new ApiError(404, 'not_found', 'That Alliance does not exist.');
  const rows = await ctx.repo.members(grove.id);
  if (!rows.length) throw new ApiError(404, 'not_found', 'That Alliance is empty.');
  if (rows.length >= maxMembers(ctx)) throw new ApiError(409, 'full', 'That Alliance is full.');
  if (!(await ctx.repo.addMember({ groveId: grove.id, playerId: me.id, role: 'Member', joinedAt: ctx.now(), xp: 0 }))) throw new ApiError(409, 'already_in_grove', 'Leave your Alliance first.');
  await ctx.repo.updatePlayer(me.id, { groveId: grove.id });
  await system(ctx, grove.id, `${isolateName(me.name)} joined the Alliance. Say hello!`);
  return groveView(ctx, { ...me, groveId: grove.id }, grove);
}

/** `quiet`: the player is deleting their account, so the notice does not name them. */
export async function leaveGrove(ctx: ServerContext, me: Player, opts: { quiet?: boolean } = {}): Promise<void> {
  const { grove, role } = await requireGrove(ctx, me);
  await ctx.repo.removeMember(grove.id, me.id);
  await ctx.repo.updatePlayer(me.id, { groveId: null });
  await ctx.repo.closeRequestsOf(me.id);
  await system(ctx, grove.id, opts.quiet ? 'A member left the Alliance.' : `${isolateName(me.name)} left the Alliance.`);
  if (role === 'Leader') {
    // Hand leadership to the longest-serving member.
    const rest = (await ctx.repo.members(grove.id)).sort((a, b) => (a.role === 'Elder' ? 0 : 1) - (b.role === 'Elder' ? 0 : 1) || a.joinedAt - b.joinedAt);
    if (rest[0]) {
      await ctx.repo.updateMember(grove.id, rest[0].playerId, { role: 'Leader' });
      const p = await ctx.repo.getPlayer(rest[0].playerId);
      if (p) await system(ctx, grove.id, `${isolateName(p.name)} is the new leader.`);
    }
  }
}

/** The player's Grove, or null when they are not in one. */
export async function myGrove(ctx: ServerContext, me: Player): Promise<GroveView | null> {
  const m = await ctx.repo.getMembership(me.id);
  const grove = m ? await ctx.repo.getGrove(m.groveId) : null;
  return grove ? groveView(ctx, me, grove) : null;
}

export async function chat(ctx: ServerContext, me: Player, after: string | undefined): Promise<ChatResponse> {
  const { grove } = await requireGrove(ctx, me);
  return chatIn(ctx, me, grove.id, after);
}

/** Chat of an Alliance or a Gang (step 63: Gangs keep their chat in the same table, under the Gang's id). */
export async function chatIn(ctx: ServerContext, me: Player, scopeId: string, after: string | undefined): Promise<ChatResponse> {
  const grove = { id: scopeId };
  const afterSeq = Number(after ?? 0) || 0;
  const rows = await ctx.repo.chatAfter(grove.id, afterSeq, 100);
  const cursor = rows.length ? String(rows[rows.length - 1].seq) : String(afterSeq);
  // Players the caller blocked are not shown to them; hidden messages are not shown to anyone.
  const blocked = await blockedIds(ctx, me);
  const messages = rows.filter((r) => !r.playerId || !blocked.has(r.playerId)).map(chatView);
  return { messages, cursor, hidden: await ctx.repo.hiddenChatIds(grove.id, 100) };
}

export async function postChat(ctx: ServerContext, me: Player, text: unknown): Promise<ChatView> {
  const { grove } = await requireGrove(ctx, me);
  return postChatIn(ctx, me, grove.id, text);
}

export async function postChatIn(ctx: ServerContext, me: Player, scopeId: string, text: unknown): Promise<ChatView> {
  const grove = { id: scopeId };
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) throw new ApiError(400, 'bad_request', 'Type a message first.');
  if (raw.length > CHAT_MAX_CHARS) throw new ApiError(400, 'bad_request', `Keep messages under ${CHAT_MAX_CHARS} characters.`);
  checkNotMuted(ctx, me);
  requireRules(ctx, me);
  // Under 13 (re-audit): the fixed phrases only, never free text.
  await checkChatAllowed(ctx, me, raw);
  if ((await ctx.repo.recentChatCount(me.id, ctx.now() - MIN)) >= ctx.data.social.chatPerMinute) throw new ApiError(429, 'cooldown', 'Slow down a little!');
  // Chat is always filtered (also for players who are not under 18).
  const row = await ctx.repo.addChat({ id: ctx.uuid(), groveId: grove.id, at: ctx.now(), playerId: me.id, name: me.name, text: filterText(raw, ctx.data), kind: 'chat' });
  return chatView(row);
}

function requestView(r: TroopRequest, me: Player): RequestView {
  return { id: r.id, at: r.at, playerId: r.playerId, name: r.name, size: r.size, filled: r.filled, mine: r.playerId === me.id };
}

export async function requests(ctx: ServerContext, me: Player): Promise<RequestsResponse> {
  const { grove } = await requireGrove(ctx, me);
  return requestsIn(ctx, me, grove.id);
}

export async function requestsIn(ctx: ServerContext, me: Player, scopeId: string): Promise<RequestsResponse> {
  const grove = { id: scopeId };
  const blocked = await blockedIds(ctx, me);
  const list = (await ctx.repo.openRequests(grove.id, ctx.now() - ctx.data.social.requestLifetimeHours * HOUR)).filter((r) => !blocked.has(r.playerId));
  const last = await ctx.repo.lastRequestAt(me.id);
  const next = last ? last + ctx.data.social.requestCooldownMinutes * MIN : 0;
  return { requests: list.map((r) => requestView(r, me)), nextRequestAt: next > ctx.now() ? next : 0 };
}

export async function requestTroops(ctx: ServerContext, me: Player, capacity: unknown): Promise<RequestView> {
  const { grove } = await requireGrove(ctx, me);
  return requestTroopsIn(ctx, me, grove.id, capacity);
}

/** A troop request in an Alliance or a Gang. A player has one open request at a time (their Lodge is one Lodge). */
export async function requestTroopsIn(ctx: ServerContext, me: Player, scopeId: string, capacity: unknown): Promise<RequestView> {
  const grove = { id: scopeId };
  const t = ctx.now();
  const last = await ctx.repo.lastRequestAt(me.id);
  if (last && t < last + ctx.data.social.requestCooldownMinutes * MIN) throw new ApiError(429, 'cooldown', 'You can ask again soon.');
  const size = Math.min(Math.floor(Number(capacity) || 0), maxReinforcement(me.hallLevel, ctx));
  if (size <= 0) throw new ApiError(400, 'bad_request', 'Build an Alliance Lodge with free space first.');
  await ctx.repo.closeRequestsOf(me.id);
  const r: TroopRequest = { id: ctx.uuid(), groveId: grove.id, playerId: me.id, name: me.name, at: t, size, filled: 0, open: true };
  await ctx.repo.addRequest(r);
  await ctx.repo.addChat({ id: ctx.uuid(), groveId: grove.id, at: t, playerId: me.id, name: me.name, text: `Could anyone spare ${size} housing of troops?`, kind: 'request' });
  return requestView(r, me);
}

export async function donate(ctx: ServerContext, me: Player, requestId: string, req: DonateRequest): Promise<DonateResponse> {
  const { grove } = await requireGrove(ctx, me);
  return donateIn(ctx, me, grove.id, requestId, req, true);
}

/** Fill a request in an Alliance (with Alliance XP) or a Gang (`xpToAlliance` false). */
export async function donateIn(ctx: ServerContext, me: Player, scopeId: string, requestId: string, req: DonateRequest, xpToAlliance: boolean): Promise<DonateResponse> {
  const grove = { id: scopeId };
  const r = await ctx.repo.getRequest(String(requestId));
  if (!r || r.groveId !== grove.id || !r.open || ctx.now() - r.at > ctx.data.social.requestLifetimeHours * HOUR) throw new ApiError(404, 'not_found', 'That request is gone.');
  if (r.playerId === me.id) throw new ApiError(400, 'bad_request', 'You cannot fill your own request.');
  const def = ctx.data.troops[req?.troop];
  const count = Math.floor(Number(req?.count) || 0);
  const level = Math.floor(Number(req?.level) || 1);
  if (!def || count <= 0) throw new ApiError(400, 'bad_request', 'Pick a troop to donate.');
  if (me.hallLevel < (def.unlockKeep ?? 1) || level < 1 || level > Math.min(troopLevelCapAt(me.hallLevel, ctx.data, req!.troop), def.levels.length)) throw new ApiError(400, 'bad_request', 'bad troop level');
  const housing = def.housing * count;
  const xp = housing * ctx.data.social.xpPerHousing;
  const donationId = ctx.uuid();
  // One transaction: the request's room, the gift, and (roadmap step 23) server-held armies on both sides.
  const updated = await ctx.repo.transaction(async (tx) => {
    const filled = await tx.fillRequest(r.id, housing);
    if (!filled) throw new ApiError(409, 'full', 'That request does not have room for those troops.');
    // A donor whose village the server keeps gives warriors from that real army.
    const spent = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'spendDonation', troop: req.troop, count, xp: xpToAlliance ? xp : 0 }, reason: 'donation:sent' }], donationId);
    if (spent && !spent.ok) throw new ApiError(400, 'bad_request', 'Your army on the server does not have those warriors.');
    if (xpToAlliance) {
      const mine = await tx.getMembership(me.id);
      await tx.updateMember(grove.id, me.id, { xp: (mine?.xp ?? 0) + xp });
    }
    await tx.addDonation({ id: donationId, requestId: r.id, groveId: grove.id, fromId: me.id, fromName: me.name, toId: r.playerId, troop: req.troop, count, level, at: ctx.now(), delivered: false });
    await tx.addChat({ id: ctx.uuid(), groveId: grove.id, at: ctx.now(), playerId: me.id, name: me.name, text: `Sent ${count} ${def.name}${count > 1 ? 's' : ''} to ${r.name}.`, kind: 'donation' });
    // A receiver whose village the server keeps gets them in its Lodge now (same donation id, so the game's own copy is not added twice).
    const to = await tx.getPlayer(r.playerId);
    if (to) await applyServerResult(tx, ctx, to, [{ cmd: { type: 'receiveDonations', items: [{ id: donationId, troop: req.troop, count, fromName: me.name, level }] }, reason: 'donation:received' }], donationId);
    return filled;
  });
  ctx.push.notify(r.playerId, { type: 'donations', title: 'Warriors arrived', body: `${me.name} sent you ${count} ${def.name}${count > 1 ? 's' : ''}.` });
  return { request: requestView(updated, me), xp: xpToAlliance ? xp : 0 };
}

export async function inbox(ctx: ServerContext, me: Player): Promise<InboxResponse> {
  const list = await ctx.repo.undelivered(me.id);
  return { donations: list.map((d) => ({ id: d.id, at: d.at, fromName: d.fromName, troop: d.troop, count: d.count, level: d.level })) };
}

export async function ackInbox(ctx: ServerContext, me: Player, ids: unknown): Promise<void> {
  if (!Array.isArray(ids)) throw new ApiError(400, 'bad_request', 'ids must be a list');
  await ctx.repo.markDelivered(me.id, ids.map(String).slice(0, 200));
}
