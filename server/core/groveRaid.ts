/**
 * Weekly Grove Raids between real Groves (or against a server-generated bot
 * Grove when no rival is free). Same schedule, attack allowance, star scoring
 * and chests as the game's offline Grove Raid (src/sim/social/groveRaid.ts).
 */
import { createRng, int, mixSeed, next } from '../../src/gameplay/sim/rng';
import { enemyGrove, raidPhase, raidWindow } from '../../src/gameplay/sim/social/groveRaid';
import type { RaidAttackResponse, RaidClaimResponse, RaidTicketResponse, RaidView, BattleSubmission } from '../../src/backend/net/protocol';
import type { GroveSummaryRow, Player, RaidPairing, RosterEntry } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';
import { requireGrove } from './groves';
import { battleSeed, checkArmy, resimulate, takeTicket, TICKET_TTL_MS } from './pvp';
import { applyServerResult } from './village';

const ACTIVE_WINDOW_MS = 3 * 24 * HOUR;

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * Bases of a Grove's members (the roster the other side attacks), strongest
 * first (Keep, then honor, then id, so the order is stable). `size` keeps only
 * that many, for equal-sized war rosters.
 */
async function rosterOf(ctx: ServerContext, groveId: string, size = Infinity): Promise<RosterEntry[]> {
  const players: Player[] = [];
  for (const m of await ctx.repo.members(groveId)) {
    const p = await ctx.repo.getPlayer(m.playerId);
    if (p?.base) players.push(p);
  }
  players.sort((a, b) => b.hallLevel - a.hallLevel || b.trophies - a.trophies || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return players.slice(0, size).map((p, index) => {
    const base = structuredClone(p.base!);
    for (const b of base.buildings) b.loot = {};
    return { index, name: p.name, hallLevel: p.hallLevel, trophies: p.trophies, base: { ...base, name: p.name }, playerId: p.id };
  });
}

/** Attacks a side may make in a war: its roster size times the per-member allowance (equal for both sides). */
function sideAttackCap(p: RaidPairing, ctx: ServerContext): number {
  return Math.max(1, p.roster.length) * ctx.data.social.groveRaid.attacksPerMember;
}

async function sideInfo(ctx: ServerContext, groveId: string): Promise<{ size: number; hall: number }> {
  const members = await ctx.repo.members(groveId);
  let halls = 0;
  for (const m of members) halls += (await ctx.repo.getPlayer(m.playerId))?.hallLevel ?? 1;
  return { size: Math.max(1, members.length), hall: Math.max(1, Math.round(halls / Math.max(1, members.length))) };
}

/** Pair a Grove for the week: the closest active unpaired Grove, or a bot Grove. */
async function ensurePairing(ctx: ServerContext, groveId: string, week: number): Promise<RaidPairing> {
  const existing = await ctx.repo.getPairing(week, groveId);
  if (existing) return existing;
  const t = ctx.now();
  const me = (await ctx.repo.listGroves('', 1000)).find((g) => g.id === groveId);
  const mine = await sideInfo(ctx, groveId);
  const candidates = (await ctx.repo.unpairedGroves(week, t - ACTIVE_WINDOW_MS, 200)).filter((g) => g.id !== groveId && Math.abs(g.members - mine.size) <= 5);
  const avg = me?.averageTrophies ?? 0;
  candidates.sort((a: GroveSummaryRow, b: GroveSummaryRow) => Math.abs(a.averageTrophies - avg) - Math.abs(b.averageTrophies - avg));
  for (const rival of candidates.slice(0, 5)) {
    const theirs = await sideInfo(ctx, rival.id);
    // Equal rosters: both sides field the same number of bases (their strongest
    // members with a base), so both can win the same number of stars, and each
    // side's attacks are capped at that size times the per-member allowance.
    const size = Math.min((await rosterOf(ctx, groveId)).length, (await rosterOf(ctx, rival.id)).length);
    if (!size) continue;
    const ourRoster = await rosterOf(ctx, groveId, size);
    const theirRoster = await rosterOf(ctx, rival.id, size);
    const ourName = me?.name ?? 'Alliance';
    const ok = await ctx.repo.createPairings([
      { week, groveId, opponentGroveId: rival.id, opponentName: rival.name, botSeed: 0, roster: theirRoster, ourSize: size, ourHall: mine.hall, createdAt: t },
      { week, groveId: rival.id, opponentGroveId: groveId, opponentName: ourName, botSeed: 0, roster: ourRoster, ourSize: size, ourHall: theirs.hall, createdAt: t },
    ]);
    if (ok) return (await ctx.repo.getPairing(week, groveId))!;
  }
  // No rival free: a bot Grove generated from this Grove's id, sized to match.
  const seed = mixSeed(hashString(groveId), week);
  const enemy = enemyGrove(seed, week, mine.hall, ctx.data);
  const count = Math.max(1, mine.size);
  const roster: RosterEntry[] = enemy.bases.slice(0, Math.max(count, 1)).map((b, i) => ({ index: i, name: enemy.members[i] ?? b.name, hallLevel: b.hallLevel, trophies: b.trophies ?? 0, base: b, playerId: null }));
  await ctx.repo.createPairings([{ week, groveId, opponentGroveId: null, opponentName: enemy.name, botSeed: seed, roster, ourSize: count, ourHall: mine.hall, createdAt: t }]);
  return (await ctx.repo.getPairing(week, groveId))!;
}

/** Stars the bot Grove has taken from our side by time `t` (deterministic). */
function botStars(p: RaidPairing, t: number, ctx: ServerContext): number[] {
  const { start, end } = raidWindow(p.week, ctx.data);
  const odds = ctx.data.social.groveRaid.starOdds;
  const rng = createRng(mixSeed(p.botSeed, 0xb07));
  const best = new Array(p.ourSize).fill(0);
  const attacks = p.roster.length * ctx.data.social.groveRaid.attacksPerMember;
  for (let i = 0; i < attacks; i++) {
    const at = start + Math.floor(next(rng) * (end - start));
    const target = int(rng, 0, p.ourSize - 1);
    const attackerHall = p.roster[i % p.roster.length]?.hallLevel ?? p.ourHall;
    const p3 = Math.max(0.02, Math.min(0.9, odds.base3 + (attackerHall - p.ourHall) * odds.perHallDiff));
    const r = next(rng);
    const stars = r < p3 ? 3 : r < p3 + odds.base2 ? 2 : r < p3 + odds.base2 + odds.base1 ? 1 : 0;
    if (at <= t) best[target] = Math.max(best[target], stars);
  }
  return best;
}

/** Best stars (and, among equal stars, best destruction) on each base of a roster. */
function bestPerBase(attacks: { target: number; stars: number; destruction: number; at: number }[], size: number, t: number): { stars: number[]; destruction: number[] } {
  const stars = new Array(size).fill(0);
  const destruction = new Array(size).fill(0);
  for (const a of attacks) {
    if (a.at > t || a.target >= size) continue;
    if (a.stars > stars[a.target] || (a.stars === stars[a.target] && a.destruction > destruction[a.target])) {
      stars[a.target] = a.stars;
      destruction[a.target] = a.destruction;
    }
  }
  return { stars, destruction };
}

async function scores(ctx: ServerContext, p: RaidPairing, t: number): Promise<{ ours: number; theirs: number; enemyBaseStars: number[]; ourDestruction?: number; theirDestruction?: number }> {
  const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  const mine = bestPerBase(await ctx.repo.raidAttacks(p.week, p.groveId), p.roster.length, t);
  if (p.opponentGroveId) {
    const theirPairing = await ctx.repo.getPairing(p.week, p.opponentGroveId);
    const theirs = bestPerBase(await ctx.repo.raidAttacks(p.week, p.opponentGroveId), theirPairing?.roster.length ?? 0, t);
    // Destruction breaks a tie in stars (both sides have the same number of bases, so the totals compare fairly).
    return { ours: sum(mine.stars), theirs: sum(theirs.stars), enemyBaseStars: mine.stars, ourDestruction: sum(mine.destruction), theirDestruction: sum(theirs.destruction) };
  }
  return { ours: sum(mine.stars), theirs: sum(botStars(p, t, ctx)), enemyBaseStars: mine.stars };
}

/**
 * Only members who were in the Grove when the raid started take part (attacks
 * and the chest). So nobody can hop to a second Grove for extra attacks, or
 * into a winning Grove just before the end for its chest.
 */
function eligible(joinedAt: number, week: number, ctx: ServerContext): boolean {
  return joinedAt <= raidWindow(week, ctx.data).start;
}

/** Stars decide; equal stars are broken by total destruction when both sides are real Alliances. */
function outcomeOf(s: { ours: number; theirs: number; ourDestruction?: number; theirDestruction?: number }): 'win' | 'draw' | 'loss' {
  if (s.ours !== s.theirs) return s.ours > s.theirs ? 'win' : 'loss';
  const a = s.ourDestruction ?? 0;
  const b = s.theirDestruction ?? 0;
  return a > b ? 'win' : a < b ? 'loss' : 'draw';
}

export async function raid(ctx: ServerContext, me: Player): Promise<RaidView> {
  const { grove, joinedAt } = await requireGrove(ctx, me);
  const t = ctx.now();
  const ph = raidPhase(t, ctx.data);
  const per = ctx.data.social.groveRaid.attacksPerMember;
  const ok = eligible(joinedAt, ph.week, ctx);
  const chests: RaidView['chests'] = [];
  for (const w of [ph.week - 1, ph.week]) {
    if (w < 0 || raidWindow(w, ctx.data).end > t) continue;
    const claim = await ctx.repo.getClaim(w, me.id);
    if (claim) chests.push({ week: w, claimed: true });
    else if (eligible(joinedAt, w, ctx) && (await ctx.repo.getPairing(w, grove.id))) chests.push({ week: w, claimed: false });
  }
  const base: RaidView = { phase: ph.phase, week: ph.week, start: ph.start, end: ph.end, nextStart: ph.nextStart, eligible: ok, opponent: null, ours: 0, theirs: 0, enemyBaseStars: [], attacksLeft: 0, result: null, claimed: false, chests };
  const pairing = ph.phase === 'live' ? await ensurePairing(ctx, grove.id, ph.week) : await ctx.repo.getPairing(ph.week, grove.id);
  if (!pairing) return base;
  const s = await scores(ctx, pairing, ph.phase === 'ended' ? ph.end : t);
  const sideAttacks = await ctx.repo.raidAttacks(ph.week, grove.id);
  const mine = sideAttacks.filter((a) => a.attackerId === me.id).length;
  const sideLeft = Math.max(0, sideAttackCap(pairing, ctx) - sideAttacks.length);
  const claim = await ctx.repo.getClaim(ph.week, me.id);
  return {
    ...base,
    opponent: { name: pairing.opponentName, kind: pairing.opponentGroveId ? 'grove' : 'bot', members: pairing.roster.map((r) => ({ index: r.index, name: r.name, hallLevel: r.hallLevel, trophies: r.trophies })) },
    ours: s.ours,
    theirs: s.theirs,
    enemyBaseStars: s.enemyBaseStars,
    attacksLeft: ph.phase === 'live' && ok ? Math.min(sideLeft, Math.max(0, per - mine)) : 0,
    result: ph.phase === 'ended' ? { outcome: outcomeOf(s), ours: s.ours, theirs: s.theirs } : null,
    claimed: Boolean(claim),
  };
}

export async function raidTicket(ctx: ServerContext, me: Player, target: unknown): Promise<RaidTicketResponse> {
  const { grove, joinedAt } = await requireGrove(ctx, me);
  const t = ctx.now();
  const ph = raidPhase(t, ctx.data);
  if (ph.phase !== 'live') throw new ApiError(409, 'raid_not_live', 'The Alliance War is not running.');
  if (!eligible(joinedAt, ph.week, ctx)) throw new ApiError(409, 'no_attacks_left', 'You joined during this Alliance War; you can take part from next week.');
  const pairing = await ensurePairing(ctx, grove.id, ph.week);
  const sideAttacks = await ctx.repo.raidAttacks(ph.week, grove.id);
  const used = sideAttacks.filter((a) => a.attackerId === me.id).length;
  if (used >= ctx.data.social.groveRaid.attacksPerMember) throw new ApiError(409, 'no_attacks_left', 'You have used your Alliance War attacks.');
  if (sideAttacks.length >= sideAttackCap(pairing, ctx)) throw new ApiError(409, 'no_attacks_left', 'Your Alliance has used all of its war attacks (both sides get the same number).');
  const idx = Math.floor(Number(target));
  const entry = pairing.roster[idx];
  if (!entry) throw new ApiError(404, 'not_found', 'No such enemy base.');
  const expiresAt = Math.min(t + TICKET_TTL_MS, ph.end + 10 * 60_000);
  const ticket = { id: ctx.uuid(), kind: 'raid' as const, attackerId: me.id, defenderId: entry.playerId, defenderName: entry.name, base: entry.base, defenderTrophies: entry.trophies, createdAt: t, expiresAt, used: false, week: ph.week, groveId: grove.id, target: idx, seed: ctx.newSeed() };
  await ctx.repo.createTicket(ticket);
  return { ticket: ticket.id, seed: ticket.seed, base: entry.base, expiresAt };
}

export async function raidAttack(ctx: ServerContext, me: Player, sub: BattleSubmission): Promise<RaidAttackResponse> {
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'raid');
  const week = ticket.week!;
  if (answered) {
    // A retried report: the same result, with the current score.
    const a = answered as { result: RaidAttackResponse['result'] };
    const s = await scores(ctx, (await ctx.repo.getPairing(week, ticket.groveId!))!, ctx.now());
    return { result: a.result, stars: a.result.stars, ours: s.ours, theirs: s.theirs };
  }
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements } = checkArmy(sub, me, ctx.data);
  const pairing = (await ctx.repo.getPairing(week, ticket.groveId!))!;
  const sideAttacks = await ctx.repo.raidAttacks(week, ticket.groveId!);
  const used = sideAttacks.filter((a) => a.attackerId === me.id).length;
  if (used >= ctx.data.social.groveRaid.attacksPerMember || sideAttacks.length >= sideAttackCap(pairing, ctx)) throw new ApiError(409, 'no_attacks_left', 'You have used your Alliance War attacks.');
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}) };
  const { result } = resimulate(ctx, 'raid', setup, deployments, sub);
  const t = Math.min(ctx.now(), raidWindow(week, ctx.data).end - 1);
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.useTicket(ticket.id, { result }))) throw new ApiError(409, 'conflict', 'This battle was already reported.');
    // A village the server keeps spends the warriors who fought (roadmap step 22).
    const spent = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'remoteGroveBattleEnd', target: ticket.target!, record: { at: ctx.now(), opponentName: ticket.defenderName, setup, deployments, endTick: sub.endTick }, known: result }, reason: 'war:troops' }], ticket.id);
    if (spent && !spent.ok) throw new ApiError(400, 'bad_request', `Your village on the server says: ${spent.message}`);
    await tx.addRaidAttack({ id: ctx.uuid(), week, groveId: ticket.groveId!, attackerId: me.id, target: ticket.target!, stars: result.stars, destruction: result.destruction, at: t });
  });
  const s = await scores(ctx, pairing, ctx.now());
  return { result, stars: result.stars, ours: s.ours, theirs: s.theirs };
}

export async function claimRaid(ctx: ServerContext, me: Player, week: unknown): Promise<RaidClaimResponse> {
  const w = Math.floor(Number(week));
  if (!Number.isFinite(w)) throw new ApiError(400, 'bad_request', 'week must be a number');
  const { end } = raidWindow(w, ctx.data);
  const existing = await ctx.repo.getClaim(w, me.id);
  if (existing) {
    // Safe to retry, even after leaving the Grove.
    const p = await ctx.repo.getPairing(w, existing.groveId);
    const s = p ? await scores(ctx, p, end) : { ours: 0, theirs: 0 };
    return { week: w, outcome: existing.outcome, ours: s.ours, theirs: s.theirs, alreadyClaimed: true };
  }
  const { grove, joinedAt } = await requireGrove(ctx, me);
  if (ctx.now() < end) throw new ApiError(409, 'raid_not_ended', 'That Alliance War has not ended yet.');
  if (!eligible(joinedAt, w, ctx)) throw new ApiError(404, 'not_found', 'You joined your Alliance after that Alliance War started.');
  const pairing = await ctx.repo.getPairing(w, grove.id);
  if (!pairing) throw new ApiError(404, 'not_found', 'Your Alliance did not take part in that Alliance War.');
  const s = await scores(ctx, pairing, end);
  const outcome = outcomeOf(s);
  const fresh = await ctx.repo.transaction(async (tx) => {
    const first = await tx.addClaim({ week: w, playerId: me.id, groveId: grove.id, outcome, at: ctx.now() });
    // A village the server keeps gets the chest with the claim (once: only the first claim).
    if (first) await applyServerResult(tx, ctx, me, [{ cmd: { type: 'claimRaidChest', week: w, outcome, ours: s.ours, theirs: s.theirs }, reason: 'war:chest' }], `week:${w}`);
    return first;
  });
  return { week: w, outcome, ours: s.ours, theirs: s.theirs, alreadyClaimed: !fresh };
}
