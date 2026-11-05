/**
 * Gang Wars (roadmap steps 65-66; design in docs/backend/PVP_ROADMAP.md 5.5).
 *
 * - The leader queues the Gang. It meets a Gang of the same size (2v2-4v4),
 *   then the closest Gang Rating, then the closest total Power (sum of Keeps).
 *   Never a recent opponent (last `recentOpponents` wars) or a Gang mostly
 *   from the same Alliance. Nobody after `botAfterMinutes`: a generated Gang,
 *   labelled as one; bot wars never move the Gang Rating.
 * - Prep (`prepHours`): each member's village is copied into the war without
 *   loot; members can copy it again after moving defenses. Rosters are locked
 *   until the war ends (squads.ts).
 * - Battle day (`battleHours`): `attacksPerMember` attacks each. A solo strike
 *   attacks the base fresh; a relay strike starts from `relayCarry` (half) of
 *   the damage the Gang's last relay strike on that base left (SIM_RULES 3,
 *   step 64; measured in step 69), one striker at a time. Each base counts its best result, solo or relay.
 * - More stars wins, then more destruction. Every member claims a fixed chest
 *   scaled to their Keep (social.json gangWar.rewards). Honor never moves.
 * - Gang Rating (step 66): `rateTeams` once a war between two real Gangs ends.
 */
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { newRating, rateTeams, type Rating } from '../../src/gameplay/sim/rating';
import { mixSeed } from '../../src/gameplay/sim/rng';
import { botGangScores, carryRelayDamage, gangWarOutcome, gangWarPhase, gangWarTimes, sideTotal, type BaseScore } from '../../src/gameplay/sim/social/gangWar';
import type { BattleSubmission, GangWarAttackResponse, GangWarBaseView, GangWarClaimResponse, GangWarResponse, GangWarTicketRequest, GangWarTicketResponse, GangWarView } from '../../src/backend/net/protocol';
import type { GangQueueEntry, GangRelay, GangWar, GangWarAttack, GangWarEntry, GangWarSide, Player, Squad, Ticket } from '../repo';
import type { ClientInfo } from '../rules/registry';
import { ApiError, MIN, type ServerContext } from './context';
import { battleSeed, checkArmy, engineForClient, engineForTicket, resimulate, takeTicket, TICKET_TTL_MS, burnAfterFailures, requireArmyOnServer } from './pvp';
import { requireSquad, setRosterLock } from './squads';
import { applyServerResult } from './village';

/** The roster lock squads.ts asks about: a war that has not ended. */
setRosterLock(async (ctx, squadId) => Boolean(await ctx.repo.activeWarOf(squadId, ctx.now())));

const other = (s: 'a' | 'b'): 'a' | 'b' => (s === 'a' ? 'b' : 'a');

function warBase(base: BaseLayout | null, name: string, keep: number, seed: number, ctx: ServerContext): BaseLayout {
  const b = structuredClone(base ?? generateOpponent(seed, keep, ctx.data));
  b.name = name;
  delete b.trophies;
  for (const x of b.buildings) x.loot = {};
  return b;
}

async function rosterOf(ctx: ServerContext, squad: Squad): Promise<GangWarEntry[]> {
  const out: GangWarEntry[] = [];
  for (const m of await ctx.repo.squadMembers(squad.id)) {
    const p = await ctx.repo.getPlayer(m.playerId);
    if (!p) continue;
    out.push({ index: 0, playerId: p.id, name: p.name, keep: p.hallLevel, base: warBase(p.base, p.name, p.hallLevel, mixSeed(p.hallLevel, out.length), ctx) });
  }
  // Strongest first, so base 1 is each side's toughest.
  out.sort((a, b) => b.keep - a.keep || a.name.localeCompare(b.name));
  out.forEach((e, i) => (e.index = i));
  return out;
}

function ratingOf(ctx: ServerContext, s: Squad): Rating {
  return s.rating ?? newRating(ctx.now(), ctx.data.ranks.rating);
}

/** A side as seen from a Gang: which side it is in this war. */
function sideOf(w: GangWar, squadId: string): 'a' | 'b' | null {
  return w.a.squadId === squadId ? 'a' : w.b.squadId === squadId ? 'b' : null;
}

/** Each enemy base's best result for the side attacking it, solo or relay, up to time `t`. */
async function bestOn(ctx: ServerContext, w: GangWar, attacking: 'a' | 'b', t: number, attacks: GangWarAttack[]): Promise<BaseScore[]> {
  const defending = w[other(attacking)];
  const att = w[attacking];
  if (att.bot) {
    const { prepEndsAt, endsAt } = w;
    return botGangScores(att.botSeed, defending.roster.map((e) => e.keep), att.roster.map((e) => e.keep), prepEndsAt, endsAt, t, ctx.data);
  }
  const best: BaseScore[] = defending.roster.map(() => ({ stars: 0, destruction: 0 }));
  for (const a of attacks) {
    if (a.side !== attacking || a.at > t || a.target >= best.length) continue;
    const b = best[a.target];
    if (a.stars > b.stars || (a.stars === b.stars && a.destruction > b.destruction)) best[a.target] = { stars: a.stars, destruction: a.destruction };
  }
  return best;
}

async function totals(ctx: ServerContext, w: GangWar, side: 'a' | 'b', t: number): Promise<{ ours: BaseScore[]; theirs: BaseScore[] }> {
  const attacks = await ctx.repo.warAttacks(w.id);
  return { ours: await bestOn(ctx, w, side, t, attacks), theirs: await bestOn(ctx, w, other(side), t, attacks) };
}

/** Once a war between two real Gangs has ended: move both Gang Ratings (step 66), once. */
async function rateIfEnded(ctx: ServerContext, w: GangWar): Promise<void> {
  if (w.rated || ctx.now() < w.endsAt || w.a.bot || w.b.bot || !w.a.squadId || !w.b.squadId) return;
  const { ours, theirs } = await totals(ctx, w, 'a', w.endsAt);
  const outcome = gangWarOutcome(sideTotal(ours), sideTotal(theirs));
  const [sa, sb] = await Promise.all([ctx.repo.getSquad(w.a.squadId), ctx.repo.getSquad(w.b.squadId)]);
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.markWarRated(w.id))) return;
    if (!sa || !sb) return;
    const r = rateTeams(ratingOf(ctx, sa), ratingOf(ctx, sb), outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0, w.endsAt, ctx.data.ranks.rating);
    await tx.updateSquad(sa.id, { rating: r.a });
    await tx.updateSquad(sb.id, { rating: r.b });
  });
}

function notifyGang(ctx: ServerContext, side: GangWarSide, title: string, body: string, except?: string): void {
  for (const e of side.roster) if (e.playerId && e.playerId !== except) ctx.push.notify(e.playerId, { type: 'gangWar', title, body });
}

async function startWar(ctx: ServerContext, a: { squad: Squad; roster: GangWarEntry[] }, b: { squad: Squad; roster: GangWarEntry[] } | null): Promise<GangWar> {
  const t = ctx.now();
  const { prepEndsAt, endsAt } = gangWarTimes(t, ctx.data);
  const id = ctx.uuid();
  let sideB: GangWarSide;
  if (b) sideB = { squadId: b.squad.id, name: b.squad.name, bot: false, botSeed: 0, roster: b.roster };
  else {
    // Nobody fitted: a generated Gang of the same size and Keeps, labelled as one.
    const seed = Math.floor(ctx.random() * 2 ** 31);
    const names = ctx.data.names;
    const roster = a.roster.map((e, i) => {
      const name = `${names.placeFirst[(seed + i * 7) % names.placeFirst.length]} ${names.playerFirst[(seed >>> 3) % names.playerFirst.length]}`;
      return { index: i, playerId: null, name, keep: e.keep, base: warBase(null, name, e.keep, mixSeed(seed, i), ctx) };
    });
    sideB = { squadId: null, name: `${names.placeFirst[seed % names.placeFirst.length]} ${names.placeSecond[(seed >>> 5) % names.placeSecond.length]} (generated Gang)`, bot: true, botSeed: seed, roster };
  }
  const w: GangWar = { id, createdAt: t, prepEndsAt, endsAt, size: a.roster.length, a: { squadId: a.squad.id, name: a.squad.name, bot: false, botSeed: 0, roster: a.roster }, b: sideB, rated: false };
  await ctx.repo.createWar(w);
  const prepMin = Math.round((prepEndsAt - t) / MIN);
  notifyGang(ctx, w.a, 'Gang War found!', `${a.squad.name} faces ${sideB.name}. ${prepMin} minutes to prepare.`);
  if (!sideB.bot) notifyGang(ctx, sideB, 'Gang War found!', `${sideB.name} faces ${a.squad.name}. ${prepMin} minutes to prepare.`);
  return w;
}

/** A Gang mostly from one Alliance (more than half its members). */
function mainAlliance(alliances: (string | null)[]): string | null {
  const count = new Map<string, number>();
  for (const a of alliances) if (a) count.set(a, (count.get(a) ?? 0) + 1);
  for (const [a, n] of count) if (n * 2 > alliances.length) return a;
  return null;
}

/** POST /v1/squad/war/queue (leader). */
export async function queue(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (member.role !== 'leader') throw new ApiError(403, 'unauthorized', 'Only the Gang leader can start a Gang War.');
  const g = ctx.data.social.gangWar;
  if (await ctx.repo.activeWarOf(squad.id, ctx.now())) throw new ApiError(409, 'conflict', 'Your Gang is already in a war.');
  if (await ctx.repo.queuedGang(squad.id)) return war(ctx, me);
  const roster = await rosterOf(ctx, squad);
  if (roster.length < g.minSize || roster.length > g.maxSize) throw new ApiError(409, 'conflict', `A Gang War needs ${g.minSize}-${g.maxSize} members.`);
  const members = await Promise.all(roster.map((e) => ctx.repo.getPlayer(e.playerId!)));
  const mine: GangQueueEntry = { squadId: squad.id, size: roster.length, rating: ratingOf(ctx, squad).rating, power: roster.reduce((s, e) => s + e.keep, 0), alliances: members.map((p) => p?.groveId ?? null), queuedAt: ctx.now() };
  const recent = new Set((await ctx.repo.warsOf(squad.id, g.recentOpponents)).map((w) => (w.a.squadId === squad.id ? w.b.squadId : w.a.squadId)));
  const myAlliance = mainAlliance(mine.alliances);
  const candidates = (await ctx.repo.gangQueue(mine.size)).filter((e) => e.squadId !== squad.id && !recent.has(e.squadId) && !(myAlliance && mainAlliance(e.alliances) === myAlliance));
  candidates.sort((x, y) => Math.abs(x.rating - mine.rating) - Math.abs(y.rating - mine.rating) || Math.abs(x.power - mine.power) - Math.abs(y.power - mine.power) || x.queuedAt - y.queuedAt);
  for (const c of candidates) {
    // Their recent opponents count too; and take them out of the queue first (two leaders can't both get them).
    const theirRecent = new Set((await ctx.repo.warsOf(c.squadId, g.recentOpponents)).map((w) => (w.a.squadId === c.squadId ? w.b.squadId : w.a.squadId)));
    if (theirRecent.has(squad.id)) continue;
    if (!(await ctx.repo.dequeueGang(c.squadId))) continue;
    const theirs = await ctx.repo.getSquad(c.squadId);
    if (!theirs || (await ctx.repo.activeWarOf(theirs.id, ctx.now()))) continue;
    const theirRoster = await rosterOf(ctx, theirs);
    if (theirRoster.length !== roster.length) continue;
    await startWar(ctx, { squad: theirs, roster: theirRoster }, { squad, roster });
    return war(ctx, me);
  }
  await ctx.repo.enqueueGang(mine);
  return war(ctx, me);
}

/** DELETE /v1/squad/war/queue (leader). */
export async function cancelQueue(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const { squad, member } = await requireSquad(ctx, me);
  if (member.role !== 'leader') throw new ApiError(403, 'unauthorized', 'Only the Gang leader can stop the search.');
  await ctx.repo.dequeueGang(squad.id);
  return war(ctx, me);
}

function baseView(e: GangWarEntry, best: BaseScore, relay: GangRelay | null, now: number): GangWarBaseView {
  return {
    index: e.index,
    name: e.name,
    keep: e.keep,
    base: e.base,
    best,
    relay: relay && relay.strikes > 0 ? { stars: relay.stars, destruction: relay.destruction, strikes: relay.strikes, lastBy: relay.lastBy, busy: Boolean(relay.holder) && relay.holdUntil > now } : relay && relay.holder && relay.holdUntil > now ? { stars: 0, destruction: 0, strikes: 0, lastBy: null, busy: true } : null,
  };
}

async function warView(ctx: ServerContext, me: Player, w: GangWar, side: 'a' | 'b'): Promise<GangWarView> {
  const t = ctx.now();
  const phase = gangWarPhase(t, w);
  const attacks = await ctx.repo.warAttacks(w.id);
  const ours = await bestOn(ctx, w, side, Math.min(t, w.endsAt), attacks);
  const theirs = await bestOn(ctx, w, other(side), Math.min(t, w.endsAt), attacks);
  const myIndex = w[side].roster.find((e) => e.playerId === me.id)?.index ?? null;
  const used = attacks.filter((a) => a.attackerId === me.id).length;
  const enemy: GangWarBaseView[] = [];
  for (const e of w[other(side)].roster) enemy.push(baseView(e, ours[e.index], await ctx.repo.getRelay(w.id, side, e.index), t));
  const mine: GangWarBaseView[] = [];
  for (const e of w[side].roster) mine.push(baseView(e, theirs[e.index], w[other(side)].bot ? null : await ctx.repo.getRelay(w.id, other(side), e.index), t));
  const total = { ours: sideTotal(ours), theirs: sideTotal(theirs) };
  return {
    id: w.id,
    phase,
    prepEndsAt: w.prepEndsAt,
    endsAt: w.endsAt,
    size: w.size,
    opponent: { name: w[other(side)].name, bot: w[other(side)].bot },
    ours: total.ours,
    theirs: total.theirs,
    mine,
    enemy,
    attacksLeft: phase === 'battle' && myIndex !== null ? Math.max(0, ctx.data.social.gangWar.attacksPerMember - used) : 0,
    myIndex,
    outcome: phase === 'ended' ? gangWarOutcome(total.ours, total.theirs) : null,
    claimed: phase === 'ended' && (await ctx.repo.gangClaimed(w.id, me.id)),
    log: attacks
      .slice()
      .sort((x, y) => y.at - x.at)
      .slice(0, 30)
      .map((a) => ({
        at: a.at,
        by: w[a.side].roster.find((e) => e.playerId === a.attackerId)?.name ?? 'A former member',
        ours: a.side === side,
        target: w[other(a.side)].roster.find((e) => e.index === a.target)?.name ?? `Base ${a.target + 1}`,
        stars: a.stars,
        destruction: a.destruction,
        relay: a.relay,
      })),
  };
}

/** GET /v1/squad/war */
export async function war(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const { squad } = await requireSquad(ctx, me);
  const t = ctx.now();
  const g = ctx.data.social.gangWar;
  let active = await ctx.repo.activeWarOf(squad.id, t);
  let queued: GangWarResponse['queued'] = null;
  if (!active) {
    const q = await ctx.repo.queuedGang(squad.id);
    if (q) {
      const botAt = q.queuedAt + g.botAfterMinutes * MIN;
      if (t >= botAt && (await ctx.repo.dequeueGang(squad.id))) active = await startWar(ctx, { squad, roster: await rosterOf(ctx, squad) }, null);
      else queued = { since: q.queuedAt, botAt };
    }
  }
  const recentWars = await ctx.repo.warsOf(squad.id, 6);
  const recent: GangWarResponse['recent'] = [];
  for (const w of recentWars) {
    if (w.endsAt > t) continue;
    await rateIfEnded(ctx, w);
    const side = sideOf(w, squad.id)!;
    if (!w[side].roster.some((e) => e.playerId === me.id)) continue;
    const { ours, theirs } = await totals(ctx, w, side, w.endsAt);
    const o = sideTotal(ours);
    const th = sideTotal(theirs);
    recent.push({ id: w.id, opponent: w[other(side)].name, bot: w[other(side)].bot, outcome: gangWarOutcome(o, th), ours: o.stars, theirs: th.stars, endsAt: w.endsAt, claimed: await ctx.repo.gangClaimed(w.id, me.id) });
  }
  return { war: active ? await warView(ctx, me, active, sideOf(active, squad.id)!) : null, queued, recent };
}

async function myWar(ctx: ServerContext, me: Player): Promise<{ w: GangWar; side: 'a' | 'b'; entry: GangWarEntry | undefined }> {
  const { squad } = await requireSquad(ctx, me);
  const w = await ctx.repo.activeWarOf(squad.id, ctx.now());
  if (!w) throw new ApiError(404, 'not_found', 'Your Gang is not in a war.');
  const side = sideOf(w, squad.id)!;
  return { w, side, entry: w[side].roster.find((e) => e.playerId === me.id) };
}

/** POST /v1/squad/war/base: during prep, copy my village into the war again. */
export async function refreshBase(ctx: ServerContext, me: Player): Promise<GangWarResponse> {
  const { w, side, entry } = await myWar(ctx, me);
  if (gangWarPhase(ctx.now(), w) !== 'prep') throw new ApiError(409, 'conflict', 'War bases can only change during prep.');
  if (!entry) throw new ApiError(404, 'not_found', 'You joined after this war started.');
  const fresh = await ctx.repo.getPlayer(me.id);
  const roster = w[side].roster.map((e) => (e.index === entry.index ? { ...e, keep: fresh?.hallLevel ?? e.keep, base: warBase(fresh?.base ?? e.base, me.name, fresh?.hallLevel ?? e.keep, 0, ctx) } : e));
  await ctx.repo.updateWar(w.id, { [side]: { ...w[side], roster } } as Partial<Pick<GangWar, 'a' | 'b'>>);
  return war(ctx, me);
}

/** POST /v1/squad/war/ticket { target, relay } */
export async function warTicket(ctx: ServerContext, me: Player, req: GangWarTicketRequest | undefined, client?: ClientInfo): Promise<GangWarTicketResponse> {
  const engine = engineForClient(ctx, client);
  const { w, side, entry } = await myWar(ctx, me);
  const t = ctx.now();
  if (gangWarPhase(t, w) !== 'battle') throw new ApiError(409, 'raid_not_live', 'The battle day has not started yet.');
  if (!entry) throw new ApiError(404, 'not_found', 'You joined your Gang after this war started.');
  // Re-audit: a ticket is the attack. One that is never reported (a loss hidden by not sending it)
  // still uses the attack, so unreported tickets count until the war ends.
  const reported = (await ctx.repo.warAttacks(w.id)).filter((a) => a.attackerId === me.id).length;
  const unreported = (await ctx.repo.openTickets(me.id, 'war')).filter((x) => x.warId === w.id).length;
  if (reported + unreported >= ctx.data.social.gangWar.attacksPerMember) throw new ApiError(409, 'no_attacks_left', 'You have used your Gang War attacks (an attack counts from the moment it is begun).');
  const target = Math.floor(Number(req?.target));
  const enemy = w[other(side)].roster.find((e) => e.index === target);
  if (!enemy) throw new ApiError(404, 'not_found', 'No such enemy base.');
  const relay = req?.relay === true;
  const rules = ctx.rules.ticketRules(engine, client);
  let startDamage: Record<string, number> | undefined;
  if (relay) {
    if (rules < 3) throw new ApiError(426, 'version_mismatch', 'Relay strikes need the latest Kagemura. Update the game, or make a solo strike.');
    // One relay striker at a time on a base; the hold lasts as long as the ticket.
    if (!(await ctx.repo.holdRelay(w.id, side, target, me.id, t + TICKET_TTL_MS, t))) throw new ApiError(409, 'conflict', 'A Gang mate is striking this base in the relay right now. Try again when they finish.');
    const r = await ctx.repo.getRelay(w.id, side, target);
    startDamage = r?.damage ?? {};
  }
  const ticket: Ticket = { id: ctx.uuid(), kind: 'war', attackerId: me.id, defenderId: enemy.playerId, defenderName: enemy.name, base: enemy.base, defenderTrophies: 0, createdAt: t, expiresAt: Math.min(t + TICKET_TTL_MS, w.endsAt + 10 * MIN), used: false, seed: ctx.newSeed(), rules, dataVersion: engine.dataVersion, warId: w.id, target, relay, ...(startDamage ? { startDamage } : {}) };
  await ctx.repo.createTicket(ticket);
  return { ticket: ticket.id, seed: ticket.seed!, base: enemy.base, ...(startDamage ? { startDamage } : {}), expiresAt: ticket.expiresAt };
}

/** POST /v1/squad/war/attacks */
export async function warAttack(ctx: ServerContext, me: Player, sub: BattleSubmission): Promise<GangWarAttackResponse> {
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'war');
  if (answered) return answered as GangWarAttackResponse;
  const w = ticket.warId ? await ctx.repo.getWar(ticket.warId) : null;
  if (!w) throw new ApiError(404, 'not_found', 'That war is gone.');
  const member = await ctx.repo.squadOf(me.id);
  const side = member ? sideOf(w, member.squadId) : null;
  if (!side) throw new ApiError(404, 'not_found', 'You are not in this war.');
  const engine = engineForTicket(ctx, ticket, sub);
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements } = checkArmy(sub, me, engine.data);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}), ...(ticket.relay && ticket.startDamage ? { startDamage: ticket.startDamage } : {}) };
  await requireArmyOnServer(ctx, me, army);
  const out = await resimulate(ctx, 'war', setup, deployments, sub, engine).catch(async (e) => {
    await burnAfterFailures(ctx, ticket, e);
    throw e;
  });
  const { result } = out;
  const t = Math.min(ctx.now(), w.endsAt - 1);
  const target = ticket.target!;
  const response = await ctx.repo.transaction(async (tx) => {
    const used = (await tx.warAttacks(w.id)).filter((a) => a.attackerId === me.id).length;
    if (used >= ctx.data.social.gangWar.attacksPerMember) throw new ApiError(409, 'no_attacks_left', 'You have used your Gang War attacks.');
    await tx.addWarAttack({ id: ctx.uuid(), warId: w.id, side, attackerId: me.id, target, relay: Boolean(ticket.relay), stars: result.stars, destruction: result.destruction, at: t });
    if (ticket.relay) {
      const prev = await tx.getRelay(w.id, side, target);
      await tx.putRelay({ warId: w.id, side, target, damage: carryRelayDamage(out.damage, ctx.data), stars: result.stars, destruction: result.destruction, strikes: (prev?.strikes ?? 0) + 1, lastBy: me.name, holder: null, holdUntil: 0 });
    }
    // A village the server keeps spends the warriors who fought (as in an Alliance War).
    const spent = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'remoteGroveBattleEnd', target, record: { at: ctx.now(), opponentName: ticket.defenderName, setup, deployments, endTick: sub.endTick }, known: result }, reason: 'gangwar:troops' }], ticket.id);
    if (spent && !spent.ok) throw new ApiError(400, 'bad_request', `Your village on the server says: ${spent.message}`);
    const after = await tx.warAttacks(w.id);
    const ours = sideTotal(await bestOn(ctx, w, side, ctx.now(), after));
    const theirs = sideTotal(await bestOn(ctx, w, other(side), ctx.now(), after));
    const res: GangWarAttackResponse = { result, ours, theirs };
    if (!(await tx.useTicket(ticket.id, res))) throw new ApiError(409, 'conflict', 'This battle was already reported.');
    return res;
  });
  // Step 68: the next relay striker, and the defenders, hear about it.
  if (ticket.relay) notifyGang(ctx, w[side], 'Your turn in the relay', `${me.name} struck ${ticket.defenderName}: ${result.stars}★ ${Math.round(result.destruction)}%. Finish the base off from where they left it.`, me.id);
  const defending = w[other(side)];
  if (!defending.bot) {
    const victim = defending.roster.find((e) => e.index === target);
    if (victim?.playerId) ctx.push.notify(victim.playerId, { type: 'gangWar', title: 'Your Gang is under attack', body: `${me.name} hit your war base: ${result.stars}★ ${Math.round(result.destruction)}%.` });
  }
  return response;
}

/**
 * Every few minutes (server/main.ts, step 68): tell members when the battle
 * day begins, and when 2 hours are left (only those with attacks left). Each
 * once per war; players choose the type in Settings (gangWar).
 */
export async function gangWarReminders(ctx: ServerContext): Promise<number> {
  const t = ctx.now();
  let sent = 0;
  for (const w of await ctx.repo.activeWars(t, 500)) {
    const notified = { ...(w.notified ?? {}) };
    const attacks = await ctx.repo.warAttacks(w.id);
    const left = (id: string) => ctx.data.social.gangWar.attacksPerMember - attacks.filter((a) => a.attackerId === id).length;
    if (!notified.battle && t >= w.prepEndsAt) {
      notified.battle = true;
      for (const side of [w.a, w.b]) if (!side.bot) notifyGang(ctx, side, 'The Gang War battle day has begun', `Attack ${(side === w.a ? w.b : w.a).name}: ${ctx.data.social.gangWar.attacksPerMember} attacks each. Relay strikes start from half your Gang's damage.`);
      sent++;
    }
    if (!notified.ending && t >= w.endsAt - 2 * 3_600_000) {
      notified.ending = true;
      for (const side of [w.a, w.b]) {
        if (side.bot) continue;
        for (const e of side.roster) if (e.playerId && left(e.playerId) > 0) ctx.push.notify(e.playerId, { type: 'gangWar', title: '2 hours left in the Gang War', body: `You still have ${left(e.playerId)} attack${left(e.playerId) === 1 ? '' : 's'}.` });
      }
      sent++;
    }
    if (notified.battle !== w.notified?.battle || notified.ending !== w.notified?.ending) await ctx.repo.updateWar(w.id, { notified });
  }
  return sent;
}

/** POST /v1/squad/war/claim { warId }: once the war has ended, each member's chest, once. */
export async function claim(ctx: ServerContext, me: Player, warId: unknown): Promise<GangWarClaimResponse> {
  const w = await ctx.repo.getWar(String(warId ?? ''));
  if (!w) throw new ApiError(404, 'not_found', 'No such Gang War.');
  const side = w.a.roster.some((e) => e.playerId === me.id) ? 'a' : w.b.roster.some((e) => e.playerId === me.id) ? 'b' : null;
  if (!side) throw new ApiError(404, 'not_found', 'You did not take part in that Gang War.');
  if (ctx.now() < w.endsAt) throw new ApiError(409, 'raid_not_ended', 'That Gang War has not ended yet.');
  await rateIfEnded(ctx, w);
  const { ours, theirs } = await totals(ctx, w, side, w.endsAt);
  const outcome = gangWarOutcome(sideTotal(ours), sideTotal(theirs));
  const generated = w[other(side)].bot;
  const fresh = await ctx.repo.transaction(async (tx) => {
    const first = await tx.addGangClaim(w.id, me.id, outcome, ctx.now());
    // A village the server keeps gets the chest with the claim (once). Ledger audit E13: no Jade
    // from a war against a generated Gang (the game applies the same command with `generated`).
    if (first) await applyServerResult(tx, ctx, me, [{ cmd: { type: 'claimGangChest', warId: w.id, outcome, generated }, reason: 'gangwar:chest' }], `gangwar:${w.id}`);
    return first;
  });
  return { warId: w.id, outcome, alreadyClaimed: !fresh, generated };
}

