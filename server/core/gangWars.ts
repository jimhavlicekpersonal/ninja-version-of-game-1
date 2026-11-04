/**
 * Gang Wars (roadmap steps 65-66, section 5.5): asynchronous wars between
 * Gangs of the same size.
 *
 * - Queue: the leader looks for a war. Gangs are matched on size, then Gang
 *   Rating (the accepted difference widens while waiting), then total Power;
 *   never a recent opponent (last `recentOpponents` wars), and never two
 *   Gangs whose members mostly share one Alliance. After `botAfterMinutes` a
 *   generated Gang is offered: labelled as generated, never rated.
 * - Prep (`prepHours`): rosters are locked (nobody joins or leaves); each
 *   member's base is copied without loot, and may be replaced by a war layout.
 * - Battle day (`battleHours`): each member has `attacksPerMember` attacks,
 *   solo or relay. A relay strike starts from the damage the Gang already did
 *   to that base (`BattleSetup.startDamage`, step 64); two mates cannot relay
 *   the same base at once. Each enemy base counts its best result.
 * - End: more stars wins, then more destruction. Each member collects a fixed
 *   chest once (`claimGangWarChest`); real wars move both Gang Ratings once
 *   (`rateMatch`). Honor never changes.
 */
import type { GangWarAttackResponse, GangWarClaimResponse, GangWarResponse, GangWarSideView, GangWarTicketResponse, GangWarView } from '../../src/backend/net/protocol';
import type { BattleSubmission } from '../../src/backend/net/protocol';
import { SIM_RULES } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import { scaleReward } from '../../src/gameplay/sim/economy';
import { newRating, powerRating, rateMatch, type Rating } from '../../src/gameplay/sim/rating';
import { createRng, mixSeed, next } from '../../src/gameplay/sim/rng';
import { contentHash } from '../contentHash';
import type { Player, Repo, Squad, SquadWar, SquadWarAttack, WarRosterEntry } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { battleSeed, checkArmy, maxHousing, normalizeBase, resimulate, takeTicket } from './pvp';
import { applyServerResult } from './village';

const TICKET_MS = 10 * MIN;
const SHOWN_AFTER_END_MS = 3 * 24 * HOUR;

type Side = 'a' | 'b';
const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');

function rules(ctx: ServerContext) {
  return ctx.data.social.gangWar;
}

function phaseOf(w: SquadWar, now: number): 'prep' | 'battle' | 'ended' {
  return now < w.prepUntil ? 'prep' : now < w.endsAt ? 'battle' : 'ended';
}

async function requireGang(ctx: ServerContext, me: Player): Promise<{ gang: Squad; leader: boolean; members: string[] }> {
  const gang = await ctx.repo.squadOf(me.id);
  if (!gang) throw new ApiError(404, 'not_found', 'You are not in a Gang.');
  const members = await ctx.repo.squadMembers(gang.id);
  return { gang, leader: gang.leaderId === me.id, members: members.map((m) => m.playerId) };
}

/** The Gang's latest war while it matters (running, or ended in the last days). */
export async function currentWar(repo: Repo, squadId: string, now: number): Promise<SquadWar | null> {
  const w = (await repo.squadWarsOf(squadId, 1))[0];
  return w && now < w.endsAt + SHOWN_AFTER_END_MS ? w : null;
}

/** True while the Gang is queued or its war has not ended: the roster is locked. */
export async function gangLocked(repo: Repo, squadId: string, now: number): Promise<boolean> {
  if ((await repo.squadQueue()).some((e) => e.squadId === squadId)) return true;
  const w = (await repo.squadWarsOf(squadId, 1))[0];
  return Boolean(w && now < w.endsAt);
}

function gangRating(s: Squad, ctx: ServerContext): Rating {
  return s.rating ?? newRating(ctx.now(), ctx.data.ranks.rating);
}

async function gangPower(ctx: ServerContext, ids: string[]): Promise<number> {
  const def = ctx.data.ranks.rating;
  return (await ctx.repo.playersByIds(ids)).reduce((s, p) => s + powerRating(p.ratings?.attack ?? newRating(ctx.now(), def), p.hallLevel, def), 0);
}

const warBase = (base: BaseLayout, name: string): BaseLayout => {
  const b = structuredClone(base);
  b.name = name;
  delete b.trophies;
  delete b.practice;
  for (const x of b.buildings) delete x.loot;
  return b;
};

async function rosterOf(ctx: ServerContext, ids: string[]): Promise<WarRosterEntry[]> {
  const players = (await ctx.repo.playersByIds(ids)).sort((a, b) => b.hallLevel - a.hallLevel || a.createdAt - b.createdAt);
  return players.map((p, index) => ({ index, playerId: p.id, name: p.name, hallLevel: p.hallLevel, base: warBase(p.base!, p.name) }));
}

function notifyAll(ctx: ServerContext, ids: (string | null)[], title: string, body: string): void {
  for (const id of ids) if (id) ctx.push.notify(id, { type: 'gangWar', title, body });
}

async function createWar(ctx: ServerContext, a: Squad, aIds: string[], b: Squad | null, bIds: string[]): Promise<SquadWar> {
  const r = rules(ctx);
  const now = ctx.now();
  const aRoster = await rosterOf(ctx, aIds);
  let bSide;
  let bot: { seed: number } | null = null;
  if (b) {
    bSide = { squadId: b.id, name: b.name, roster: await rosterOf(ctx, bIds) };
  } else {
    // A generated Gang the same size, each base at the Keep of the member it faces (labelled as generated).
    const seed = mixSeed(parseInt(contentHash(a.id).slice(0, 8), 16), Math.floor(now / MIN));
    bot = { seed };
    const rng = createRng(seed);
    const names = ctx.data.names;
    const pick = (list: string[]) => list[Math.floor(next(rng) * list.length)];
    const name = `${pick(names.placeFirst)} ${pick(names.placeSecond)} (generated)`;
    const roster = aRoster.map((m, index) => {
      const who = `${pick(names.playerFirst)} ${pick(names.playerSecond)}`;
      return { index, playerId: null, name: who, hallLevel: m.hallLevel, base: warBase(generateOpponent(mixSeed(seed, index + 1), m.hallLevel, ctx.data), who) };
    });
    bSide = { squadId: null, name, roster };
  }
  const war: SquadWar = {
    id: ctx.uuid(),
    aSquad: a.id,
    bSquad: b?.id ?? null,
    createdAt: now,
    prepUntil: now + r.prepHours * HOUR,
    endsAt: now + (r.prepHours + r.battleHours) * HOUR,
    doc: { size: aRoster.length, bot, sides: { a: { squadId: a.id, name: a.name, roster: aRoster }, b: bSide }, relay: {}, pending: {}, rated: false },
  };
  await ctx.repo.createSquadWar(war);
  notifyAll(ctx, aIds, 'Gang War found!', `${a.name} against ${bSide.name}. Prepare your bases: the battle starts in ${r.prepHours} hours.`);
  if (b) notifyAll(ctx, bIds, 'Gang War found!', `${b.name} against ${a.name}. Prepare your bases: the battle starts in ${r.prepHours} hours.`);
  return war;
}

/** Try to pair a queued Gang now (or give it a generated opponent once it has waited long enough). */
async function matchQueued(ctx: ServerContext, squadId: string): Promise<SquadWar | null> {
  const r = rules(ctx);
  const now = ctx.now();
  const queue = await ctx.repo.squadQueue();
  const mine = queue.find((e) => e.squadId === squadId);
  if (!mine) return null;
  const recent = new Set((await ctx.repo.squadWarsOf(squadId, r.recentOpponents)).map((w) => (w.aSquad === squadId ? w.bSquad : w.aSquad)).filter((x): x is string => Boolean(x)));
  const myMembers = (await ctx.repo.squadMembers(squadId)).map((m) => m.playerId);
  const candidates = [];
  for (const e of queue) {
    if (e.squadId === squadId || e.size !== mine.size || recent.has(e.squadId)) continue;
    const waited = Math.max(now - mine.at, now - e.at) / MIN;
    if (Math.abs(e.rating - mine.rating) > r.ratingWindow + r.ratingWindowPerMinute * waited) continue;
    const theirMembers = (await ctx.repo.squadMembers(e.squadId)).map((m) => m.playerId);
    if ((await ctx.repo.squadWarsOf(e.squadId, r.recentOpponents)).some((w) => w.aSquad === squadId || w.bSquad === squadId)) continue;
    // Not two Gangs that are mostly one Alliance (they could arrange results).
    const all = await ctx.repo.playersByIds([...myMembers, ...theirMembers]);
    const groves = new Map<string, number>();
    for (const p of all) if (p.groveId) groves.set(p.groveId, (groves.get(p.groveId) ?? 0) + 1);
    if ([...groves.values()].some((n) => n > all.length / 2)) continue;
    candidates.push({ e, members: theirMembers });
  }
  candidates.sort((x, y) => Math.abs(x.e.rating - mine.rating) - Math.abs(y.e.rating - mine.rating) || Math.abs(x.e.power - mine.power) - Math.abs(y.e.power - mine.power));
  for (const c of candidates) {
    const war = await ctx.repo
      .transaction(async (tx) => {
        // Whoever takes both Gangs out of the queue owns the pairing.
        if (!(await tx.dequeueSquad(squadId))) return null;
        if (!(await tx.dequeueSquad(c.e.squadId))) throw new Error('taken');
        const [a, b] = [await tx.getSquad(squadId), await tx.getSquad(c.e.squadId)];
        if (!a || !b) throw new Error('gone');
        return createWar({ ...ctx, repo: tx }, a, myMembers, b, c.members);
      })
      .catch((e: Error) => {
        if (e.message === 'taken' || e.message === 'gone') return undefined;
        throw e;
      });
    if (war === null) return null;
    if (war) return war;
  }
  if (now - mine.at >= r.botAfterMinutes * MIN && (await ctx.repo.dequeueSquad(squadId))) {
    const a = await ctx.repo.getSquad(squadId);
    if (a) return createWar(ctx, a, myMembers, null, []);
  }
  return null;
}

export async function queue(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const r = rules(ctx);
  const { gang, leader, members } = await requireGang(ctx, me);
  if (!leader) throw new ApiError(403, 'bad_request', 'Only the leader starts a war.');
  if (members.length < r.minMembers) throw new ApiError(409, 'conflict', `A Gang War needs at least ${r.minMembers} members.`);
  const w = (await ctx.repo.squadWarsOf(gang.id, 1))[0];
  if (w && ctx.now() < w.endsAt) throw new ApiError(409, 'conflict', 'Your Gang is already at war.');
  const players = await ctx.repo.playersByIds(members);
  const noBase = players.filter((p) => !p.base).map((p) => p.name);
  if (noBase.length) throw new ApiError(409, 'conflict', `Every member needs a base online first: ${noBase.join(', ')}.`);
  await ctx.repo.enqueueSquad({ squadId: gang.id, size: members.length, rating: gangRating(gang, ctx).rating, power: await gangPower(ctx, members), at: ctx.now() });
  await matchQueued(ctx, gang.id);
  return view(ctx, me);
}

export async function leaveQueue(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const { gang, leader } = await requireGang(ctx, me);
  if (!leader) throw new ApiError(403, 'bad_request', 'Only the leader decides.');
  await ctx.repo.dequeueSquad(gang.id);
  return view(ctx, me);
}

interface Best {
  stars: number;
  destruction: number;
}
const better = (a: Best, b: Best | null) => !b || a.stars > b.stars || (a.stars === b.stars && a.destruction > b.destruction);

/** What a generated Gang has done to our bases by `now` (deterministic, revealed over the battle day). */
function botResults(ctx: ServerContext, war: SquadWar, now: number): (Best | null)[] {
  const r = rules(ctx);
  const odds = r.botStarOdds;
  const ours = war.doc.sides.a.roster;
  return ours.map((m, i) => {
    const rng = createRng(mixSeed(war.doc.bot!.seed, 0xb07 + i));
    const at = war.prepUntil + next(rng) * (war.endsAt - war.prepUntil);
    if (now < at) return null;
    const diff = (war.doc.sides.b.roster[i]?.hallLevel ?? m.hallLevel) - m.hallLevel;
    const shift = odds.perHallDiff * diff;
    const roll = next(rng);
    const p3 = Math.max(0, odds.base3 + shift);
    const p2 = Math.max(0, odds.base2 + shift / 2);
    const p1 = Math.max(0, odds.base1);
    const stars = roll < p3 ? 3 : roll < p3 + p2 ? 2 : roll < p3 + p2 + p1 ? 1 : 0;
    const destruction = stars === 3 ? 100 : Math.floor(20 + stars * 25 + next(rng) * 20);
    return { stars, destruction };
  });
}

/** Best results against each base of `target` side. */
function bestAgainst(ctx: ServerContext, war: SquadWar, attacks: SquadWarAttack[], target: Side, now: number): (Best | null)[] {
  if (war.doc.bot && target === 'a') return botResults(ctx, war, now);
  const out: (Best | null)[] = war.doc.sides[target].roster.map(() => null);
  for (const a of attacks) if (a.side === other(target) && better(a, out[a.target])) out[a.target] = { stars: a.stars, destruction: a.destruction };
  return out;
}

function score(best: (Best | null)[]): { stars: number; destruction: number } {
  const stars = best.reduce((s, b) => s + (b?.stars ?? 0), 0);
  const destruction = best.length ? Math.round(best.reduce((s, b) => s + (b?.destruction ?? 0), 0) / best.length) : 0;
  return { stars, destruction };
}

function winner(a: { stars: number; destruction: number }, b: { stars: number; destruction: number }): Side | null {
  if (a.stars !== b.stars) return a.stars > b.stars ? 'a' : 'b';
  if (a.destruction !== b.destruction) return a.destruction > b.destruction ? 'a' : 'b';
  return null;
}

/** After the war: move both Gang Ratings once (real wars only). */
async function settle(ctx: ServerContext, war: SquadWar): Promise<void> {
  if (war.doc.rated || war.doc.bot || ctx.now() < war.endsAt || !war.bSquad) return;
  await ctx.repo.transaction(async (tx) => {
    const w = await tx.getSquadWar(war.id, { forUpdate: true });
    if (!w || w.doc.rated) return;
    const attacks = await tx.squadWarAttacks(w.id);
    const sa = score(bestAgainst(ctx, w, attacks, 'b', ctx.now()));
    const sb = score(bestAgainst(ctx, w, attacks, 'a', ctx.now()));
    const win = winner(sa, sb);
    const [a, b] = [await tx.getSquad(w.aSquad), await tx.getSquad(w.bSquad!)];
    if (a && b) {
      const r = rateMatch(gangRating(a, ctx), gangRating(b, ctx), win === 'a' ? 1 : win === 'b' ? 0 : 0.5, ctx.now(), ctx.data.ranks.rating);
      await tx.setSquadRating(a.id, r.a);
      await tx.setSquadRating(b.id, r.b);
    }
    w.doc.rated = true;
    await tx.saveSquadWar(w);
  });
}

export async function view(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const { gang } = await requireGang(ctx, me);
  const now = ctx.now();
  if ((await ctx.repo.squadQueue()).some((e) => e.squadId === gang.id)) await matchQueued(ctx, gang.id);
  const queued = (await ctx.repo.squadQueue()).find((e) => e.squadId === gang.id);
  let war = await currentWar(ctx.repo, gang.id, now);
  if (war) {
    await settle(ctx, war);
    war = (await ctx.repo.getSquadWar(war.id))!;
  }
  const fresh = await ctx.repo.getSquad(gang.id);
  return { queued: queued ? { since: queued.at } : null, war: war ? await warView(ctx, me, war) : null, rating: fresh?.rating ? Math.round(fresh.rating.rating) : null };
}

async function warView(ctx: ServerContext, me: Player, war: SquadWar): Promise<GangWarView> {
  const now = ctx.now();
  const mySide: Side = war.aSquad === (await ctx.repo.squadOf(me.id))?.id ? 'a' : 'b';
  const attacks = await ctx.repo.squadWarAttacks(war.id);
  const phase = phaseOf(war, now);
  const theirSide = other(mySide);
  const bestOnTheirs = bestAgainst(ctx, war, attacks, theirSide, now);
  const bestOnOurs = bestAgainst(ctx, war, attacks, mySide, now);
  const ratingOf = async (squadId: string | null) => {
    const sq = squadId ? await ctx.repo.getSquad(squadId) : null;
    return sq?.rating ? Math.round(sq.rating.rating) : null;
  };
  /** A side's bases, each with the best result the other side has on it (and, for the enemy, my Gang's relay). */
  const bases = (side: Side, best: (Best | null)[], enemy: boolean) =>
    war.doc.sides[side].roster.map((m) => {
      const relay = war.doc.relay[`${mySide}:${m.index}`];
      const busy = Object.values(war.doc.pending).some((p) => p.side === mySide && p.target === m.index && p.relay && p.expiresAt > now);
      const total = m.base.buildings.length || 1;
      return {
        index: m.index,
        name: m.name,
        hallLevel: m.hallLevel,
        best: best[m.index],
        ...(enemy ? { relay: { strikes: relay?.strikes ?? 0, damaged: Math.round((Object.keys(relay?.damage ?? {}).length / total) * 100), lastBy: relay?.by[relay.by.length - 1] ?? null, busy } } : {}),
      };
    });
  const myScore = score(bestOnTheirs); // the stars we took
  const theirScore = score(bestOnOurs); // the stars they took
  const oursView: GangWarSideView = { name: war.doc.sides[mySide].name, generated: war.doc.sides[mySide].squadId === null, rating: await ratingOf(war.doc.sides[mySide].squadId), ...myScore, bases: bases(mySide, bestOnOurs, false) };
  const theirsView: GangWarSideView = { name: war.doc.sides[theirSide].name, generated: war.doc.sides[theirSide].squadId === null, rating: await ratingOf(war.doc.sides[theirSide].squadId), ...theirScore, bases: bases(theirSide, bestOnTheirs, true) };
  const used = attacks.filter((a) => a.attackerId === me.id).length + Object.values(war.doc.pending).filter((p) => p.playerId === me.id && p.expiresAt > now).length;
  const w = phase === 'ended' ? winner(myScore, theirScore) : null;
  return {
    id: war.id,
    phase,
    prepUntil: war.prepUntil,
    endsAt: war.endsAt,
    size: war.doc.size,
    ours: oursView,
    theirs: theirsView,
    attacksLeft: Math.max(0, rules(ctx).attacksPerMember - used),
    attacks: attacks.map((a) => {
      const targetSide = other(a.side);
      return {
        id: a.id,
        at: a.at,
        side: a.side === mySide ? ('ours' as const) : ('theirs' as const),
        attacker: a.record.attackerName,
        target: a.target,
        targetName: war.doc.sides[targetSide].roster[a.target]?.name ?? '',
        relay: a.relay,
        stars: a.stars,
        destruction: a.destruction,
        replay: { seed: a.record.seed, base: a.record.base, army: a.record.army, levels: a.record.levels, ...(a.record.reinforcements ? { reinforcements: a.record.reinforcements } : {}), ...(a.record.startDamage ? { startDamage: a.record.startDamage } : {}), deployments: a.record.deployments, endTick: a.record.endTick, result: a.record.result, rules: a.record.rules },
      };
    }),
    // winner(myScore, theirScore): 'a' means the first argument, us.
    outcome: phase === 'ended' ? (w === null ? 'draw' : w === 'a' ? 'win' : 'loss') : null,
    claimed: phase === 'ended' && (await ctx.repo.hasClaimedSquadWar(war.id, me.id)),
  };
}

/** During prep: my base for this war (legal for my Keep; no loot). */
export async function setWarBase(ctx: ServerContext, me: Player, body: { base?: unknown } | undefined): Promise<GangWarResponse> {
  const { gang } = await requireGang(ctx, me);
  const n = normalizeBase(structuredClone(body?.base), ctx.data);
  if ('error' in n) throw new ApiError(400, 'bad_request', n.error);
  if (n.base.hallLevel > me.hallLevel) throw new ApiError(400, 'bad_request', 'A war base cannot be above your own Clan Keep.');
  await ctx.repo.transaction(async (tx) => {
    const cur = await currentWar(tx, gang.id, ctx.now());
    const war = cur ? await tx.getSquadWar(cur.id, { forUpdate: true }) : null;
    if (!war || phaseOf(war, ctx.now()) !== 'prep') throw new ApiError(409, 'conflict', 'War bases can be changed only during prep.');
    const side: Side = war.aSquad === gang.id ? 'a' : 'b';
    const entry = war.doc.sides[side].roster.find((m) => m.playerId === me.id);
    if (!entry) throw new ApiError(404, 'not_found', 'You are not on this war roster.');
    entry.base = warBase(n.base, me.name);
    entry.hallLevel = n.base.hallLevel;
    await tx.saveSquadWar(war);
  });
  return view(ctx, me);
}

export async function warTicket(ctx: ServerContext, me: Player, body: { target?: unknown; relay?: unknown } | undefined): Promise<GangWarTicketResponse> {
  const { gang } = await requireGang(ctx, me);
  const now = ctx.now();
  const target = Number(body?.target);
  const relay = body?.relay === true;
  return ctx.repo.transaction(async (tx) => {
    const cur = await currentWar(tx, gang.id, now);
    const war = cur ? await tx.getSquadWar(cur.id, { forUpdate: true }) : null;
    if (!war || phaseOf(war, now) !== 'battle') throw new ApiError(409, 'raid_not_live', 'The battle day is not running.');
    const side: Side = war.aSquad === gang.id ? 'a' : 'b';
    if (!war.doc.sides[side].roster.some((m) => m.playerId === me.id)) throw new ApiError(403, 'bad_request', 'You joined after the war started: you are not on its roster.');
    const enemy = war.doc.sides[other(side)].roster[target];
    if (!Number.isInteger(target) || !enemy) throw new ApiError(400, 'bad_request', 'No such enemy base.');
    for (const [id, p] of Object.entries(war.doc.pending)) if (p.expiresAt <= now) delete war.doc.pending[id];
    const used = (await tx.squadWarAttacks(war.id)).filter((a) => a.attackerId === me.id).length + Object.values(war.doc.pending).filter((p) => p.playerId === me.id).length;
    if (used >= rules(ctx).attacksPerMember) throw new ApiError(409, 'no_attacks_left', 'You have used your war attacks.');
    if (relay && Object.values(war.doc.pending).some((p) => p.side === side && p.target === target && p.relay)) throw new ApiError(409, 'conflict', 'A Gang mate is striking that base right now. Wait for their result.');
    const chain = war.doc.relay[`${side}:${target}`];
    const startDamage = relay ? chain?.damage : undefined;
    // A relay's strikes share one army budget (a half-army opener plus the main force).
    const maxShare = relay ? Math.min(1, rules(ctx).relayHousingShare - (chain?.share ?? 0)) : 1;
    if (relay && maxShare < 0.1) throw new ApiError(409, 'no_attacks_left', 'This base\'s relay has used its army budget. Attack it solo, or pick another base.');
    const ticket = { id: ctx.uuid(), kind: 'gangwar' as const, attackerId: me.id, defenderId: enemy.playerId, defenderName: enemy.name, base: enemy.base, defenderTrophies: 0, createdAt: now, expiresAt: now + TICKET_MS, used: false, seed: ctx.newSeed(), groveId: war.id, target };
    await tx.createTicket(ticket);
    war.doc.pending[ticket.id] = { side, target, relay, playerId: me.id, ...(startDamage ? { startDamage } : {}), maxShare, expiresAt: ticket.expiresAt };
    await tx.saveSquadWar(war);
    return { ticket: ticket.id, seed: ticket.seed, base: enemy.base, ...(startDamage ? { startDamage } : {}), armyShare: maxShare, expiresAt: ticket.expiresAt, targetName: enemy.name };
  });
}

export async function warAttack(ctx: ServerContext, me: Player, sub: BattleSubmission): Promise<GangWarAttackResponse> {
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'gangwar');
  if (answered) return answered as GangWarAttackResponse;
  const war0 = await ctx.repo.getSquadWar(ticket.groveId!);
  const pend = war0?.doc.pending[ticket.id];
  if (!war0 || !pend) throw new ApiError(404, 'not_found', 'That war ticket is gone.');
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements } = checkArmy(sub, me, ctx.data);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const housing = Object.entries(army).reduce((s, [t, n]) => s + (ctx.data.troops[t]?.housing ?? 0) * n, 0) + Object.entries(reinforcements).reduce((s, [t, r]) => s + (ctx.data.troops[t]?.housing ?? 0) * r.count, 0);
  const share = housing / Math.max(1, maxHousing(me.hallLevel, ctx.data));
  if (pend.relay && share > (pend.maxShare ?? 1) + 1e-9) throw new ApiError(400, 'bad_request', `This relay strike may bring at most ${Math.round((pend.maxShare ?? 1) * 100)}% of a full army.`);
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}), ...(pend.relay && pend.startDamage ? { startDamage: pend.startDamage } : {}) };
  const { result, damage } = await resimulate(ctx, 'gangwar', setup, deployments, sub);
  const t = ctx.now();
  const side = pend.side;
  const key = `${side}:${pend.target}`;
  const response = await ctx.repo.transaction(async (tx) => {
    const war = (await tx.getSquadWar(war0.id, { forUpdate: true }))!;
    await tx.addSquadWarAttack({
      id: ctx.uuid(),
      warId: war.id,
      side,
      attackerId: me.id,
      target: pend.target,
      relay: pend.relay,
      at: t,
      stars: result.stars,
      destruction: result.destruction,
      record: { attackerName: me.name, seed, base: ticket.base, army, levels, ...(setup.reinforcements ? { reinforcements } : {}), ...(setup.startDamage ? { startDamage: setup.startDamage } : {}), deployments, endTick: sub.endTick, result, rules: SIM_RULES },
    });
    if (pend.relay) {
      const prev = war.doc.relay[key];
      war.doc.relay[key] = { damage, strikes: (prev?.strikes ?? 0) + 1, by: [...(prev?.by ?? []), me.name], lastAt: t, share: (prev?.share ?? 0) + Math.min(share, pend.maxShare ?? 1) };
    }
    delete war.doc.pending[ticket.id];
    await tx.saveSquadWar(war);
    // A village the server keeps spends the warriors who fought (like an Alliance War attack).
    const spent = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'remoteGroveBattleEnd', target: pend.target, record: { at: t, opponentName: ticket.defenderName, setup, deployments, endTick: sub.endTick }, known: result }, reason: 'gangwar:troops' }], ticket.id);
    if (spent && !spent.ok) throw new ApiError(400, 'bad_request', `Your village on the server says: ${spent.message}`);
    const attacks = await tx.squadWarAttacks(war.id);
    const theirSide = other(side);
    const bestTheirs = bestAgainst(ctx, war, attacks, theirSide, t);
    const out: GangWarAttackResponse = { result, combined: bestTheirs[pend.target] ?? { stars: 0, destruction: 0 }, ours: score(bestTheirs).stars, theirs: score(bestAgainst(ctx, war, attacks, side, t)).stars };
    if (!(await tx.useTicket(ticket.id, out))) throw new ApiError(409, 'conflict', 'This battle was already reported.');
    return out;
  });
  // Pushes: the defender, and (a relay) the mates who can finish the base.
  const enemy = war0.doc.sides[other(side)].roster[pend.target];
  if (enemy?.playerId) ctx.push.notify(enemy.playerId, { type: 'gangWar', title: 'Your Gang is under attack', body: `${me.name} hit your war base: ${result.stars} star${result.stars === 1 ? '' : 's'}.` });
  if (pend.relay) {
    const mates = war0.doc.sides[side].roster.map((m) => m.playerId).filter((id): id is string => Boolean(id) && id !== me.id);
    notifyAll(ctx, mates, 'Your turn in the relay', `${me.name} left ${enemy?.name ?? 'their base'} at ${result.destruction}%: finish it with a relay strike.`);
  }
  return response;
}

export async function claim(ctx: ServerContext, me: Player): Promise<GangWarClaimResponse> {
  const { gang } = await requireGang(ctx, me);
  const now = ctx.now();
  const war = await currentWar(ctx.repo, gang.id, now);
  if (!war || phaseOf(war, now) !== 'ended') throw new ApiError(409, 'raid_not_ended', 'The war has not ended yet.');
  const side: Side = war.aSquad === gang.id ? 'a' : 'b';
  if (!war.doc.sides[side].roster.some((m) => m.playerId === me.id)) throw new ApiError(403, 'bad_request', 'You were not on this war roster.');
  await settle(ctx, war);
  const attacks = await ctx.repo.squadWarAttacks(war.id);
  const ours = score(bestAgainst(ctx, war, attacks, other(side), now));
  const theirs = score(bestAgainst(ctx, war, attacks, side, now));
  const w = winner(ours, theirs);
  const outcome = w === null ? 'draw' : w === 'a' ? 'win' : 'loss';
  const chest = scaleReward(rules(ctx).rewards[outcome], me.hallLevel, ctx.data);
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.claimSquadWar(war.id, me.id, now))) throw new ApiError(409, 'conflict', 'You already collected this war chest.');
    await applyServerResult(tx, ctx, me, [{ cmd: { type: 'claimGangWarChest', warId: war.id, outcome }, reason: 'gangwar:chest' }], war.id);
  });
  return { warId: war.id, outcome, ours: ours.stars, theirs: theirs.stars, chest };
}

/** Hourly: tell members a war ends within two hours (once per war). */
export async function remindEnding(ctx: ServerContext): Promise<number> {
  const now = ctx.now();
  let n = 0;
  for (const w of await ctx.repo.activeSquadWars(now)) {
    if (w.doc.reminded || w.endsAt - now > 2 * HOUR || now < w.prepUntil) continue;
    w.doc.reminded = true;
    await ctx.repo.saveSquadWar(w);
    for (const s of ['a', 'b'] as Side[]) notifyAll(ctx, w.doc.sides[s].roster.map((m) => m.playerId), 'Gang War ends soon', 'Less than two hours left: use your war attacks.');
    n++;
  }
  return n;
}
