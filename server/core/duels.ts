import { isolateName } from '../../src/gameplay/sim/social/names';
/**
 * Friendly Duels (roadmap step 62; design in docs/backend/PVP_ROADMAP.md 5.3).
 *
 * Attack a friend's village (or the duel layout they set) any time. Duels are
 * unranked on purpose, so friends can't trade wins: no Honor, no loot, no
 * rating, no shield, and no warriors are spent (like a practice battle). The
 * server still re-simulates each duel, so the rivalry tally and the replays
 * both players see can be trusted.
 *
 * Duel challenges: both friends attack each other within 24 hours; more
 * stars, then more destruction, wins. Still unranked.
 */
import type { BattleSubmission, ChallengesResponse, ChallengeView, DuelLayoutRequest, DuelReportResponse, DuelsResponse, DuelTicketRequest, DuelTicketResponse, DuelView, RivalryView } from '../../src/backend/net/protocol';
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import type { DuelChallenge, DuelTally, Player, Ticket } from '../repo';
import type { ClientInfo } from '../rules/registry';
import { ApiError, HOUR, type ServerContext } from './context';
import { battleSeed, capBaseLoot, checkArmy, engineForClient, engineForTicket, normalizeBase, resimulate, takeTicket, TICKET_TTL_MS } from './pvp';

const DAY = 24 * HOUR;
export const CHALLENGE_HOURS = 24;
/** Duels and challenges are kept this long (like replays). */
export const DUEL_RETENTION_DAYS = 30;

async function requireFriend(ctx: ServerContext, me: Player, friendId: unknown): Promise<Player> {
  const id = String(friendId ?? '');
  const p = id ? await ctx.repo.getPlayer(id) : null;
  if (!p || p.id === me.id || !(await ctx.repo.friendsOf(me.id)).some((f) => f.id === p.id)) throw new ApiError(404, 'not_found', 'You can only duel your friends.');
  return p;
}

/** Their village or duel layout, without loot (duels never pay). */
function duelBase(p: Player, layout: 'live' | 'duel' | undefined): { base: BaseLayout; layout: 'live' | 'duel' } {
  const useDuel = layout === 'duel' && p.duelBase ? p.duelBase : null;
  const src = useDuel ?? p.base;
  if (!src) throw new ApiError(409, 'not_found', `${isolateName(p.name)} has no village online yet.`);
  const base = structuredClone(src);
  base.name = p.name;
  delete base.trophies;
  for (const b of base.buildings) b.loot = {};
  return { base, layout: useDuel ? 'duel' : 'live' };
}

function rivalry(friendId: string, mine: DuelTally | undefined, theirs: DuelTally | undefined): RivalryView {
  return {
    friendId,
    duels: mine?.duels ?? 0,
    wins: mine?.wins ?? 0,
    bestStars: mine?.bestStars ?? 0,
    bestDestruction: mine?.bestDestruction ?? 0,
    theirDuels: theirs?.duels ?? 0,
    theirWins: theirs?.wins ?? 0,
    theirBestStars: theirs?.bestStars ?? 0,
    theirBestDestruction: theirs?.bestDestruction ?? 0,
  };
}

function rivalries(meId: string, tallies: DuelTally[]): RivalryView[] {
  const ids = new Set(tallies.map((t) => (t.attackerId === meId ? t.defenderId : t.attackerId)));
  return [...ids].map((id) =>
    rivalry(
      id,
      tallies.find((t) => t.attackerId === meId && t.defenderId === id),
      tallies.find((t) => t.attackerId === id && t.defenderId === meId),
    ),
  );
}

const better = (a: { stars: number; destruction: number }, b: { stars: number; destruction: number }) => a.stars - b.stars || a.destruction - b.destruction;

function challengeView(ctx: ServerContext, me: Player, c: DuelChallenge, names: Map<string, string>): ChallengeView {
  const mine = c.fromId === me.id;
  const otherId = mine ? c.toId : c.fromId;
  const my = mine ? c.fromResult : c.toResult;
  const their = mine ? c.toResult : c.fromResult;
  let outcome: ChallengeView['outcome'] = null;
  if ((my && their) || ctx.now() >= c.expiresAt) {
    if (my && their) outcome = better(my, their) > 0 ? 'win' : better(my, their) < 0 ? 'loss' : 'draw';
    else outcome = my ? 'win' : their ? 'loss' : 'draw';
  }
  return { id: c.id, createdAt: c.createdAt, expiresAt: c.expiresAt, opponent: { id: otherId, name: names.get(otherId) ?? 'A former friend' }, mine, my, their, outcome };
}

/** POST /v1/duels/ticket */
export async function duelTicket(ctx: ServerContext, me: Player, req: DuelTicketRequest | undefined, client?: ClientInfo): Promise<DuelTicketResponse> {
  const engine = engineForClient(ctx, client);
  const friend = await requireFriend(ctx, me, req?.friendId);
  let challengeId: string | undefined;
  if (req?.challengeId) {
    const c = await ctx.repo.getChallenge(String(req.challengeId));
    const side = c?.fromId === me.id ? 'from' : c?.toId === me.id ? 'to' : null;
    if (!c || !side || (side === 'from' ? c.toId : c.fromId) !== friend.id) throw new ApiError(404, 'not_found', 'That challenge is gone.');
    if (ctx.now() >= c.expiresAt) throw new ApiError(410, 'expired', 'That challenge is over.');
    if ((side === 'from' ? c.fromResult : c.toResult) !== null) throw new ApiError(409, 'no_attacks_left', 'You already attacked in this challenge.');
    challengeId = c.id;
  }
  const { base, layout } = duelBase(friend, req?.layout);
  const t = ctx.now();
  const ticket: Ticket = { id: ctx.uuid(), kind: 'duel', attackerId: me.id, defenderId: friend.id, defenderName: friend.name, base, defenderTrophies: friend.trophies, createdAt: t, expiresAt: t + TICKET_TTL_MS, used: false, seed: ctx.newSeed(), rules: ctx.rules.ticketRules(engine, client), dataVersion: engine.dataVersion, ...(challengeId ? { challengeId } : {}) };
  await ctx.repo.createTicket(ticket);
  return { ticket: ticket.id, seed: ticket.seed!, base, opponent: { id: friend.id, name: friend.name, keep: base.hallLevel }, layout, expiresAt: ticket.expiresAt };
}

/** POST /v1/duels: re-simulate, record, tally. Nothing else changes. */
export async function reportDuel(ctx: ServerContext, me: Player, sub: BattleSubmission): Promise<DuelReportResponse> {
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'duel');
  if (answered) return answered as DuelReportResponse;
  const engine = engineForTicket(ctx, ticket, sub);
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements, hero } = checkArmy(sub, me, engine.data);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}), ...(hero ? { hero } : {}) };
  const { result } = await resimulate(ctx, 'duel', setup, deployments, sub, engine);
  const defenderId = ticket.defenderId!;
  const t = ctx.now();
  const won = result.stars >= 1;
  const before = await ctx.repo.duelTallies(me.id);
  const mine = before.find((x) => x.attackerId === me.id && x.defenderId === defenderId);
  const theirs = before.find((x) => x.attackerId === defenderId && x.defenderId === me.id);
  const after: DuelTally = { attackerId: me.id, defenderId, duels: (mine?.duels ?? 0) + 1, wins: (mine?.wins ?? 0) + (won ? 1 : 0), bestStars: Math.max(mine?.bestStars ?? 0, result.stars), bestDestruction: Math.max(mine?.bestDestruction ?? 0, result.destruction) };
  const duelId = ctx.uuid();
  let challenge: DuelChallenge | null = ticket.challengeId ? await ctx.repo.getChallenge(ticket.challengeId) : null;
  const side = challenge ? (challenge.fromId === me.id ? 'from' : 'to') : null;
  if (challenge && side) challenge = { ...challenge, [side === 'from' ? 'fromResult' : 'toResult']: { stars: result.stars, destruction: result.destruction } };
  const names = new Map([[me.id, me.name], [defenderId, ticket.defenderName]]);
  const response: DuelReportResponse = { duelId, result, rivalry: rivalry(defenderId, after, theirs), ...(challenge ? { challenge: challengeView(ctx, me, challenge, names) } : {}) };
  const done = await ctx.repo.transaction(async (tx) => {
    if (!(await tx.useTicket(ticket.id, response))) return false;
    await tx.addDuel({ id: duelId, at: t, attackerId: me.id, attackerName: me.name, defenderId, defenderName: ticket.defenderName, challengeId: ticket.challengeId ?? null, seed, army, levels, base: ticket.base, deployments, ...(sub.endTick !== undefined ? { endTick: sub.endTick } : {}), result, rules: ticket.rules ?? engine.rules });
    await tx.bumpDuelTally(me.id, defenderId, won, result.stars, result.destruction);
    if (ticket.challengeId && side) await tx.setChallengeResult(ticket.challengeId, side, { stars: result.stars, destruction: result.destruction });
    return true;
  });
  if (!done) {
    const again = await ctx.repo.getTicket(ticket.id);
    if (again?.response !== undefined) return again.response as DuelReportResponse;
    throw new ApiError(409, 'conflict', 'This duel was already reported.');
  }
  ctx.push.notify(defenderId, { type: 'friends', title: `${isolateName(me.name)} dueled your village`, body: `${result.stars} star${result.stars === 1 ? '' : 's'}, ${Math.round(result.destruction)}%. A friendly duel: nothing was lost. Watch it in Friends.` });
  return response;
}

/** GET /v1/duels?since= : my duels both ways (with replays) and my rivalries. */
export async function duels(ctx: ServerContext, me: Player, since: unknown): Promise<DuelsResponse> {
  const from = Math.max(Number(since) || 0, ctx.now() - DUEL_RETENTION_DAYS * DAY);
  const list = await ctx.repo.duelsOf(me.id, from, 50);
  const views: DuelView[] = list.map((d) => ({
    id: d.id,
    at: d.at,
    side: d.attackerId === me.id ? 'attack' : 'defense',
    opponent: d.attackerId === me.id ? { id: d.defenderId, name: d.defenderName } : { id: d.attackerId, name: d.attackerName },
    ...(d.challengeId ? { challengeId: d.challengeId } : {}),
    seed: d.seed,
    army: d.army,
    levels: d.levels,
    base: d.base,
    deployments: d.deployments,
    ...(d.endTick !== undefined ? { endTick: d.endTick } : {}),
    result: d.result,
    rules: d.rules,
  }));
  return { duels: views, rivalries: rivalries(me.id, await ctx.repo.duelTallies(me.id)) };
}

/** PUT /v1/duels/layout { base | null }: the layout friends duel against (checked like a village, never holds loot). */
export async function setDuelLayout(ctx: ServerContext, me: Player, req: DuelLayoutRequest | undefined, client?: ClientInfo): Promise<void> {
  if (!req || req.base === null || req.base === undefined) {
    await ctx.repo.updatePlayer(me.id, { duelBase: null });
    return;
  }
  const rulesData = engineForClient(ctx, client).data;
  const n = normalizeBase(structuredClone(req.base), rulesData);
  if ('error' in n) throw new ApiError(400, 'bad_request', n.error);
  const base = capBaseLoot(n.base, rulesData);
  for (const b of base.buildings) b.loot = {};
  if (base.hallLevel > me.hallLevel) throw new ApiError(400, 'bad_request', 'A duel layout cannot be above your Keep.');
  base.name = me.name;
  await ctx.repo.updatePlayer(me.id, { duelBase: base });
}

/** POST /v1/duels/challenges { friendId }: one open challenge per pair. */
export async function challenge(ctx: ServerContext, me: Player, friendId: unknown): Promise<ChallengeView> {
  const friend = await requireFriend(ctx, me, friendId);
  const t = ctx.now();
  const open = (await ctx.repo.challengesOf(me.id, t - CHALLENGE_HOURS * HOUR)).find((c) => (c.fromId === friend.id || c.toId === friend.id) && t < c.expiresAt && !(c.fromResult && c.toResult));
  if (open) throw new ApiError(409, 'conflict', `You and ${isolateName(friend.name)} already have a challenge going.`);
  const c: DuelChallenge = { id: ctx.uuid(), fromId: me.id, toId: friend.id, createdAt: t, expiresAt: t + CHALLENGE_HOURS * HOUR, fromResult: null, toResult: null };
  await ctx.repo.addChallenge(c);
  ctx.push.notify(friend.id, { type: 'friends', title: `${isolateName(me.name)} challenged you to a duel`, body: 'Attack each other within 24 hours: more stars wins. Open Friends.' });
  return challengeView(ctx, me, c, new Map([[friend.id, friend.name]]));
}

/** GET /v1/duels/challenges: this week's challenges. */
export async function challenges(ctx: ServerContext, me: Player): Promise<ChallengesResponse> {
  const list = await ctx.repo.challengesOf(me.id, ctx.now() - 7 * DAY);
  const names = new Map<string, string>();
  for (const c of list) {
    const other = c.fromId === me.id ? c.toId : c.fromId;
    if (!names.has(other)) names.set(other, (await ctx.repo.getPlayer(other))?.name ?? 'A former friend');
  }
  return { challenges: list.sort((a, b) => b.createdAt - a.createdAt).map((c) => challengeView(ctx, me, c, names)) };
}
