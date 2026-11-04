/**
 * Friends (roadmap step 59; design in docs/backend/PVP_ROADMAP.md 5.2).
 *
 * - Find a player by typing their exact name (case and space/_/- don't
 *   matter; no partial matches, no browsing, rate limited), by friend code,
 *   or from a share link / QR code that carries the code.
 * - "Who can find me by name": everyone, friends of friends, or nobody (friend
 *   code only). Friends can always find each other. A miss and a hidden
 *   player look the same: "No player with that name".
 * - Requests: one per pair, lapse after 14 days; asking someone who already
 *   asked you makes you friends. At most 100 friends.
 * - Blocking (moderation.ts) ends a friendship and its requests, and hides
 *   each player from the other's lookups and requests.
 */
import { FINDABLE, FRIEND_CODE_ALPHABET, NAME_CHANGE_DAYS, nameKey, nameShapeProblem, normalizeFriendCode, tidyName } from '../../src/backend/net/names';
import { leagueFor } from '../../src/gameplay/sim/ranks';
import type { FriendRequestBody, FriendRequestResult, FriendRequestView, FriendsResponse, FriendView, PlayerCard, PrivacyRequest } from '../../src/backend/net/protocol';
import { NameTakenError, type FriendRequest, type Player } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';

const DAY = 24 * HOUR;
/** Most friends a player can have. */
export const MAX_FRIENDS = 100;
/** Requests lapse after this many days. */
export const FRIEND_REQUEST_DAYS = 14;
/** Most open requests a player can have sent at once. */
export const MAX_OUTGOING = 50;
const NOT_FOUND = 'No player with that name.';

type Relation = PlayerCard['relation'];

interface Social {
  friends: Map<string, number>;
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: Set<string>;
}

async function socialOf(ctx: ServerContext, me: Player): Promise<Social> {
  const since = ctx.now() - FRIEND_REQUEST_DAYS * DAY;
  const [friends, requests, blocks] = await Promise.all([ctx.repo.friendsOf(me.id), ctx.repo.friendRequestsOf(me.id, since), ctx.repo.blocksOf(me.id)]);
  return {
    friends: new Map(friends.map((f) => [f.id, f.since])),
    incoming: requests.filter((r) => r.toId === me.id),
    outgoing: requests.filter((r) => r.fromId === me.id),
    blocked: new Set(blocks.map((b) => b.blockedId)),
  };
}

/** Did either player block the other? */
async function blockedEitherWay(ctx: ServerContext, a: Player, b: Player, mine?: Social): Promise<boolean> {
  const myBlocks = mine?.blocked ?? new Set((await ctx.repo.blocksOf(a.id)).map((x) => x.blockedId));
  if (myBlocks.has(b.id)) return true;
  return (await ctx.repo.blocksOf(b.id)).some((x) => x.blockedId === a.id);
}

function relationTo(me: Player, s: Social, otherId: string): Relation {
  if (otherId === me.id) return 'self';
  if (s.friends.has(otherId)) return 'friend';
  if (s.outgoing.some((r) => r.toId === otherId)) return 'requested';
  if (s.incoming.some((r) => r.fromId === otherId)) return 'incoming';
  return 'none';
}

async function allianceName(ctx: ServerContext, p: Player): Promise<string | null> {
  return p.groveId ? ((await ctx.repo.getGrove(p.groveId))?.name ?? null) : null;
}

async function card(ctx: ServerContext, p: Player, relation: Relation): Promise<PlayerCard> {
  const t = ctx.now();
  const formerly = p.previousName && p.nameChangedAt && t - p.nameChangedAt < NAME_CHANGE_DAYS * DAY ? p.previousName : undefined;
  return {
    id: p.id,
    name: p.name,
    keep: p.hallLevel,
    honor: p.trophies,
    league: leagueFor(p.trophies, ctx.data).id,
    alliance: await allianceName(ctx, p),
    ...(p.staff ? { staff: true } : {}),
    ...(formerly ? { formerly } : {}),
    relation,
  };
}

async function friendView(ctx: ServerContext, p: Player, since: number): Promise<FriendView> {
  return { ...(await card(ctx, p, 'friend')), since, ...(p.showOnline !== false ? { lastSeen: p.lastSeenAt } : {}) };
}

async function requestView(ctx: ServerContext, r: FriendRequest, other: Player, relation: Relation): Promise<FriendRequestView> {
  return { id: r.id, at: r.at, expiresAt: r.at + FRIEND_REQUEST_DAYS * DAY, player: await card(ctx, other, relation) };
}

function newCode(ctx: ServerContext): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += FRIEND_CODE_ALPHABET[Math.floor(ctx.random() * FRIEND_CODE_ALPHABET.length)];
  return `KAGE-${s}`;
}

/** This player's friend code, made the first time it is needed. */
export async function friendCodeOf(ctx: ServerContext, me: Player): Promise<string> {
  if (me.friendCode) return me.friendCode;
  for (let i = 0; i < 20; i++) {
    const code = newCode(ctx);
    if (await ctx.repo.playerByFriendCode(code)) continue;
    try {
      await ctx.repo.updatePlayer(me.id, { friendCode: code });
      me.friendCode = code;
      return code;
    } catch (e) {
      if (!(e instanceof NameTakenError)) throw e;
    }
  }
  throw new ApiError(503, 'conflict', 'Could not make a friend code. Try again.');
}

/** GET /v1/friends */
export async function friends(ctx: ServerContext, me: Player): Promise<FriendsResponse> {
  const s = await socialOf(ctx, me);
  const code = await friendCodeOf(ctx, me);
  const views: FriendView[] = [];
  for (const [id, since] of s.friends) {
    const p = await ctx.repo.getPlayer(id);
    if (p) views.push(await friendView(ctx, p, since));
  }
  views.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.name.localeCompare(b.name));
  const reqs = async (list: FriendRequest[], other: (r: FriendRequest) => string, relation: Relation) => {
    const out: FriendRequestView[] = [];
    for (const r of list) {
      const p = await ctx.repo.getPlayer(other(r));
      if (p && !s.blocked.has(p.id)) out.push(await requestView(ctx, r, p, relation));
    }
    return out.sort((a, b) => b.at - a.at);
  };
  return {
    code,
    findable: me.findable ?? 'everyone',
    showOnline: me.showOnline !== false,
    friends: views,
    incoming: await reqs(s.incoming, (r) => r.fromId, 'incoming'),
    outgoing: await reqs(s.outgoing, (r) => r.toId, 'requested'),
    max: MAX_FRIENDS,
  };
}

/** May `me` find `p` by typing their name? */
async function findableBy(ctx: ServerContext, me: Player, p: Player, s: Social): Promise<boolean> {
  if (p.id === me.id || s.friends.has(p.id)) return true;
  if (p.bannedUntil && p.bannedUntil > ctx.now()) return false;
  if (await blockedEitherWay(ctx, me, p, s)) return false;
  const who = p.findable ?? 'everyone';
  if (who === 'everyone') return true;
  if (who === 'nobody') return false;
  // Friends of friends: someone is friends with both.
  const theirs = await ctx.repo.friendsOf(p.id);
  return theirs.some((f) => s.friends.has(f.id));
}

/** GET /v1/players/lookup?name= : exactly one player, or "No player with that name" (also when they hide). */
export async function lookup(ctx: ServerContext, me: Player, rawName: unknown): Promise<PlayerCard> {
  const name = tidyName(rawName);
  if (nameShapeProblem(name)) throw new ApiError(404, 'not_found', NOT_FOUND);
  const p = await ctx.repo.playerByNameKey(nameKey(name));
  const s = await socialOf(ctx, me);
  if (!p || !(await findableBy(ctx, me, p, s))) {
    ctx.metrics.count('tk_friend_lookups_total', { found: 'no' });
    throw new ApiError(404, 'not_found', NOT_FOUND);
  }
  ctx.metrics.count('tk_friend_lookups_total', { found: 'yes' });
  return card(ctx, p, relationTo(me, s, p.id));
}

/** GET /v1/players/code/:code : a friend code was shared on purpose, so privacy does not hide it (blocks do). */
export async function byCode(ctx: ServerContext, me: Player, rawCode: unknown): Promise<PlayerCard> {
  const code = normalizeFriendCode(rawCode);
  const p = code ? await ctx.repo.playerByFriendCode(code) : null;
  const s = await socialOf(ctx, me);
  if (!p || (p.id !== me.id && (await blockedEitherWay(ctx, me, p, s)))) throw new ApiError(404, 'not_found', 'No player with that friend code.');
  return card(ctx, p, relationTo(me, s, p.id));
}

async function becomeFriends(ctx: ServerContext, a: Player, b: Player): Promise<number> {
  const t = ctx.now();
  const [fa, fb] = await Promise.all([ctx.repo.friendsOf(a.id), ctx.repo.friendsOf(b.id)]);
  if (fa.length >= MAX_FRIENDS) throw new ApiError(409, 'full', `You have ${MAX_FRIENDS} friends, the most you can have. Remove someone first.`);
  if (fb.length >= MAX_FRIENDS) throw new ApiError(409, 'full', `${b.name} has as many friends as they can have.`);
  await ctx.repo.transaction(async (tx) => {
    await tx.addFriendship(a.id, b.id, t);
    await tx.deleteFriendRequestsBetween(a.id, b.id);
  });
  return t;
}

/** POST /v1/friends/requests */
export async function request(ctx: ServerContext, me: Player, body: FriendRequestBody | undefined): Promise<FriendRequestResult> {
  const s = await socialOf(ctx, me);
  let p: Player | null = null;
  if (body?.code) {
    const code = normalizeFriendCode(body.code);
    p = code ? await ctx.repo.playerByFriendCode(code) : null;
  } else if (body?.name) {
    const name = tidyName(body.name);
    const found = nameShapeProblem(name) ? null : await ctx.repo.playerByNameKey(nameKey(name));
    p = found && (await findableBy(ctx, me, found, s)) ? found : null;
  } else if (body?.playerId) {
    // From a card the player already saw (a lookup, an Alliance list, a replay).
    p = await ctx.repo.getPlayer(String(body.playerId));
  }
  if (!p) throw new ApiError(404, 'not_found', body?.code ? 'No player with that friend code.' : NOT_FOUND);
  if (p.id === me.id) throw new ApiError(400, 'bad_request', 'That is you.');
  if (await blockedEitherWay(ctx, me, p, s)) throw new ApiError(404, 'not_found', NOT_FOUND);
  if (s.friends.has(p.id)) return { status: 'friends', friend: await friendView(ctx, p, s.friends.get(p.id)!) };
  // They asked first: asking back makes you friends.
  if (s.incoming.some((r) => r.fromId === p!.id)) {
    const since = await becomeFriends(ctx, me, p);
    return { status: 'friends', friend: await friendView(ctx, p, since) };
  }
  const open = s.outgoing.find((r) => r.toId === p!.id);
  if (open) return { status: 'sent', request: await requestView(ctx, open, p, 'requested') };
  if (s.outgoing.length >= MAX_OUTGOING) throw new ApiError(409, 'full', 'You have many requests waiting. Wait for answers, or take some back.');
  if (s.friends.size >= MAX_FRIENDS) throw new ApiError(409, 'full', `You have ${MAX_FRIENDS} friends, the most you can have. Remove someone first.`);
  const r: FriendRequest = { id: ctx.uuid(), fromId: me.id, toId: p.id, at: ctx.now() };
  await ctx.repo.addFriendRequest(r);
  ctx.metrics.count('tk_friend_requests_total', { via: body?.code ? 'code' : body?.name ? 'name' : 'card' });
  return { status: 'sent', request: await requestView(ctx, r, p, 'requested') };
}

/** POST /v1/friends/requests/:id { accept } : answer a request to me. */
export async function answer(ctx: ServerContext, me: Player, id: unknown, accept: unknown): Promise<FriendRequestResult | undefined> {
  const r = await ctx.repo.getFriendRequest(String(id ?? ''));
  if (!r || r.toId !== me.id || r.at <= ctx.now() - FRIEND_REQUEST_DAYS * DAY) throw new ApiError(404, 'not_found', 'That request is gone.');
  const from = await ctx.repo.getPlayer(r.fromId);
  if (!from) {
    await ctx.repo.deleteFriendRequest(r.id);
    throw new ApiError(404, 'not_found', 'That request is gone.');
  }
  if (accept !== true) {
    await ctx.repo.deleteFriendRequest(r.id);
    return undefined;
  }
  const since = await becomeFriends(ctx, me, from);
  return { status: 'friends', friend: await friendView(ctx, from, since) };
}

/** DELETE /v1/friends/requests/:id : take back my own request. */
export async function cancel(ctx: ServerContext, me: Player, id: unknown): Promise<void> {
  const r = await ctx.repo.getFriendRequest(String(id ?? ''));
  if (r && r.fromId === me.id) await ctx.repo.deleteFriendRequest(r.id);
}

/** DELETE /v1/friends/:id */
export async function unfriend(ctx: ServerContext, me: Player, playerId: unknown): Promise<void> {
  await ctx.repo.removeFriendship(me.id, String(playerId ?? ''));
}

/** PUT /v1/me/privacy */
export async function setPrivacy(ctx: ServerContext, me: Player, req: PrivacyRequest | undefined): Promise<FriendsResponse> {
  const patch: { findable?: Player['findable']; showOnline?: boolean } = {};
  if (req?.findable !== undefined) {
    if (!FINDABLE.includes(req.findable)) throw new ApiError(400, 'bad_request', 'findable must be everyone, friends_of_friends or nobody.');
    patch.findable = req.findable;
  }
  if (req?.showOnline !== undefined) patch.showOnline = req.showOnline === true;
  if (Object.keys(patch).length) await ctx.repo.updatePlayer(me.id, patch);
  return friends(ctx, { ...me, ...patch });
}
