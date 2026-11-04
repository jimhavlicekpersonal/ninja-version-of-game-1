/**
 * Gangs (roadmap step 63): teams of 2-4 friends, separate from Alliances (a
 * player can be in one of each). The leader names the Gang and invites
 * friends; an invitee must still be the leader's friend to join. Roles:
 * leader and member; the leader can hand over, and when the leader leaves the
 * longest-serving member takes over (a Gang with nobody left is closed).
 * After leaving, 24 hours pass before joining or starting another. Gang chat
 * and troop gifts reuse the Alliance's, scoped to `squad:<id>` (filtered
 * chat, reports and blocks, gifts from the donor's real army).
 */
import type { ChatResponse, ChatView, DonateRequest, DonateResponse, GangInviteView, GangView, MyGangResponse, RequestView, RequestsResponse } from '../../src/backend/net/protocol';
import { filterText } from '../../src/gameplay/sim/social/grove';
import type { Player, Squad } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';
import { card } from './friends';
import { chatIn, donateIn, postIn, requestIn, requestsIn } from './groves';

export const GANG_MAX = 4;
export const GANG_COOLDOWN_MS = 24 * HOUR;
const INVITE_DAYS = 14;

export const gangScope = (id: string) => `squad:${id}`;

async function system(ctx: ServerContext, squadId: string, text: string): Promise<void> {
  await ctx.repo.addChat({ id: ctx.uuid(), groveId: gangScope(squadId), at: ctx.now(), playerId: null, name: null, text, kind: 'system' });
}

function cleanGangName(raw: unknown, ctx: ServerContext): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 20) throw new ApiError(400, 'bad_request', 'Gang names are 3 to 20 characters.');
  if (filterText(name, ctx.data) !== name) throw new ApiError(400, 'bad_request', "That name isn't allowed.");
  return name;
}

async function requireGang(ctx: ServerContext, me: Player): Promise<{ gang: Squad; role: 'leader' | 'member' }> {
  const gang = await ctx.repo.squadOf(me.id);
  if (!gang) throw new ApiError(404, 'not_found', 'You are not in a Gang.');
  const role = (await ctx.repo.squadMembers(gang.id)).find((m) => m.playerId === me.id)?.role ?? 'member';
  return { gang, role };
}

/** No joining, leaving or inviting while the Gang fights a war (the roster is locked; Gang Wars are step 65). */
async function assertNotAtWar(ctx: ServerContext, squadId: string): Promise<void> {
  void ctx;
  void squadId;
}

function canJoinAt(me: Player): number {
  return me.squadLeftAt ? me.squadLeftAt + GANG_COOLDOWN_MS : 0;
}

async function view(ctx: ServerContext, me: Player, gang: Squad): Promise<GangView> {
  const rows = await ctx.repo.squadMembers(gang.id);
  const players = new Map((await ctx.repo.playersByIds(rows.map((r) => r.playerId))).map((p) => [p.id, p]));
  const members = rows
    .map((r) => {
      const p = players.get(r.playerId);
      return p ? { id: p.id, name: p.name, role: r.role, hallLevel: p.hallLevel, honor: p.trophies, lastSeen: p.hideOnline ? null : p.lastSeenAt, staff: Boolean(p.staff) } : null;
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const open = (await ctx.repo.squadInvitesFrom(gang.id)).filter((i) => ctx.now() - i.at < INVITE_DAYS * 24 * HOUR);
  const invited = new Map((await ctx.repo.playersByIds(open.map((i) => i.toId))).map((p) => [p.id, p]));
  return {
    id: gang.id,
    name: gang.name,
    members,
    you: { role: rows.find((r) => r.playerId === me.id)?.role ?? 'member' },
    invites: open.filter((i) => invited.has(i.toId)).map((i) => ({ id: i.id, at: i.at, player: card(ctx, invited.get(i.toId)!, gang.name) })),
    max: GANG_MAX,
  };
}

export async function myGang(ctx: ServerContext, me: Player): Promise<MyGangResponse> {
  const gang = await ctx.repo.squadOf(me.id);
  const invites: GangInviteView[] = [];
  for (const i of await ctx.repo.squadInvitesTo(me.id)) {
    if (ctx.now() - i.at >= INVITE_DAYS * 24 * HOUR) continue;
    const g = await ctx.repo.getSquad(i.squadId);
    const from = await ctx.repo.getPlayer(i.fromId);
    if (g && from) invites.push({ id: i.id, at: i.at, gang: { id: g.id, name: g.name, members: (await ctx.repo.squadMembers(g.id)).length }, from: from.name });
  }
  const until = canJoinAt(me);
  return { gang: gang ? await view(ctx, me, gang) : null, invites, canJoinAt: until > ctx.now() ? until : 0 };
}

export async function createGang(ctx: ServerContext, me: Player, rawName: unknown): Promise<MyGangResponse> {
  const name = cleanGangName(rawName, ctx);
  if (await ctx.repo.squadOf(me.id)) throw new ApiError(409, 'conflict', 'Leave your Gang first.');
  if (canJoinAt(me) > ctx.now()) throw new ApiError(409, 'cooldown', 'You left a Gang less than a day ago. Try again later.');
  const gang: Squad = { id: ctx.uuid(), name, leaderId: me.id, createdAt: ctx.now() };
  if (!(await ctx.repo.createSquad(gang, { squadId: gang.id, playerId: me.id, role: 'leader', joinedAt: ctx.now() }))) throw new ApiError(409, 'conflict', 'Leave your Gang first.');
  await system(ctx, gang.id, `${me.name} started ${name}.`);
  return myGang(ctx, me);
}

/** The leader invites a friend (every member is a friend of the leader). */
export async function invite(ctx: ServerContext, me: Player, friendId: unknown): Promise<MyGangResponse> {
  const { gang, role } = await requireGang(ctx, me);
  if (role !== 'leader') throw new ApiError(403, 'bad_request', 'Only the leader invites.');
  await assertNotAtWar(ctx, gang.id);
  const id = String(friendId ?? '');
  if (!(await ctx.repo.friendsOf(me.id)).some((f) => f.id === id)) throw new ApiError(400, 'bad_request', 'Invite a friend: Gang members are friends of the leader.');
  const size = (await ctx.repo.squadMembers(gang.id)).length;
  const open = (await ctx.repo.squadInvitesFrom(gang.id)).filter((i) => ctx.now() - i.at < INVITE_DAYS * 24 * HOUR);
  if (size + open.length >= GANG_MAX) throw new ApiError(409, 'full', `A Gang has at most ${GANG_MAX} members, counting open invites.`);
  if ((await ctx.repo.squadMembers(gang.id)).some((m) => m.playerId === id)) throw new ApiError(409, 'conflict', 'They are already in your Gang.');
  await ctx.repo.addSquadInvite({ id: ctx.uuid(), squadId: gang.id, fromId: me.id, toId: id, at: ctx.now(), status: 'open' });
  ctx.push.notify(id, { type: 'friends', title: 'Gang invite', body: `${me.name} invites you to the Gang ${gang.name}.` });
  return myGang(ctx, me);
}

/** Accept or decline an invite (the invitee), or withdraw it (the leader). */
export async function answerInvite(ctx: ServerContext, me: Player, id: string, body: { accept?: unknown } | undefined): Promise<MyGangResponse> {
  const inv = await ctx.repo.getSquadInvite(String(id));
  if (!inv || inv.status !== 'open' || ctx.now() - inv.at >= INVITE_DAYS * 24 * HOUR) throw new ApiError(404, 'not_found', 'That invite is no longer open.');
  const gang = await ctx.repo.getSquad(inv.squadId);
  if (!gang) throw new ApiError(404, 'not_found', 'That Gang is gone.');
  if (inv.toId !== me.id) {
    if (gang.leaderId !== me.id) throw new ApiError(404, 'not_found', 'That invite is no longer open.');
    await ctx.repo.closeSquadInvite(inv.id, 'cancelled');
    return myGang(ctx, me);
  }
  if (body?.accept !== true) {
    await ctx.repo.closeSquadInvite(inv.id, 'declined');
    return myGang(ctx, me);
  }
  if (await ctx.repo.squadOf(me.id)) throw new ApiError(409, 'conflict', 'Leave your Gang first.');
  if (canJoinAt(me) > ctx.now()) throw new ApiError(409, 'cooldown', 'You left a Gang less than a day ago. Try again later.');
  await assertNotAtWar(ctx, gang.id);
  if (!(await ctx.repo.friendsOf(me.id)).some((f) => f.id === gang.leaderId)) throw new ApiError(409, 'conflict', 'You are no longer friends with the leader.');
  const members = await ctx.repo.squadMembers(gang.id);
  if (members.length >= GANG_MAX) throw new ApiError(409, 'full', 'That Gang is full.');
  if (!(await ctx.repo.addSquadMember({ squadId: gang.id, playerId: me.id, role: 'member', joinedAt: ctx.now() }))) throw new ApiError(409, 'conflict', 'Leave your Gang first.');
  await ctx.repo.closeSquadInvite(inv.id, 'accepted');
  // Other invites to this player are void now.
  for (const other of await ctx.repo.squadInvitesTo(me.id)) await ctx.repo.closeSquadInvite(other.id, 'cancelled');
  await system(ctx, gang.id, `${me.name} joined the Gang.`);
  return myGang(ctx, me);
}

/** `quiet`: the player is deleting their account (the notice does not name them; no cooldown is kept). */
export async function leaveGang(ctx: ServerContext, me: Player, opts: { quiet?: boolean } = {}): Promise<MyGangResponse> {
  const { gang, role } = await requireGang(ctx, me);
  if (!opts.quiet) await assertNotAtWar(ctx, gang.id);
  await ctx.repo.removeSquadMember(gang.id, me.id);
  await ctx.repo.closeRequestsOf(me.id);
  if (!opts.quiet) await ctx.repo.updatePlayer(me.id, { squadLeftAt: ctx.now() });
  const rest = await ctx.repo.squadMembers(gang.id);
  if (!rest.length) {
    await ctx.repo.deleteSquad(gang.id);
  } else {
    await system(ctx, gang.id, opts.quiet ? 'A member left the Gang.' : `${me.name} left the Gang.`);
    if (role === 'leader') {
      // The longest-serving member leads now.
      await ctx.repo.setSquadLeader(gang.id, rest[0].playerId);
      const p = await ctx.repo.getPlayer(rest[0].playerId);
      if (p) await system(ctx, gang.id, `${p.name} leads the Gang now.`);
    }
  }
  return myGang(ctx, { ...me, squadLeftAt: opts.quiet ? me.squadLeftAt : ctx.now() });
}

export async function handOver(ctx: ServerContext, me: Player, playerId: unknown): Promise<MyGangResponse> {
  const { gang, role } = await requireGang(ctx, me);
  if (role !== 'leader') throw new ApiError(403, 'bad_request', 'Only the leader can hand over.');
  const id = String(playerId ?? '');
  if (!(await ctx.repo.squadMembers(gang.id)).some((m) => m.playerId === id) || id === me.id) throw new ApiError(400, 'bad_request', 'Pick another member.');
  await ctx.repo.setSquadLeader(gang.id, id);
  const p = await ctx.repo.getPlayer(id);
  await system(ctx, gang.id, `${me.name} handed the Gang to ${p?.name ?? 'a member'}.`);
  return myGang(ctx, me);
}

export async function gangChat(ctx: ServerContext, me: Player, after: string | undefined): Promise<ChatResponse> {
  const { gang } = await requireGang(ctx, me);
  return chatIn(ctx, me, gangScope(gang.id), after);
}

export async function postGangChat(ctx: ServerContext, me: Player, text: unknown): Promise<ChatView> {
  const { gang } = await requireGang(ctx, me);
  return postIn(ctx, me, gangScope(gang.id), text);
}

export async function gangRequests(ctx: ServerContext, me: Player): Promise<RequestsResponse> {
  const { gang } = await requireGang(ctx, me);
  return requestsIn(ctx, me, gangScope(gang.id));
}

export async function gangRequestTroops(ctx: ServerContext, me: Player, capacity: unknown): Promise<RequestView> {
  const { gang } = await requireGang(ctx, me);
  return requestIn(ctx, me, gangScope(gang.id), capacity);
}

export async function gangDonate(ctx: ServerContext, me: Player, requestId: string, req: DonateRequest): Promise<DonateResponse> {
  const { gang } = await requireGang(ctx, me);
  return donateIn(ctx, me, gangScope(gang.id), requestId, req);
}
