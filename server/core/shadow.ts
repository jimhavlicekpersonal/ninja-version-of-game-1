/**
 * Shadow Clans on the server (protocol 4), using the game's own rules from
 * src/gameplay/sim/world:
 * - One opponent-selection system: real players eligible by the five rules,
 *   offered in the share the population transition and defender capacity
 *   allow; AI clan villages (rebuilt here from clan + seed + strength) fill
 *   the rest. Every match is a ticket, and every attack is re-simulated.
 * - Shadow Rank: Elo from real-player battles only. Generated villages never
 *   change it. Four-week seasons pull ratings halfway back.
 * - Regional world instances, AI faction membership and human leadership,
 *   normalized tournaments, and the matchmaking-liquidity metrics.
 */
import type { BaseLayout, BattleResult } from '../../src/gameplay/sim/battle/types';
import { runBattle } from '../../src/gameplay/sim/battle/battle';
import { applyLootPenalty, hallWindow } from '../../src/gameplay/sim/matchmaking';
import {
  battleScore,
  defenderEligibility,
  expectedScore,
  factionLeader,
  humanShare,
  humanSlots,
  pvpEnabled,
  rateBattle,
  seasonReset,
  shadowSeason,
  type FactionMember,
} from '../../src/gameplay/sim/world/competition';
import { draftProblem, tournamentAt, tournamentBases, tournamentLevels, tournamentScore } from '../../src/gameplay/sim/world/tournament';
import { clanVillage } from '../../src/gameplay/sim/world/villagegen';
import { combatRating, defensePower, matchupFromDefense, maxOffenseAtHall } from '../../src/gameplay/sim/world/power';
import { isSettlementId } from '../../src/gameplay/sim/world/territory';
import { warWeek } from '../../src/gameplay/sim/world/factions';
import { raidPhase } from '../../src/gameplay/sim/social/groveRaid';
import type {
  AllianceBoardEntry,
  AllianceBoardResponse,
  CandidatesResponse,
  ClaimResponse,
  MatchRequest,
  MatchResponse,
  MetricsResponse,
  PlayerView,
  ShadowRankView,
  TournamentResponse,
  TournamentScoreResponse,
  TournamentSubmission,
  WorldResponse,
} from '../../src/backend/net/protocol';
import type { EligibilityRules, Player, PlayerPatch, Region, Ticket } from '../repo';
import { ApiError, HOUR, TICKET_LOCK_MS as LOCK_MS, TICKET_TTL_MS as TTL_MS, type ServerContext } from './context';
import { capBaseLoot, checkArmy } from './pvp';

const DAY = 24 * HOUR;


// ---------------------------------------------------------------- ratings

export function shadowOf(p: Player, ctx: ServerContext): ShadowRankView {
  const start = ctx.data.competition.shadowRank.start;
  return { rating: p.rating ?? start, defense: p.defenseRating ?? start, games: p.ratedGames ?? 0, season: p.ratingSeason ?? -1 };
}

/** Close the player's finished Shadow Rank season, if any: remember it and reset partway. */
export async function rollSeason(ctx: ServerContext, p: Player): Promise<Player> {
  const current = shadowSeason(ctx.now(), ctx.data);
  const r = shadowOf(p, ctx);
  if (r.season === current) return p;
  const patch: PlayerPatch = { ratingSeason: current };
  if (r.games > 0 && r.season >= 0) {
    patch.lastSeason = { season: r.season, rating: r.rating };
    patch.rating = seasonReset(r.rating, ctx.data);
    patch.defenseRating = seasonReset(r.defense, ctx.data);
  }
  await ctx.repo.updatePlayer(p.id, patch);
  return { ...p, ...patch };
}

/**
 * Rate a battle between two real players (never call it for generated
 * villages). Returns the attacker's change, and the expected and actual
 * scores (kept on the attack for the fairness metric).
 */
export async function rateAttack(ctx: ServerContext, attacker: Player, defender: Player, result: BattleResult): Promise<{ delta: number; expected: number; score: number }> {
  const a = await rollSeason(ctx, attacker);
  const d = await rollSeason(ctx, defender);
  const ra = shadowOf(a, ctx);
  const rd = shadowOf(d, ctx);
  const delta = rateBattle({ rating: ra.rating, games: ra.games }, { rating: rd.defense, games: rd.games }, result.stars, result.destruction, ctx.data);
  await ctx.repo.updatePlayer(a.id, { rating: ra.rating + delta.attacker, ratedGames: ra.games + 1 });
  await ctx.repo.updatePlayer(d.id, { defenseRating: rd.defense + delta.defender, ratedGames: rd.games + 1 });
  return { delta: delta.attacker, expected: expectedScore(ra.rating, rd.defense, ctx.data.competition.shadowRank.eloScale), score: battleScore(result.stars, result.destruction, ctx.data) };
}

/**
 * The hidden combat rating P = 0.35 D + 0.30 O + 0.20 H + 0.15 S, from the
 * uploaded village (D, H), the army power the client reports (O, capped at a
 * full army at the top Keep) and the player's recent real attacks (S).
 */
export async function storedCombatRating(ctx: ServerContext, me: Player, base: BaseLayout, offense: unknown): Promise<number> {
  const data = ctx.data;
  const top = data.hall.levels.length;
  const off = Math.max(0, Math.min(maxOffenseAtHall(top, data), Number(offense) || 0));
  const stars = await ctx.repo.recentStars(me.id, data.competition.rating.recentBattles);
  const skill = stars.length ? stars.reduce((a, b) => a + b, 0) / (3 * stars.length) : data.competition.rating.defaultSkill;
  return combatRating({ defense: defensePower(base, data), offense: off, hall: base.hallLevel, skill }, data);
}

/** The player as the client sees it, with protocol-4 fields. */
export async function meView(ctx: ServerContext, me: Player): Promise<PlayerView> {
  const p = await rollSeason(ctx, me);
  const r = shadowOf(p, ctx);
  return {
    id: p.id,
    name: p.name,
    trophies: p.trophies,
    hallLevel: p.hallLevel,
    shieldUntil: p.shieldUntil,
    groveId: p.groveId,
    pvpOptIn: Boolean(p.pvpOptIn),
    shadowRank: r.games > 0 ? r : null,
    lastSeason: p.lastSeason ?? null,
    region: p.regionId ?? null,
    faction: p.faction ?? null,
  };
}

// ---------------------------------------------------------------- regions

/** The newest region with room, or a new one when it is full. */
export async function assignRegion(ctx: ServerContext): Promise<Region> {
  const cap = ctx.data.competition.regions.capacity;
  const latest = await ctx.repo.latestRegion();
  if (latest && (await ctx.repo.regionPlayers(latest.id)) < cap) return latest;
  const seed = Math.floor(ctx.random() * 4294967296) >>> 0;
  const n = ctx.data.names;
  const region: Region = { id: ctx.uuid(), name: `${n.placeFirst[seed % n.placeFirst.length]} ${n.placeSecond[(seed >>> 8) % n.placeSecond.length]} Region`, seed, createdAt: ctx.now() };
  await ctx.repo.createRegion(region);
  return region;
}

// ---------------------------------------------------------------- matchmaking

export function rules(ctx: ServerContext): EligibilityRules {
  const c = ctx.data.competition;
  return { pvpMinHall: c.pvp.minHall, pvpStandardHall: c.pvp.standardHall, maxAttacks: c.population.maxAttacksPerDefenderPerDay, attacksSince: ctx.now() - DAY };
}

export function attackerPvp(me: Player, ctx: ServerContext): boolean {
  return pvpEnabled(me.hallLevel, Boolean(me.pvpOptIn), ctx.data);
}

/** A real player's village as offered to this attacker (loot capped and reduced). */
async function offeredBase(ctx: ServerContext, me: Player, p: Player): Promise<BaseLayout> {
  const base = capBaseLoot({ ...structuredClone(p.base!), name: p.name, trophies: p.trophies }, ctx.data);
  base.human = true;
  delete base.clan;
  delete base.practice;
  return applyLootPenalty(base, me.hallLevel, ctx.data);
}

/**
 * Attack demand in a band (A in f = D x C / A): the searches measured in the
 * last day, or active players x attacks per player when that is larger. The
 * larger value protects defenders while measurements are thin or uneven.
 */
async function band(ctx: ServerContext, hall: number): Promise<{ eligible: number; active: number; searches: number; attacksPerDay: number; share: number }> {
  const t = ctx.now();
  const win = hallWindow(hall, ctx.data);
  const eligible = await ctx.repo.countEligible({ minHall: win.min, maxHall: win.max, now: t, lockedSince: t - LOCK_MS, eligibility: rules(ctx) });
  const active = await ctx.repo.countActive(win.min, win.max, t - DAY);
  const searches = await ctx.repo.searchesSince(win.min, win.max, t - DAY);
  const attacksPerDay = Math.max(searches, Math.max(1, active) * ctx.data.competition.population.attacksPerPlayerPerDay);
  return { eligible, active, searches, attacksPerDay, share: humanShare(eligible, attacksPerDay, ctx.data) };
}

/** An army snapshot for a ticket: what the attacker reports bringing, checked like a battle report. */
function armySnapshot(ctx: ServerContext, me: Player, req: MatchRequest): Ticket['armyCap'] | undefined {
  if (!req?.army) return undefined;
  return checkArmy({ ticket: '', seed: 0, deployments: [], army: req.army, levels: req.levels }, me, ctx.data);
}

/**
 * Real players for the rivals board. Each of the board's slots is a real
 * player with probability `humanShare`; the rest are left to AI villages.
 */
export async function candidates(ctx: ServerContext, me: Player, offense?: unknown): Promise<CandidatesResponse> {
  if (!attackerPvp(me, ctx) || !me.base) return { candidates: [], humanShare: 0, eligible: 0 };
  const t = ctx.now();
  const { data, repo } = ctx;
  await repo.addSearch(me.id, me.hallLevel, t);
  const b = await band(ctx, me.hallLevel);
  const rolls = Array.from({ length: data.clans.candidates.count }, () => ctx.random());
  const want = humanSlots(b.share, b.eligible, rolls);
  const win = hallWindow(me.hallLevel, data);
  const recent = await repo.recentTargets(me.id, t - data.competition.population.recentOpponentHours * HOUR);
  const mates = me.groveId ? (await repo.members(me.groveId)).map((m) => m.playerId) : [];
  // Look at a few more eligible players than needed, then keep the fairest matchups:
  // the defender's defensive power against the attacker's offensive power.
  const pool = want * data.competition.population.candidatePool;
  const found: Player[] = [];
  for (const range of [data.ranks.matchTrophyRange, 200, 400, 1_000_000]) {
    if (found.length >= pool) break;
    const more = await repo.findOpponents({
      excludeIds: [me.id, ...recent, ...mates, ...found.map((p) => p.id)],
      minHall: win.min,
      maxHall: win.max,
      minTrophies: me.trophies - range,
      maxTrophies: me.trophies + range,
      now: t,
      lockedSince: t - LOCK_MS,
      limit: pool - found.length,
      eligibility: rules(ctx),
      excludeOwnerKey: me.ownerKey ?? null,
    });
    found.push(...more);
  }
  // Order: players inside the attacker's broad progression band (stored combat
  // rating) first, then the fairest matchup of defense against offense.
  const band0 = data.competition.population.ratingBand;
  const outOfBand = (p: Player) => (me.combatRating != null && p.combatRating != null && Math.abs(p.combatRating - me.combatRating) > band0 ? 1 : 0);
  const off = Number(offense);
  const fairness = (p: Player) => (Number.isFinite(off) && off > 0 ? Math.abs(Math.log(matchupFromDefense(off, defensePower(p.base!, data), p.hallLevel, data).ratio)) : 0);
  found.sort((a, b) => outOfBand(a) - outOfBand(b) || fairness(a) - fairness(b));
  found.splice(want);
  const out = [];
  for (const p of found) {
    const r = shadowOf(p, ctx);
    out.push({ token: p.id, name: p.name, hallLevel: p.hallLevel, trophies: p.trophies, base: await offeredBase(ctx, me, p), shadowRank: r.games > 0 ? r.rating : null });
  }
  return { candidates: out, humanShare: b.share, eligible: b.eligible };
}

/** A ticket for a real player from the board (checked again) or for an AI clan village rebuilt here. */
export async function matchWith(ctx: ServerContext, me: Player, req: MatchRequest, fallback: () => Promise<MatchResponse>): Promise<MatchResponse> {
  const t = ctx.now();
  const { data, repo } = ctx;
  let ticket: Ticket;
  const armyCap = armySnapshot(ctx, me, req);
  if (req?.target || req?.ai) await repo.addSearch(me.id, me.hallLevel, t);
  if (req?.target) {
    const def = await repo.getPlayer(String(req.target));
    if (!def?.base || !attackerPvp(me, ctx)) throw new ApiError(404, 'not_found', 'That player cannot be attacked.');
    // A region settlement battle: the defender must hold that settlement in the attacker's region.
    let settlement: string | undefined;
    if (req.settlement !== undefined) {
      settlement = String(req.settlement);
      const held = me.regionId ? (await repo.regionClaims(me.regionId)).find((c) => c.settlement === settlement) : undefined;
      if (!isSettlementId(settlement, data) || !held || held.playerId !== def.id) throw new ApiError(404, 'not_found', 'That player does not hold that settlement.');
    }
    const recent = await repo.recentTargets(me.id, t - data.competition.population.recentOpponentHours * HOUR);
    const ok = defenderEligibility(
      { id: def.id, hall: def.hallLevel, pvpOptIn: Boolean(def.pvpOptIn), shieldUntil: def.shieldUntil, attacksLastDay: await repo.attacksOnSince(def.id, t - DAY), groveId: def.groveId, ownerKey: def.ownerKey ?? null },
      { id: me.id, hall: me.hallLevel, groveId: me.groveId, recentTargets: recent, ownerKey: me.ownerKey ?? null },
      t,
      data,
    );
    if (!ok.ok || (await repo.isLocked(def.id, t - LOCK_MS))) throw new ApiError(409, 'conflict', 'That player cannot be attacked right now.');
    const base = await offeredBase(ctx, me, def);
    ticket = { id: ctx.uuid(), kind: 'pvp', attackerId: me.id, defenderId: def.id, defenderName: def.name, base, defenderTrophies: def.trophies, createdAt: t, expiresAt: t + TTL_MS, used: false, settlement, armyCap };
  } else if (req?.ai) {
    const { clan, seed, strength } = req.ai;
    const win = hallWindow(me.hallLevel, data);
    if (!data.clans.clans.some((c) => c.id === clan)) throw new ApiError(400, 'bad_request', 'Unknown clan.');
    if (!Number.isFinite(strength) || strength < win.min - 1 || strength >= win.max) throw new ApiError(400, 'bad_request', 'That village is outside your band.');
    const base = clanVillage(clan, Number(seed) >>> 0, strength, data);
    base.trophies = Math.round(strength * data.ranks.matchmaking.trophiesPerHall);
    applyLootPenalty(base, me.hallLevel, data);
    ticket = { id: ctx.uuid(), kind: 'pvp', attackerId: me.id, defenderId: null, defenderName: base.name, base, defenderTrophies: base.trophies, createdAt: t, expiresAt: t + TTL_MS, used: false, armyCap };
  } else {
    return fallback();
  }
  await repo.createTicket(ticket);
  return { ticket: ticket.id, base: ticket.base, opponent: { name: ticket.defenderName, trophies: ticket.defenderTrophies, hallLevel: ticket.base.hallLevel, kind: ticket.defenderId ? 'player' : 'bot' }, expiresAt: ticket.expiresAt };
}

// ---------------------------------------------------------------- settings

export async function setPvp(ctx: ServerContext, me: Player, optIn: unknown): Promise<PlayerView> {
  await ctx.repo.updatePlayer(me.id, { pvpOptIn: Boolean(optIn) });
  return meView(ctx, { ...me, pvpOptIn: Boolean(optIn) });
}

export async function setFaction(ctx: ServerContext, me: Player, clan: unknown): Promise<PlayerView> {
  const id = clan === null || clan === undefined || clan === '' ? null : String(clan);
  if (id && !ctx.data.clans.clans.some((c) => c.id === id)) throw new ApiError(400, 'bad_request', 'Unknown faction.');
  await ctx.repo.updatePlayer(me.id, { faction: id });
  return meView(ctx, { ...me, faction: id });
}

// ---------------------------------------------------------------- world

/** Consecutive seasons a player led a faction, up to the one before `season`. */
function termsLed(terms: { season: number; playerId: string }[], playerId: string, season: number): number {
  let n = 0;
  for (let s = season - 1; terms.some((t) => t.season === s && t.playerId === playerId); s--) n++;
  return n;
}

export async function world(ctx: ServerContext, me: Player): Promise<WorldResponse> {
  const t = ctx.now();
  const { data, repo } = ctx;
  let region: WorldResponse['region'] = null;
  if (me.regionId) {
    const r = await repo.getRegion(me.regionId);
    if (r) region = { id: r.id, name: r.name, players: await repo.regionPlayers(r.id), capacity: data.competition.regions.capacity };
  }
  const season = shadowSeason(t, data);
  const l = data.competition.factionLeadership;
  const factions: WorldResponse['factions'] = {};
  for (const c of data.clans.clans) {
    const players = await repo.factionMembers(c.id);
    if (!players.length) {
      factions[c.id] = { humans: 0, leader: null };
      continue;
    }
    const wins = await repo.winsSince(players.map((p) => p.id), t - l.contributionDays * DAY);
    const terms = await repo.factionTerms(c.id);
    const members: FactionMember[] = players.map((p) => ({ id: p.id, name: p.name, lastActiveAt: p.lastSeenAt, contribution: wins[p.id] ?? 0, termsLed: termsLed(terms, p.id, season) }));
    const leader = factionLeader(members, t, data);
    if (leader) await repo.recordFactionTerm(c.id, season, leader.id);
    factions[c.id] = { humans: players.length, leader: leader?.name ?? null, leaderId: leader?.id ?? null, target: await repo.factionTarget(c.id, warWeek(t, data)) };
  }
  const p = await rollSeason(ctx, me);
  const claims = me.regionId ? (await repo.regionClaims(me.regionId)).map(({ settlement, playerId, name, since }) => ({ settlement, playerId, name, since })) : [];
  return { region, factions, lastSeason: p.lastSeason ?? null, claims };
}

/** The faction's current human leader (null while the AI leads). */
async function currentLeader(ctx: ServerContext, clan: string): Promise<FactionMember | null> {
  const t = ctx.now();
  const { data, repo } = ctx;
  const players = await repo.factionMembers(clan);
  if (!players.length) return null;
  const l = data.competition.factionLeadership;
  const wins = await repo.winsSince(players.map((p) => p.id), t - l.contributionDays * DAY);
  const terms = await repo.factionTerms(clan);
  const season = shadowSeason(t, data);
  return factionLeader(players.map((p) => ({ id: p.id, name: p.name, lastActiveAt: p.lastSeenAt, contribution: wins[p.id] ?? 0, termsLed: termsLed(terms, p.id, season) })), t, data);
}

/** A human faction leader picks this week's war target (another faction). */
export async function setFactionTarget(ctx: ServerContext, me: Player, target: unknown): Promise<WorldResponse> {
  const { data } = ctx;
  if (!me.faction) throw new ApiError(409, 'conflict', 'Join a faction first.');
  const leader = await currentLeader(ctx, me.faction);
  if (!leader || leader.id !== me.id) throw new ApiError(409, 'conflict', 'Only the faction leader can choose the war target.');
  const id = String(target ?? '');
  if (!data.clans.clans.some((c) => c.id === id) || id === me.faction) throw new ApiError(400, 'bad_request', 'Pick another faction to fight.');
  await ctx.repo.setFactionTarget(me.faction, warWeek(ctx.now(), data), id, me.id);
  return world(ctx, me);
}

// ---------------------------------------------------------------- shared territory

/** Claim a region settlement the player took from an AI clan; the first real player to hold it keeps it. */
export async function claimSettlement(ctx: ServerContext, me: Player, settlement: unknown): Promise<ClaimResponse> {
  const id = String(settlement ?? '');
  if (!isSettlementId(id, ctx.data)) throw new ApiError(400, 'bad_request', 'Unknown settlement.');
  if (!me.regionId) throw new ApiError(409, 'conflict', 'You have no region yet.');
  const h = await ctx.repo.claimSettlement({ regionId: me.regionId, settlement: id, playerId: me.id, name: me.name, since: ctx.now() });
  return { holder: { settlement: h.settlement, playerId: h.playerId, name: h.name, since: h.since } };
}

/** Give up a settlement (an AI clan took it back in the player's world). */
export async function releaseSettlement(ctx: ServerContext, me: Player, settlement: unknown): Promise<void> {
  const id = String(settlement ?? '');
  if (!isSettlementId(id, ctx.data) || !me.regionId) throw new ApiError(400, 'bad_request', 'Unknown settlement.');
  await ctx.repo.releaseClaim(me.regionId, id, me.id);
}

/** After a settlement battle: enough stars move the claim to the attacker. */
export async function settleTerritory(ctx: ServerContext, me: Player, ticket: Ticket, result: BattleResult): Promise<{ id: string; conquered: boolean } | undefined> {
  if (!ticket.settlement || !ticket.defenderId || !me.regionId) return undefined;
  if (result.stars < ctx.data.world.conquestStars) return { id: ticket.settlement, conquered: false };
  const moved = await ctx.repo.transferClaim(me.regionId, ticket.settlement, ticket.defenderId, { playerId: me.id, name: me.name, since: ctx.now() });
  return { id: ticket.settlement, conquered: moved };
}

// ---------------------------------------------------------------- Alliance board

/** Alliances by points over the last weeks of Alliance Wars, plus the territory their members hold. */
export async function allianceBoard(ctx: ServerContext, me: Player, limit: unknown): Promise<AllianceBoardResponse> {
  const { data, repo } = ctx;
  const b = data.competition.allianceBoard;
  const now = ctx.now();
  const week = raidPhase(now, data).week;
  const results = new Map<string, { outcome: 'win' | 'draw' | 'loss'; week: number }>();
  for (const c of await repo.claimsFromWeek(week - b.weeks)) results.set(`${c.groveId}:${c.week}`, { outcome: c.outcome, week: c.week });
  const points = new Map<string, { points: number; wins: number }>();
  for (const [key, r] of results) {
    const groveId = key.slice(0, key.lastIndexOf(':'));
    const pairing = await repo.getPairing(r.week, groveId);
    const cur = points.get(groveId) ?? { points: 0, wins: 0 };
    if (r.outcome === 'win') {
      cur.points += pairing?.opponentGroveId ? b.win : b.winVsAi;
      cur.wins++;
    } else if (r.outcome === 'draw') cur.points += b.draw;
    points.set(groveId, cur);
  }
  const groves = await repo.listGroves('', 1000);
  const rows: AllianceBoardEntry[] = [];
  for (const g of groves) {
    const members = (await repo.members(g.id)).map((m) => m.playerId);
    const territory = await repo.territoryOf(members);
    const p = points.get(g.id) ?? { points: 0, wins: 0 };
    rows.push({ rank: 0, name: g.name, members: g.members, points: p.points + territory * b.perSettlement, wins: p.wins, territory });
  }
  rows.sort((x, y) => y.points - x.points || y.wins - x.wins || (x.name < y.name ? -1 : 1));
  rows.forEach((r, i) => (r.rank = i + 1));
  const mine = me.groveId ? rows.find((r) => r.name === groves.find((g) => g.id === me.groveId)?.name) : undefined;
  return { weeks: b.weeks, alliances: rows.slice(0, Math.max(1, Math.min(100, Number(limit) || 50))), mine: mine ? { rank: mine.rank, points: mine.points } : null };
}

// ---------------------------------------------------------------- tournaments

export async function submitTournament(ctx: ServerContext, me: Player, sub: TournamentSubmission): Promise<TournamentScoreResponse> {
  const t = ctx.now();
  const { data, repo } = ctx;
  const id = Number(sub?.tournament);
  const win = tournamentAt(t, data);
  const late = tournamentAt(t - data.battle.durationSeconds * 1000 - 60_000, data);
  if (!((win.live && win.id === id) || (late.live && late.id === id))) throw new ApiError(409, 'conflict', 'No tournament is running.');
  const bases = tournamentBases(id, data);
  const index = Number(sub.index);
  if (!Number.isInteger(index) || index < 0 || index >= bases.length) throw new ApiError(400, 'bad_request', 'Unknown fortress.');
  const army = (sub.army ?? {}) as Record<string, number>;
  const bad = draftProblem(army, data);
  if (bad) throw new ApiError(400, 'bad_request', bad);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const { result } = runBattle({ seed: Number(sub.seed) >>> 0, base: bases[index], army, levels: tournamentLevels(data) }, deployments, data, sub.endTick);
  const score = tournamentScore(result.stars, result.destruction);
  const best = await repo.saveTournamentScore({ tournament: id, playerId: me.id, index, score, at: t });
  return { score, best, total: await repo.tournamentTotal(id, me.id) };
}

export async function tournament(ctx: ServerContext, me: Player, limit: number): Promise<TournamentResponse> {
  const id = tournamentAt(ctx.now(), ctx.data).id;
  const n = Math.max(1, Math.min(100, Number(limit) || 20));
  const top = await ctx.repo.tournamentTotals(id, n);
  const mine = await ctx.repo.tournamentTotal(id, me.id);
  return { tournament: id, top: top.map((x, i) => ({ rank: i + 1, name: x.name, score: x.score })), me: mine > 0 ? { rank: await ctx.repo.tournamentRankOf(id, mine), score: mine } : null };
}

// ---------------------------------------------------------------- metrics

/** Matchmaking liquidity per band: the numbers that say when the game can lean on PvP more. */
export async function metrics(ctx: ServerContext): Promise<MetricsResponse> {
  const t = ctx.now();
  const bands = [];
  for (let h = 1; h <= ctx.data.hall.levels.length; h++) {
    const b = await band(ctx, h);
    bands.push({ hall: h, eligible: b.eligible, active: b.active, searches24h: b.searches, attackRequestsPerDay: b.attacksPerDay, humanShare: b.share });
  }
  // Shadow Rank fairness: expected vs actual scores of rated battles in the last week, in five buckets.
  const rated = await ctx.repo.ratedSince(t - 7 * DAY);
  const buckets = [0, 0.2, 0.4, 0.6, 0.8].map((from) => {
    const inB = rated.filter((r) => r.expected >= from && (r.expected < from + 0.2 || (from === 0.8 && r.expected <= 1)));
    const mean = (k: 'expected' | 'score') => (inB.length ? inB.reduce((a, r) => a + r[k], 0) / inB.length : 0);
    return { from, to: from + 0.2, battles: inB.length, expected: mean('expected'), actual: mean('score') };
  });
  const mean = (k: 'expected' | 'score') => (rated.length ? rated.reduce((a, r) => a + r[k], 0) / rated.length : 0);
  const part = await ctx.repo.participation(t - DAY);
  const allEligible = await ctx.repo.countEligible({ minHall: 1, maxHall: ctx.data.hall.levels.length, now: t, lockedSince: t - LOCK_MS, eligibility: rules(ctx) });
  const attacks = await ctx.repo.attacksSince(t - DAY);
  const m = await ctx.repo.ticketsSince(t - DAY);
  return {
    at: t,
    bands,
    attacks24h: attacks,
    attacksPerEligibleDefender: allEligible ? attacks / allEligible : 0,
    matches24h: m,
    humanShareActual: m.human + m.bot ? m.human / (m.human + m.bot) : 0,
    fairness: { battles: rated.length, meanExpected: mean('expected'), meanActual: mean('score'), buckets },
    participation: { active: part.active, allianceShare: part.active ? part.inAlliance / part.active : 0, factionShare: part.active ? part.inFaction / part.active : 0 },
  };
}
