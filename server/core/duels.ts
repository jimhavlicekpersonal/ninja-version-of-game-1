/**
 * Friendly Duels (roadmap step 62): attack a friend's current base (or the
 * separate duel layout they set) at any time. The server re-simulates every
 * duel like PvP, so the tally and replays can be trusted, but a duel never
 * changes Honor, loot, troops, ratings or shields: friends could otherwise
 * trade wins. Both players get the replay; each pair keeps a rivalry tally
 * (wins, best stars). A duel challenge asks both to attack each other's base
 * within 24 hours; more stars, then more destruction, wins (still unranked).
 */
import type { ChallengeView, DuelResponse, DuelsResponse, DuelSubmission, DuelTicketRequest, DuelTicketResponse, RivalryView } from '../../src/backend/net/protocol';
import { SIM_RULES } from '../../src/gameplay/sim/battle/battle';
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import type { DuelChallenge, Player, Repo, Rivalry } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { battleSeed, checkArmy, normalizeBase, resimulate, takeTicket } from './pvp';

const DUEL_TICKET_MS = 15 * MIN;
const CHALLENGE_MS = 24 * HOUR;
const RETENTION_MS = 30 * 24 * HOUR;

async function requireFriend(ctx: ServerContext, me: Player, id: unknown): Promise<Player> {
  const friendId = String(id ?? '');
  if (!(await ctx.repo.friendsOf(me.id)).some((f) => f.id === friendId)) throw new ApiError(404, 'not_found', 'Duels are between friends.');
  const p = await ctx.repo.getPlayer(friendId);
  if (!p || (p.bannedUntil ?? 0) > ctx.now()) throw new ApiError(404, 'not_found', 'That player is not available.');
  const blocks = [...(await ctx.repo.blocksOf(me.id)), ...(await ctx.repo.blocksOf(p.id))];
  if (blocks.some((b) => b.blockedId === p.id || b.blockedId === me.id)) throw new ApiError(404, 'not_found', 'That player is not available.');
  return p;
}

/** The label a duel layout carries (it tells the game, and the record, which base was attacked). */
export const DUEL_LAYOUT_LABEL = 'Duel layout';

/** A base for a duel: no loot (nothing can be won). */
function duelBase(base: BaseLayout, name: string, layout = false): BaseLayout {
  const b = structuredClone(base);
  b.name = name;
  if (layout) b.practice = DUEL_LAYOUT_LABEL;
  else delete b.practice;
  delete b.trophies;
  for (const x of b.buildings) delete x.loot;
  return b;
}

export async function duelTicket(ctx: ServerContext, me: Player, req: Partial<DuelTicketRequest> | undefined): Promise<DuelTicketResponse> {
  const friend = await requireFriend(ctx, me, req?.friendId);
  const wantDuel = req?.layout === 'duel';
  const layout = wantDuel ? await ctx.repo.getDuelLayout(friend.id) : null;
  const source = layout ?? friend.base;
  if (!source) throw new ApiError(409, 'conflict', `${friend.name} has no base to duel yet.`);
  const t = ctx.now();
  const base = duelBase(source, friend.name, Boolean(layout));
  const ticket = { id: ctx.uuid(), kind: 'duel' as const, attackerId: me.id, defenderId: friend.id, defenderName: friend.name, base, defenderTrophies: 0, createdAt: t, expiresAt: t + DUEL_TICKET_MS, used: false, seed: ctx.newSeed() };
  await ctx.repo.createTicket(ticket);
  return { ticket: ticket.id, seed: ticket.seed, base, expiresAt: ticket.expiresAt, opponent: { id: friend.id, name: friend.name }, layout: layout ? 'duel' : 'live' };
}

function rivalryView(r: Rivalry | undefined, me: string, friendId: string, name: string): RivalryView {
  if (!r) return { friendId, name, duels: 0, myWins: 0, theirWins: 0, myBest: 0, theirBest: 0 };
  const a = r.a === me;
  return { friendId, name, duels: r.duels, myWins: a ? r.aWins : r.bWins, theirWins: a ? r.bWins : r.aWins, myBest: a ? r.aBest : r.bBest, theirBest: a ? r.bBest : r.aBest };
}

export async function submitDuel(ctx: ServerContext, me: Player, sub: DuelSubmission): Promise<DuelResponse> {
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'duel');
  if (answered) return answered as DuelResponse;
  const friend = await requireFriend(ctx, me, ticket.defenderId);
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements } = checkArmy(sub, me, ctx.data);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}) };
  const { result } = await resimulate(ctx, 'duel', setup, deployments, sub);
  const t = ctx.now();
  const duelId = ctx.uuid();
  // A challenge this duel answers: open, between these two, and not yet answered by me.
  let challenge = sub.challengeId ? await ctx.repo.getChallenge(String(sub.challengeId)) : null;
  const mineSide = challenge ? (challenge.a === me.id ? 'aDuel' : challenge.b === me.id ? 'bDuel' : null) : null;
  if (challenge && (!mineSide || challenge.status !== 'open' || challenge.endsAt < t || challenge[mineSide] || (challenge.a !== friend.id && challenge.b !== friend.id))) challenge = null;
  const response = await ctx.repo.transaction(async (tx) => {
    await tx.addDuel({
      id: duelId,
      at: t,
      attackerId: me.id,
      defenderId: friend.id,
      challengeId: challenge?.id ?? null,
      record: { attackerName: me.name, defenderName: friend.name, layout: ticket.base.practice === DUEL_LAYOUT_LABEL ? 'duel' : 'live', seed, base: ticket.base, army, levels, ...(setup.reinforcements ? { reinforcements } : {}), deployments, endTick: sub.endTick, result, rules: SIM_RULES },
    });
    await tx.addToRivalry(me.id, friend.id, result.stars, result.stars >= 1, t);
    let view: ChallengeView | null = null;
    if (challenge && mineSide) {
      await tx.updateChallenge(challenge.id, { [mineSide]: duelId });
      await settleChallenge(ctx, tx, { ...challenge, [mineSide]: duelId });
      view = challengeView((await tx.getChallenge(challenge.id))!, me.id, friend.name);
    }
    const rivalry = rivalryView((await tx.rivalriesOf(me.id)).find((r) => r.a === friend.id || r.b === friend.id), me.id, friend.id, friend.name);
    const out: DuelResponse = { duelId, result, rivalry, challenge: view };
    // Last, with the answer: a retried report gets the same answer; a second one at the same moment rolls back.
    if (!(await tx.useTicket(ticket.id, out))) throw new ApiError(409, 'conflict', 'This duel was already reported.');
    return out;
  });
  ctx.push.notify(friend.id, { type: 'friends', title: 'Friendly duel', body: `${me.name} dueled your base: ${result.stars} star${result.stars === 1 ? '' : 's'}. Watch the replay in Friends.` });
  return response;
}

/** Decide a challenge once both have attacked, or when its 24 hours are up. */
async function settleChallenge(ctx: ServerContext, repo: Repo, c: DuelChallenge): Promise<void> {
  if (c.status !== 'open') return;
  const done = Boolean(c.aDuel && c.bDuel);
  if (!done && c.endsAt > ctx.now()) return;
  const duels = new Map((await repo.duelsOf(c.a, c.createdAt, 200)).map((d) => [d.id, d]));
  const score = (id: string | null) => {
    const d = id ? duels.get(id) : undefined;
    return d ? [d.record.result.stars, d.record.result.destruction] : [-1, -1];
  };
  const [as, ad] = score(c.aDuel);
  const [bs, bd] = score(c.bDuel);
  const winner = as > bs || (as === bs && ad > bd) ? c.a : bs > as || (as === bs && bd > ad) ? c.b : null;
  await repo.updateChallenge(c.id, { status: done ? 'done' : 'expired', winner });
  if (done) for (const id of [c.a, c.b]) ctx.push.notify(id, { type: 'friends', title: 'Duel challenge decided', body: 'Both attacks are in: see who won in Friends.' });
}

function challengeView(c: DuelChallenge, me: string, otherName: string): ChallengeView {
  const mineA = c.a === me;
  return {
    id: c.id,
    with: { id: mineA ? c.b : c.a, name: otherName },
    startedByMe: mineA,
    endsAt: c.endsAt,
    myDone: Boolean(mineA ? c.aDuel : c.bDuel),
    theirDone: Boolean(mineA ? c.bDuel : c.aDuel),
    winner: c.status === 'open' ? null : c.winner === null ? 'draw' : c.winner === me ? 'me' : 'them',
    status: c.status,
  };
}

export async function challenge(ctx: ServerContext, me: Player, friendId: unknown): Promise<ChallengeView> {
  const friend = await requireFriend(ctx, me, friendId);
  const open = (await ctx.repo.challengesOf(me.id, ctx.now() - CHALLENGE_MS)).find((c) => c.status === 'open' && (c.a === friend.id || c.b === friend.id));
  if (open) throw new ApiError(409, 'conflict', `You already have a challenge running with ${friend.name}.`);
  const c: DuelChallenge = { id: ctx.uuid(), a: me.id, b: friend.id, createdAt: ctx.now(), endsAt: ctx.now() + CHALLENGE_MS, aDuel: null, bDuel: null, winner: null, status: 'open' };
  await ctx.repo.addChallenge(c);
  ctx.push.notify(friend.id, { type: 'friends', title: 'Duel challenge', body: `${me.name} challenges you: attack each other's base within 24 hours.` });
  return challengeView(c, me.id, friend.name);
}

export async function duels(ctx: ServerContext, me: Player): Promise<DuelsResponse> {
  const now = ctx.now();
  const list = await ctx.repo.duelsOf(me.id, now - RETENTION_MS, 50);
  const challenges = await ctx.repo.challengesOf(me.id, now - RETENTION_MS);
  for (const c of challenges) if (c.status === 'open' && c.endsAt <= now) await settleChallenge(ctx, ctx.repo, c);
  const settled = await ctx.repo.challengesOf(me.id, now - RETENTION_MS);
  const rivalries = await ctx.repo.rivalriesOf(me.id);
  const others = new Map((await ctx.repo.playersByIds([...new Set([...rivalries.map((r) => (r.a === me.id ? r.b : r.a)), ...settled.map((c) => (c.a === me.id ? c.b : c.a))])])).map((p) => [p.id, p.name]));
  return {
    duels: list.map((d) => ({
      id: d.id,
      at: d.at,
      attacker: { id: d.attackerId, name: d.record.attackerName },
      defender: { id: d.defenderId, name: d.record.defenderName },
      mine: d.attackerId === me.id,
      layout: d.record.layout,
      challengeId: d.challengeId,
      result: { stars: d.record.result.stars, destruction: d.record.result.destruction },
      replay: { seed: d.record.seed, base: d.record.base, army: d.record.army, levels: d.record.levels, ...(d.record.reinforcements ? { reinforcements: d.record.reinforcements } : {}), deployments: d.record.deployments, endTick: d.record.endTick, rules: d.record.rules },
    })),
    rivalries: rivalries.map((r) => {
      const other = r.a === me.id ? r.b : r.a;
      return rivalryView(r, me.id, other, others.get(other) ?? 'Friend');
    }),
    challenges: settled.map((c) => challengeView(c, me.id, others.get(c.a === me.id ? c.b : c.a) ?? 'Friend')),
    hasDuelLayout: Boolean(await ctx.repo.getDuelLayout(me.id)),
  };
}

/** Set (or, with no base, clear) the layout friends may duel against. It must be legal for the player's Keep. */
export async function setDuelLayout(ctx: ServerContext, me: Player, body: { base?: unknown } | undefined): Promise<{ ok: true }> {
  if (body?.base === undefined || body.base === null) {
    await ctx.repo.setDuelLayout(me.id, null, ctx.now());
    return { ok: true };
  }
  const n = normalizeBase(structuredClone(body.base), ctx.data);
  if ('error' in n) throw new ApiError(400, 'bad_request', n.error);
  if (n.base.hallLevel > me.hallLevel) throw new ApiError(400, 'bad_request', 'A duel layout cannot be above your own Clan Keep.');
  await ctx.repo.setDuelLayout(me.id, duelBase(n.base, me.name), ctx.now());
  return { ok: true };
}
