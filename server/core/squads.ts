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
import { serverHasContact } from './contactFilter';
import type { ChatResponse, ChatView, DonateRequest, DonateResponse, RequestsResponse, RequestView, SquadInviteView, SquadMemberView, SquadResponse, SquadView } from '../../src/backend/net/protocol';
import type { Player, Squad, SquadMember } from '../repo';
import { requireRules } from './rules';
import { HOUR, type ServerContext } from './context';
import { chatIn, donateIn, postChatIn, requestsIn, requestTroopsIn } from './groves';
import { isReservedName } from '../../src/backend/net/names';
import { fail, utcDate } from './errors';

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
  if (!member || !squad) throw fail(404, 'not_found', 'gang.not_member');
  return { squad, member };
}

function cleanSquadName(raw: unknown, ctx: ServerContext): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 24) throw fail(400, 'bad_request', 'gang.name_length');
  if (filterText(name, ctx.data) !== name || serverHasContact(name) || isReservedName(name)) throw fail(400, 'bad_request', 'gang.name_refused');
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
  requireRules(ctx, me);
  const clean = cleanSquadName(name, ctx);
  if (await ctx.repo.squadOf(me.id)) throw fail(409, 'conflict', 'gang.leave_first');
  const wait = canJoinAt(ctx, me);
  if (wait) throw fail(429, 'cooldown', 'gang.found_cooldown', { date: utcDate(wait, 22) });
  const squad: Squad = { id: ctx.uuid(), name: clean, createdAt: ctx.now() };
  await ctx.repo.transaction(async (tx) => {
    await tx.createSquad(squad);
    if (!(await tx.addSquadMember({ playerId: me.id, squadId: squad.id, role: 'leader', joinedAt: ctx.now() }))) throw fail(409, 'conflict', 'gang.already_member');
    await tx.deleteSquadInvitesTo(me.id);
  });
  await system(ctx, squad.id, `${isolateName(me.name)} founded ${isolateName(clean)}. Invite up to ${SQUAD_MAX - 1} friends.`);
  return mySquad(ctx, me);
}

/** POST /v1/squad/invites { friendId } (leader only). */
export async function invite(ctx: ServerContext, me: Player, friendId: unknown): Promise<SquadResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (member.role !== 'leader') throw fail(403, 'unauthorized', 'gang.leader_invites');
  if (await rosterLocked(ctx, squad.id)) throw fail(409, 'conflict', 'gang.roster_locked');
  const id = String(friendId ?? '');
  const p = id ? await ctx.repo.getPlayer(id) : null;
  if (!p || !(await areFriends(ctx, me.id, p.id))) throw fail(404, 'not_found', 'gang.friends_only');
  if (await ctx.repo.squadOf(p.id)) throw fail(409, 'conflict', 'gang.player_in_gang', { name: isolateName(p.name) });
  if ((await ctx.repo.squadMembers(squad.id)).length >= SQUAD_MAX) throw fail(409, 'full', 'gang.max_members', { max: SQUAD_MAX });
  const open = await ctx.repo.squadInvitesFrom(squad.id, ctx.now() - SQUAD_INVITE_DAYS * DAY);
  if (!open.some((i) => i.toId === p.id)) await ctx.repo.addSquadInvite({ id: ctx.uuid(), squadId: squad.id, fromId: me.id, toId: p.id, at: ctx.now() });
  ctx.push.notify(p.id, { type: 'gang', title: `${isolateName(me.name)} invited you to ${isolateName(squad.name)}`, body: 'Open Friends → Gang to answer.' });
  return mySquad(ctx, me);
}

/** POST /v1/squad/invites/:id { accept } */
export async function answerInvite(ctx: ServerContext, me: Player, id: unknown, accept: unknown): Promise<SquadResponse> {
  const inv = await ctx.repo.getSquadInvite(String(id ?? ''));
  if (!inv || inv.toId !== me.id || inv.at <= ctx.now() - SQUAD_INVITE_DAYS * DAY) throw fail(404, 'not_found', 'gang.invite_gone');
  if (accept !== true) {
    await ctx.repo.deleteSquadInvite(inv.id);
    return mySquad(ctx, me);
  }
  const squad = await ctx.repo.getSquad(inv.squadId);
  if (!squad) {
    await ctx.repo.deleteSquadInvite(inv.id);
    throw fail(404, 'not_found', 'gang.closed');
  }
  if (await ctx.repo.squadOf(me.id)) throw fail(409, 'conflict', 'gang.leave_first');
  const wait = canJoinAt(ctx, me);
  if (wait) throw fail(429, 'cooldown', 'gang.join_cooldown', { date: utcDate(wait, 22) });
  if (await rosterLocked(ctx, squad.id)) throw fail(409, 'conflict', 'gang.at_war_join');
  const members = await ctx.repo.squadMembers(squad.id);
  if (members.length >= SQUAD_MAX) throw fail(409, 'full', 'gang.full');
  const leader = members.find((m) => m.role === 'leader');
  if (!leader || !(await areFriends(ctx, me.id, leader.playerId))) throw fail(409, 'conflict', 'gang.not_friends');
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.addSquadMember({ playerId: me.id, squadId: squad.id, role: 'member', joinedAt: ctx.now() }))) throw fail(409, 'conflict', 'gang.already_member');
    await tx.deleteSquadInvitesTo(me.id);
  });
  await system(ctx, squad.id, `${isolateName(me.name)} joined the Gang.`);
  return mySquad(ctx, me);
}

/** POST /v1/squad/leave. `quiet`: the player is deleting their account (no name in the notice, no war lock). */
export async function leave(ctx: ServerContext, me: Player, opts: { quiet?: boolean } = {}): Promise<SquadResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (!opts.quiet && (await rosterLocked(ctx, squad.id))) throw fail(409, 'conflict', 'gang.at_war_leave');
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
  if (member.role !== 'leader') throw fail(403, 'unauthorized', 'gang.leader_hands_over');
  const to = (await ctx.repo.squadMembers(squad.id)).find((m) => m.playerId === String(playerId ?? '') && m.playerId !== me.id);
  if (!to) throw fail(404, 'not_found', 'gang.not_in_your_gang');
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
