import { isolateName } from '../../src/gameplay/sim/social/names';
/**
 * Gangs (roadmap step 63; design in docs/backend/PVP_ROADMAP.md 5.4): a team
 * of 2-4 players who are all friends with its leader. Separate from
 * Alliances: a player can be in one of each.
 *
 * - Found one (you lead it), invite friends (leader only; invites last 7
 *   days), accept or decline, hand leadership over, leave. A leaving leader
 *   hands over to the longest-serving member; the last one out closes it.
 * - After leaving, 24 hours before joining another Gang.
 * - While a Gang War runs, nobody joins or leaves (the roster is locked;
 *   gangWars.ts says when).
 * - Gang chat and troop requests use the Alliance code (groves.ts `chatIn`,
 *   `requestTroopsIn`, `donateIn`) under the Gang's id: same filter, rate
 *   limits, mutes, blocks, reports, and gifts in the usual inbox.
 */
import { filterText } from '../../src/gameplay/sim/social/grove';
import type { ChatResponse, ChatView, DonateRequest, DonateResponse, RequestsResponse, RequestView, SquadInviteView, SquadMemberView, SquadResponse, SquadView } from '../../src/backend/net/protocol';
import type { Player, Squad, SquadMember } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';
import { chatIn, donateIn, postChatIn, requestsIn, requestTroopsIn } from './groves';
import { isReservedName } from '../../src/backend/net/names';

export const SQUAD_MAX = 4;
export const SQUAD_INVITE_DAYS = 7;
export const SQUAD_REJOIN_HOURS = 24;
const DAY = 24 * HOUR;

/** Whether a Gang War holds this Gang's roster (set by gangWars.ts). */
let rosterLocked: (ctx: ServerContext, squadId: string) => Promise<boolean> = async () => false;
export function setRosterLock(fn: typeof rosterLocked): void {
  rosterLocked = fn;
}

export async function requireSquad(ctx: ServerContext, me: Player): Promise<{ squad: Squad; member: SquadMember }> {
  const member = await ctx.repo.squadOf(me.id);
  const squad = member ? await ctx.repo.getSquad(member.squadId) : null;
  if (!member || !squad) throw new ApiError(404, 'not_found', 'You are not in a Gang.');
  return { squad, member };
}

function cleanSquadName(raw: unknown, ctx: ServerContext): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 24) throw new ApiError(400, 'bad_request', 'A Gang name has 3-24 characters.');
  if (filterText(name, ctx.data) !== name || isReservedName(name)) throw new ApiError(400, 'bad_request', 'That Gang name is not allowed.');
  return name;
}

async function areFriends(ctx: ServerContext, a: string, b: string): Promise<boolean> {
  return (await ctx.repo.friendsOf(a)).some((f) => f.id === b);
}

async function system(ctx: ServerContext, squadId: string, text: string): Promise<void> {
  await ctx.repo.addChat({ id: ctx.uuid(), groveId: squadId, at: ctx.now(), playerId: null, name: null, text, kind: 'system' });
}

function canJoinAt(ctx: ServerContext, me: Player): number {
  const at = (me.squadLeftAt ?? 0) + SQUAD_REJOIN_HOURS * HOUR;
  return at > ctx.now() ? at : 0;
}

export async function squadView(ctx: ServerContext, me: Player, squad: Squad): Promise<SquadView> {
  const members: SquadMemberView[] = [];
  for (const m of await ctx.repo.squadMembers(squad.id)) {
    const p = await ctx.repo.getPlayer(m.playerId);
    if (!p) continue;
    members.push({ id: p.id, name: p.name, keep: p.hallLevel, honor: p.trophies, role: m.role, joinedAt: m.joinedAt, ...(p.showOnline !== false ? { lastSeen: p.lastSeenAt } : {}), you: p.id === me.id });
  }
  const invited: SquadView['invited'] = [];
  for (const i of await ctx.repo.squadInvitesFrom(squad.id, ctx.now() - SQUAD_INVITE_DAYS * DAY)) {
    const p = await ctx.repo.getPlayer(i.toId);
    if (p) invited.push({ id: i.id, name: p.name, at: i.at });
  }
  return { id: squad.id, name: squad.name, members, invited, max: SQUAD_MAX, rating: Math.round(squad.rating?.rating ?? ctx.data.ranks.rating.initial), locked: await rosterLocked(ctx, squad.id) };
}

/** GET /v1/squad */
export async function mySquad(ctx: ServerContext, me: Player): Promise<SquadResponse> {
  const member = await ctx.repo.squadOf(me.id);
  const squad = member ? await ctx.repo.getSquad(member.squadId) : null;
  const invites: SquadInviteView[] = [];
  if (!squad) {
    for (const i of await ctx.repo.squadInvitesTo(me.id, ctx.now() - SQUAD_INVITE_DAYS * DAY)) {
      const s = await ctx.repo.getSquad(i.squadId);
      const from = await ctx.repo.getPlayer(i.fromId);
      if (s && from) invites.push({ id: i.id, at: i.at, squad: { id: s.id, name: s.name, members: (await ctx.repo.squadMembers(s.id)).length }, from: { id: from.id, name: from.name } });
    }
  }
  return { squad: squad ? await squadView(ctx, me, squad) : null, invites, canJoinAt: canJoinAt(ctx, me) };
}

/** POST /v1/squad { name }: found a Gang and lead it. */
export async function createSquad(ctx: ServerContext, me: Player, name: unknown): Promise<SquadResponse> {
  const clean = cleanSquadName(name, ctx);
  if (await ctx.repo.squadOf(me.id)) throw new ApiError(409, 'conflict', 'You are already in a Gang. Leave it first.');
  const wait = canJoinAt(ctx, me);
  if (wait) throw new ApiError(429, 'cooldown', `You can found or join a Gang again ${new Date(wait).toUTCString().slice(0, 22)}.`);
  const squad: Squad = { id: ctx.uuid(), name: clean, createdAt: ctx.now() };
  await ctx.repo.transaction(async (tx) => {
    await tx.createSquad(squad);
    if (!(await tx.addSquadMember({ playerId: me.id, squadId: squad.id, role: 'leader', joinedAt: ctx.now() }))) throw new ApiError(409, 'conflict', 'You are already in a Gang.');
    await tx.deleteSquadInvitesTo(me.id);
  });
  await system(ctx, squad.id, `${isolateName(me.name)} founded ${isolateName(clean)}. Invite up to ${SQUAD_MAX - 1} friends.`);
  return mySquad(ctx, me);
}

/** POST /v1/squad/invites { friendId } (leader only). */
export async function invite(ctx: ServerContext, me: Player, friendId: unknown): Promise<SquadResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (member.role !== 'leader') throw new ApiError(403, 'unauthorized', 'Only the Gang leader can invite.');
  if (await rosterLocked(ctx, squad.id)) throw new ApiError(409, 'conflict', 'Your Gang is in a war: the roster is locked until it ends.');
  const id = String(friendId ?? '');
  const p = id ? await ctx.repo.getPlayer(id) : null;
  if (!p || !(await areFriends(ctx, me.id, p.id))) throw new ApiError(404, 'not_found', 'You can only invite your friends.');
  if (await ctx.repo.squadOf(p.id)) throw new ApiError(409, 'conflict', `${isolateName(p.name)} is already in a Gang.`);
  if ((await ctx.repo.squadMembers(squad.id)).length >= SQUAD_MAX) throw new ApiError(409, 'full', `A Gang has at most ${SQUAD_MAX} members.`);
  const open = await ctx.repo.squadInvitesFrom(squad.id, ctx.now() - SQUAD_INVITE_DAYS * DAY);
  if (!open.some((i) => i.toId === p.id)) await ctx.repo.addSquadInvite({ id: ctx.uuid(), squadId: squad.id, fromId: me.id, toId: p.id, at: ctx.now() });
  ctx.push.notify(p.id, { type: 'gang', title: `${isolateName(me.name)} invited you to ${isolateName(squad.name)}`, body: 'Open Friends → Gang to answer.' });
  return mySquad(ctx, me);
}

/** POST /v1/squad/invites/:id { accept } */
export async function answerInvite(ctx: ServerContext, me: Player, id: unknown, accept: unknown): Promise<SquadResponse> {
  const inv = await ctx.repo.getSquadInvite(String(id ?? ''));
  if (!inv || inv.toId !== me.id || inv.at <= ctx.now() - SQUAD_INVITE_DAYS * DAY) throw new ApiError(404, 'not_found', 'That invite is gone.');
  if (accept !== true) {
    await ctx.repo.deleteSquadInvite(inv.id);
    return mySquad(ctx, me);
  }
  const squad = await ctx.repo.getSquad(inv.squadId);
  if (!squad) {
    await ctx.repo.deleteSquadInvite(inv.id);
    throw new ApiError(404, 'not_found', 'That Gang closed.');
  }
  if (await ctx.repo.squadOf(me.id)) throw new ApiError(409, 'conflict', 'You are already in a Gang. Leave it first.');
  const wait = canJoinAt(ctx, me);
  if (wait) throw new ApiError(429, 'cooldown', `You can join a Gang again ${new Date(wait).toUTCString().slice(0, 22)}.`);
  if (await rosterLocked(ctx, squad.id)) throw new ApiError(409, 'conflict', 'That Gang is in a war: it can take new members when the war ends.');
  const members = await ctx.repo.squadMembers(squad.id);
  if (members.length >= SQUAD_MAX) throw new ApiError(409, 'full', 'That Gang is full.');
  const leader = members.find((m) => m.role === 'leader');
  if (!leader || !(await areFriends(ctx, me.id, leader.playerId))) throw new ApiError(409, 'conflict', 'Everyone in a Gang is friends with its leader: you are no longer friends.');
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.addSquadMember({ playerId: me.id, squadId: squad.id, role: 'member', joinedAt: ctx.now() }))) throw new ApiError(409, 'conflict', 'You are already in a Gang.');
    await tx.deleteSquadInvitesTo(me.id);
  });
  await system(ctx, squad.id, `${isolateName(me.name)} joined the Gang.`);
  return mySquad(ctx, me);
}

/** POST /v1/squad/leave. `quiet`: the player is deleting their account (no name in the notice, no war lock). */
export async function leave(ctx: ServerContext, me: Player, opts: { quiet?: boolean } = {}): Promise<SquadResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (!opts.quiet && (await rosterLocked(ctx, squad.id))) throw new ApiError(409, 'conflict', 'Your Gang is in a war: you can leave when it ends.');
  await ctx.repo.removeSquadMember(me.id);
  await ctx.repo.closeRequestsOf(me.id);
  await ctx.repo.updatePlayer(me.id, { squadLeftAt: ctx.now() });
  const rest = await ctx.repo.squadMembers(squad.id);
  if (!rest.length) {
    await ctx.repo.deleteSquad(squad.id);
  } else {
    await system(ctx, squad.id, opts.quiet ? 'A member left the Gang.' : `${isolateName(me.name)} left the Gang.`);
    if (member.role === 'leader') {
      const next = rest.sort((a, b) => a.joinedAt - b.joinedAt)[0];
      await ctx.repo.setSquadRole(next.playerId, 'leader');
      const p = await ctx.repo.getPlayer(next.playerId);
      if (p) await system(ctx, squad.id, `${isolateName(p.name)} leads the Gang now.`);
    }
  }
  return mySquad(ctx, { ...me, squadLeftAt: ctx.now() });
}

/** POST /v1/squad/leader { playerId }: the leader hands over. */
export async function handOver(ctx: ServerContext, me: Player, playerId: unknown): Promise<SquadResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (member.role !== 'leader') throw new ApiError(403, 'unauthorized', 'Only the leader can hand over.');
  const to = (await ctx.repo.squadMembers(squad.id)).find((m) => m.playerId === String(playerId ?? '') && m.playerId !== me.id);
  if (!to) throw new ApiError(404, 'not_found', 'That player is not in your Gang.');
  await ctx.repo.transaction(async (tx) => {
    await tx.setSquadRole(to.playerId, 'leader');
    await tx.setSquadRole(me.id, 'member');
  });
  const p = await ctx.repo.getPlayer(to.playerId);
  if (p) await system(ctx, squad.id, `${isolateName(p.name)} leads the Gang now.`);
  return mySquad(ctx, me);
}

export async function chat(ctx: ServerContext, me: Player, after: string | undefined): Promise<ChatResponse> {
  return chatIn(ctx, me, (await requireSquad(ctx, me)).squad.id, after);
}
export async function postChat(ctx: ServerContext, me: Player, text: unknown): Promise<ChatView> {
  return postChatIn(ctx, me, (await requireSquad(ctx, me)).squad.id, text);
}
export async function requests(ctx: ServerContext, me: Player): Promise<RequestsResponse> {
  return requestsIn(ctx, me, (await requireSquad(ctx, me)).squad.id);
}
export async function requestTroops(ctx: ServerContext, me: Player, capacity: unknown): Promise<RequestView> {
  return requestTroopsIn(ctx, me, (await requireSquad(ctx, me)).squad.id, capacity);
}
export async function donate(ctx: ServerContext, me: Player, requestId: string, req: DonateRequest): Promise<DonateResponse> {
  return donateIn(ctx, me, (await requireSquad(ctx, me)).squad.id, requestId, req, false);
}
