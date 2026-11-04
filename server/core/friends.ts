/**
 * One unique name per player, and friends (roadmap steps 59–61).
 *
 * Names follow `src/gameplay/sim/social/names.ts` (shared with the game):
 * unique by `nameKey`, refused with a reason and suggestions instead of being
 * silently changed, one change every 28 days (a free one after the step 59
 * migration), and a changed-away name held 35 days for its previous owner.
 * Lookup is an exact match on the key, rate-limited, and honours "who can
 * find me"; a miss says only "No player with that name".
 *
 * Friends: by friend code (KAGE-XXXXXX, also in share links and QR codes) or
 * by name; a request is accepted, declined or withdrawn, and expires after 14
 * days; at most 100 friends; blocking ends a friendship and hides each from
 * the other.
 */
import type {
  FriendImportRequest,
  FriendRequestResult,
  FriendRequestView,
  FriendsResponse,
  FriendView,
  PrivacyRequest,
  ProfileCard,
  SuggestionReason,
  SuggestionsResponse,
} from '../../src/backend/net/protocol';
import { leagueFor } from '../../src/gameplay/sim/ranks';
import { fitName, NAME_PROBLEM_TEXT, nameKey, nameProblem, suggestNames } from '../../src/gameplay/sim/social/names';
import { NameClashError, type Findable, type Player, type Repo } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';

export const MAX_FRIENDS = 100;
export const FRIEND_REQUEST_DAYS = 14;
const DAY = 24 * HOUR;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const NOT_FOUND = 'No player with that name.';

/** A new friend code: KAGE- and 6 characters without look-alikes (0/O, 1/I/L). */
export function newFriendCode(ctx: ServerContext): string {
  let n = ctx.newSeed() * 2 ** 21 + (ctx.newSeed() >>> 11);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
    n = Math.floor(n / CODE_ALPHABET.length);
  }
  return `KAGE-${out}`;
}

/** A code as typed: case, spaces and a missing prefix forgiven. */
export function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `KAGE-${s.startsWith('KAGE') ? s.slice(4) : s}`;
}

async function keyTaken(repo: Repo, key: string, me: string | null, now: number): Promise<boolean> {
  const owner = await repo.playerByNameKey(key);
  if (owner && owner.id !== me) return true;
  const hold = await repo.nameHold(key, now);
  return Boolean(hold && hold.playerId !== me);
}

async function suggestionsFor(ctx: ServerContext, base: string | null, me: string | null): Promise<string[]> {
  const now = ctx.now();
  // Check candidates against the database one by one (suggestNames asks synchronously, so collect first).
  const out: string[] = [];
  for (let round = 0; round < 4 && out.length < 3; round++) {
    const candidates = suggestNames(ctx.newSeed(), ctx.data, () => false, 6, base ?? undefined);
    for (const c of candidates) if (out.length < 3 && !out.includes(c) && !(await keyTaken(ctx.repo, nameKey(c), me, now))) out.push(c);
  }
  return out;
}

/** Check a name for a player (null: a new player); throws `bad_name` / `name_taken` with suggestions. */
export async function claimableName(ctx: ServerContext, raw: unknown, me: string | null): Promise<{ name: string; key: string }> {
  const name = String(raw ?? '').trim();
  const problem = nameProblem(name, ctx.data);
  if (problem) throw new ApiError(400, 'bad_name', NAME_PROBLEM_TEXT[problem], { suggestions: await suggestionsFor(ctx, fitName(name, ctx.data), me) });
  const key = nameKey(name);
  if (await keyTaken(ctx.repo, key, me, ctx.now())) throw new ApiError(409, 'name_taken', `Someone already has the name ${name}.`, { suggestions: await suggestionsFor(ctx, name, me) });
  return { name, key };
}

/** Turn a unique-index clash (two players claiming one name at once) into `name_taken`. */
export async function withNameClash<T>(ctx: ServerContext, name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NameClashError) throw new ApiError(409, 'name_taken', `Someone already has the name ${name}.`, { suggestions: await suggestionsFor(ctx, name, null) });
    throw e;
  }
}

/** Change a player's name: one change every 28 days (or the free one), the old name held 35 days for them. */
export async function changeName(ctx: ServerContext, me: Player, raw: unknown): Promise<Player> {
  const r = ctx.data.names.playerNameRules;
  const now = ctx.now();
  const { name, key } = await claimableName(ctx, raw, me.id);
  if (name === me.name) return me;
  const sameKey = key === me.nameKey;
  const next = (me.nameChangedAt ?? 0) + r.changeEveryDays * DAY;
  if (!sameKey && !me.nameChangeFree && next > now) throw new ApiError(409, 'cooldown', `You can change your name again on ${new Date(next).toUTCString().slice(0, 16)}.`);
  const patch = sameKey
    ? { name, updatedAt: now } // only case or separators changed: the same name, no cooldown
    : { name, nameKey: key, nameChangedAt: now, nameChangeFree: false, previousName: me.name, previousNameUntil: now + r.formerlyShownDays * DAY, updatedAt: now };
  await withNameClash(ctx, name, async () => {
    await ctx.repo.updatePlayer(me.id, patch);
    if (!sameKey && me.nameKey) await ctx.repo.holdName(me.nameKey, me.id, now + r.holdReleasedDays * DAY);
    await ctx.repo.releaseNameHold(key);
  });
  return { ...me, ...patch };
}

/**
 * Give every player a name key and a friend code (the step 59 migration; runs
 * at start-up, idempotent). Oldest accounts first, so the oldest keeps a name
 * that collides; names that break the rules are shortened or replaced; every
 * migrated player whose name changed gets one free change.
 */
export async function migrateNames(ctx: ServerContext): Promise<number> {
  let done = 0;
  for (;;) {
    const batch = await ctx.repo.playersNeedingNames(200);
    if (!batch.length) return done;
    for (const p of batch) {
      const patch: Partial<Player> = {};
      if (!p.nameKey) {
        const fit = fitName(p.name, ctx.data);
        let name = fit && !(await keyTaken(ctx.repo, nameKey(fit), p.id, ctx.now())) ? fit : null;
        if (!name) name = (await suggestionsFor(ctx, fit, p.id))[0] ?? `Ninja ${p.id.replace(/[^0-9]/g, '').slice(0, 8) || '1'}`;
        Object.assign(patch, { name, nameKey: nameKey(name), nameChangeFree: true });
      }
      if (!p.friendCode) patch.friendCode = newFriendCode(ctx);
      for (let attempt = 0; ; attempt++) {
        try {
          await ctx.repo.updatePlayer(p.id, patch);
          break;
        } catch (e) {
          if (!(e instanceof NameClashError) || attempt > 5) throw e;
          if (patch.friendCode) patch.friendCode = newFriendCode(ctx);
          if (patch.nameKey) {
            const name = (await suggestionsFor(ctx, patch.name ?? null, p.id))[0];
            Object.assign(patch, { name, nameKey: nameKey(name) });
          }
        }
      }
      done++;
    }
  }
}

async function blockedEitherWay(repo: Repo, a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([repo.blocksOf(a), repo.blocksOf(b)]);
  return x.some((k) => k.blockedId === b) || y.some((k) => k.blockedId === a);
}

export function card(ctx: ServerContext, p: Player, gang: string | null = null): ProfileCard {
  return { id: p.id, name: p.name, hallLevel: p.hallLevel, honor: p.trophies, league: leagueFor(p.trophies, ctx.data).name, gang, staff: Boolean(p.staff) };
}

/** The name of the player's Gang (step 63), or null. */
async function gangName(ctx: ServerContext, playerId: string): Promise<string | null> {
  return (await ctx.repo.squadOf(playerId))?.name ?? null;
}

/** May `me` find `p` by name? */
async function findable(ctx: ServerContext, me: Player, p: Player): Promise<boolean> {
  if (p.id === me.id) return true;
  if ((p.bannedUntil ?? 0) > ctx.now() || (await blockedEitherWay(ctx.repo, me.id, p.id))) return false;
  const setting: Findable = p.findable ?? 'everyone';
  if (setting === 'everyone') return true;
  const theirs = new Set((await ctx.repo.friendsOf(p.id)).map((f) => f.id));
  if (theirs.has(me.id)) return true;
  if (setting === 'nobody') return false;
  return (await ctx.repo.friendsOf(me.id)).some((f) => theirs.has(f.id));
}

export async function lookup(ctx: ServerContext, me: Player, rawName: unknown): Promise<ProfileCard> {
  const key = nameKey(String(rawName ?? ''));
  const p = key.length >= 3 ? await ctx.repo.playerByNameKey(key) : null;
  if (!p || !(await findable(ctx, me, p))) throw new ApiError(404, 'not_found', NOT_FOUND);
  return card(ctx, p, await gangName(ctx, p.id));
}

async function addFriends(ctx: ServerContext, a: Player, b: Player): Promise<void> {
  const [fa, fb] = await Promise.all([ctx.repo.friendsOf(a.id), ctx.repo.friendsOf(b.id)]);
  if (fa.length >= MAX_FRIENDS) throw new ApiError(409, 'full', `You already have ${MAX_FRIENDS} friends.`);
  if (fb.length >= MAX_FRIENDS) throw new ApiError(409, 'full', `${b.name} already has ${MAX_FRIENDS} friends.`);
  await ctx.repo.addFriendship(a.id, b.id, ctx.now());
}

export async function requestFriend(ctx: ServerContext, me: Player, body: { code?: unknown; name?: unknown } | undefined): Promise<FriendRequestResult> {
  let target: Player | null = null;
  if (body?.code !== undefined) target = await ctx.repo.playerByFriendCode(normalizeCode(body.code));
  else if (body?.name !== undefined) {
    const p = await ctx.repo.playerByNameKey(nameKey(String(body.name)));
    target = p && (await findable(ctx, me, p)) ? p : null;
  }
  if (!target || (target.bannedUntil ?? 0) > ctx.now()) throw new ApiError(404, 'not_found', body?.code !== undefined ? 'No player has that friend code.' : NOT_FOUND);
  if (target.id === me.id) throw new ApiError(400, 'bad_request', 'That is your own code.');
  // A block either way: answer as if sent, so a blocked player learns nothing; nothing is stored.
  if (await blockedEitherWay(ctx.repo, me.id, target.id)) return { status: 'sent' };
  if ((await ctx.repo.friendsOf(me.id)).some((f) => f.id === target!.id)) throw new ApiError(409, 'conflict', `You and ${target.name} are already friends.`);
  const theirs = await ctx.repo.openFriendRequest(target.id, me.id);
  if (theirs) {
    await addFriends(ctx, me, target);
    await ctx.repo.closeFriendRequest(theirs.id, 'accepted');
    return { status: 'friends' };
  }
  await ctx.repo.addFriendRequest({ id: ctx.uuid(), fromId: me.id, toId: target.id, at: ctx.now(), status: 'open' });
  ctx.push.notify(target.id, { type: 'friends', title: 'Friend request', body: `${me.name} wants to be friends.` });
  return { status: 'sent' };
}

/** Answer a request sent to you (accept or decline), or withdraw one you sent. */
export async function answerRequest(ctx: ServerContext, me: Player, id: string, body: { accept?: unknown } | undefined): Promise<FriendsResponse> {
  const r = await ctx.repo.getFriendRequest(String(id));
  if (!r || r.status !== 'open' || (r.toId !== me.id && r.fromId !== me.id)) throw new ApiError(404, 'not_found', 'That request is no longer open.');
  if (r.fromId === me.id) {
    await ctx.repo.closeFriendRequest(r.id, 'cancelled');
  } else if (body?.accept === true) {
    const from = await ctx.repo.getPlayer(r.fromId);
    if (!from) throw new ApiError(404, 'not_found', 'That player is gone.');
    await addFriends(ctx, me, from);
    await ctx.repo.closeFriendRequest(r.id, 'accepted');
  } else {
    await ctx.repo.closeFriendRequest(r.id, 'declined');
  }
  return friends(ctx, me);
}

export async function removeFriend(ctx: ServerContext, me: Player, id: string): Promise<FriendsResponse> {
  await ctx.repo.removeFriendship(me.id, String(id));
  return friends(ctx, me);
}

/** End a friendship and any open requests both ways (blocking, step 15's block system). */
export async function cutTies(ctx: ServerContext, a: string, b: string): Promise<void> {
  await ctx.repo.removeFriendship(a, b);
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    const r = await ctx.repo.openFriendRequest(from, to);
    if (r) await ctx.repo.closeFriendRequest(r.id, 'cancelled');
  }
}

export async function friends(ctx: ServerContext, me: Player): Promise<FriendsResponse> {
  const now = ctx.now();
  const list = await ctx.repo.friendsOf(me.id);
  const players = new Map((await ctx.repo.playersByIds(list.map((f) => f.id))).map((p) => [p.id, p]));
  const out: FriendView[] = [];
  for (const f of list) {
    const p = players.get(f.id);
    if (!p) continue;
    out.push({ ...card(ctx, p, await gangName(ctx, p.id)), since: f.since, lastSeen: p.hideOnline ? null : p.lastSeenAt, formerly: p.previousName && (p.previousNameUntil ?? 0) > now ? p.previousName : null });
  }
  out.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.name.localeCompare(b.name));
  const requests = (await ctx.repo.friendRequestsOf(me.id)).filter((r) => now - r.at < FRIEND_REQUEST_DAYS * DAY);
  const others = new Map((await ctx.repo.playersByIds(requests.map((r) => (r.fromId === me.id ? r.toId : r.fromId)))).map((p) => [p.id, p]));
  const view = (r: (typeof requests)[number]): FriendRequestView | null => {
    const p = others.get(r.fromId === me.id ? r.toId : r.fromId);
    return p ? { id: r.id, at: r.at, player: card(ctx, p) } : null;
  };
  return {
    friends: out,
    incoming: requests.filter((r) => r.toId === me.id).map(view).filter((v): v is FriendRequestView => Boolean(v)),
    outgoing: requests.filter((r) => r.fromId === me.id).map(view).filter((v): v is FriendRequestView => Boolean(v)),
    code: me.friendCode ?? '',
    findable: me.findable ?? 'everyone',
    hideOnline: Boolean(me.hideOnline),
    max: MAX_FRIENDS,
  };
}

export async function setPrivacy(ctx: ServerContext, me: Player, body: PrivacyRequest | undefined): Promise<FriendsResponse> {
  const patch: Partial<Player> = {};
  if (body?.findable !== undefined) {
    if (!['everyone', 'friends_of_friends', 'nobody'].includes(body.findable)) throw new ApiError(400, 'bad_request', 'Unknown setting.');
    patch.findable = body.findable;
  }
  if (body?.hideOnline !== undefined) patch.hideOnline = Boolean(body.hideOnline);
  await ctx.repo.updatePlayer(me.id, patch);
  return friends(ctx, { ...me, ...patch });
}

/** Recent opponents (both ways, two weeks) and Alliance mates who aren't friends yet (step 60). */
export async function suggestions(ctx: ServerContext, me: Player): Promise<SuggestionsResponse> {
  const since = ctx.now() - 14 * DAY;
  const reasons = new Map<string, SuggestionReason>();
  for (const id of await ctx.repo.recentTargets(me.id, since)) reasons.set(id, 'opponent');
  for (const d of await ctx.repo.defensesFor(me.id, since, 50)) if (!reasons.has(d.attackerId)) reasons.set(d.attackerId, 'opponent');
  if (me.groveId) for (const m of await ctx.repo.members(me.groveId)) if (!reasons.has(m.playerId)) reasons.set(m.playerId, 'alliance');
  return { players: await suggestionCards(ctx, me, reasons) };
}

async function suggestionCards(ctx: ServerContext, me: Player, reasons: Map<string, SuggestionReason>): Promise<SuggestionsResponse['players']> {
  const friendIds = new Set((await ctx.repo.friendsOf(me.id)).map((f) => f.id));
  const blocked = new Set((await ctx.repo.blocksOf(me.id)).map((b) => b.blockedId));
  const ids = [...reasons.keys()].filter((id) => id !== me.id && !friendIds.has(id) && !blocked.has(id));
  const out: SuggestionsResponse['players'] = [];
  for (const p of await ctx.repo.playersByIds(ids.slice(0, 60))) {
    if ((p.bannedUntil ?? 0) > ctx.now() || (await blockedEitherWay(ctx.repo, me.id, p.id))) continue;
    out.push({ ...card(ctx, p, await gangName(ctx, p.id)), reason: reasons.get(p.id)! });
    if (out.length >= 20) break;
  }
  return out;
}

/** Game Center / Play Games friends who play and can be found (step 61; the player chose to import). */
export async function importFriends(ctx: ServerContext, me: Player, body: Partial<FriendImportRequest> | undefined): Promise<SuggestionsResponse> {
  const provider = body?.provider;
  if (provider !== 'gamecenter' && provider !== 'playgames') throw new ApiError(400, 'bad_request', 'Unknown provider.');
  const ids = Array.isArray(body?.ids) ? body!.ids.map(String).filter((s) => s.length > 0 && s.length < 200).slice(0, 500) : [];
  const reasons = new Map<string, SuggestionReason>();
  for (const id of await ctx.repo.playersByIdentities(provider, ids)) reasons.set(id, provider);
  // Imported friends who chose "Nobody" stay hidden; the rest follow their setting as for a name search.
  const cards = await suggestionCards(ctx, me, reasons);
  const visible: SuggestionsResponse['players'] = [];
  for (const c of cards) {
    const p = await ctx.repo.getPlayer(c.id);
    if (p && (p.findable ?? 'everyone') !== 'nobody') visible.push(c);
  }
  return { players: visible };
}

/** The share link's page (/f/<code>): open the game with the code ready to add. */
export function shareTarget(gameUrl: string | undefined, code: string): string | null {
  if (!gameUrl) return null;
  const u = new URL(gameUrl);
  u.searchParams.set('friend', normalizeCode(code));
  return u.toString();
}
