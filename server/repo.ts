/**
 * The server's storage port. Postgres in production (pgRepo.ts), memory in
 * tests and local dev (MemoryRepo below). A future server can add another
 * adapter (any database) by implementing Repo; tests/server/repo.test.ts runs
 * the same checks against every adapter.
 */
import type { BaseLayout, BattleResult, Deployment } from '../src/gameplay/sim/battle/types';
import type { GroveRole } from '../src/backend/net/protocol';

export interface Player {
  id: string;
  name: string;
  tokenHash: string;
  trophies: number;
  hallLevel: number;
  shieldUntil: number;
  base: BaseLayout | null;
  groveId: string | null;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  // Shadow Clans (protocol 4). Optional so older rows and fixtures still load; see core/shadow.ts for defaults.
  /** Real-player battles at the optional Keep level. */
  pvpOptIn?: boolean;
  /** Shadow Rank (offensive Elo) and defense rating, real players only. */
  rating?: number;
  defenseRating?: number;
  ratedGames?: number;
  /** Season the ratings belong to (-1 = never rated). */
  ratingSeason?: number;
  lastSeason?: { season: number; rating: number } | null;
  regionId?: string | null;
  /** AI faction (clan id). */
  faction?: string | null;
  /** Hash of the install that registered the account (keeps alternate accounts apart). */
  ownerKey?: string | null;
  /** Hidden combat rating P (0..scale), from the uploaded village and army. */
  combatRating?: number | null;
}

export type PlayerPatch = Partial<
  Pick<
    Player,
    'name' | 'trophies' | 'hallLevel' | 'shieldUntil' | 'base' | 'groveId' | 'updatedAt' | 'lastSeenAt' | 'pvpOptIn' | 'rating' | 'defenseRating' | 'ratedGames' | 'ratingSeason' | 'lastSeason' | 'regionId' | 'faction' | 'ownerKey' | 'combatRating'
  >
>;

/** A settlement in a region held by a real player (shared territory). */
export interface RegionClaim {
  regionId: string;
  settlement: string;
  playerId: string;
  name: string;
  since: number;
}

/** A regional world instance. */
export interface Region {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
}

/** Defender eligibility rules applied by the database (see sim/world/competition.ts). */
export interface EligibilityRules {
  pvpMinHall: number;
  pvpStandardHall: number;
  /** Skip defenders that took this many real attacks since `attacksSince`. */
  maxAttacks: number;
  attacksSince: number;
}

export interface TournamentScoreRow {
  tournament: number;
  playerId: string;
  index: number;
  score: number;
  at: number;
}

export interface Ticket {
  id: string;
  kind: 'pvp' | 'raid';
  attackerId: string;
  /** Null for a server-generated (bot) opponent. */
  defenderId: string | null;
  defenderName: string;
  base: BaseLayout;
  defenderTrophies: number;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  /** Grove Raid tickets only. */
  week?: number;
  groveId?: string;
  target?: number;
  /** Protocol 4: a region settlement this battle is for (taken on enough stars). */
  settlement?: string;
  /** Protocol 4: the army and levels the attacker had when matched; the report may not exceed them. */
  armyCap?: { army: Record<string, number>; levels: Record<string, number> };
}

export interface AttackRecord {
  id: string;
  at: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  seed: number;
  army: Record<string, number>;
  /** Attacker's troop levels (absent on records from before troop research). */
  levels?: Record<string, number>;
  base: BaseLayout;
  deployments: Deployment[];
  endTick?: number;
  result: BattleResult;
  attackerTrophies: number;
  defenderTrophies: number;
  /** Rated battles: the attacker's expected score and actual score (for the fairness metric). */
  expected?: number;
  score?: number;
}

export interface Grove {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface GroveSummaryRow extends Grove {
  members: number;
  averageTrophies: number;
  /** Most recent time any member was seen. */
  lastActiveAt: number;
}

export interface GroveMember {
  groveId: string;
  playerId: string;
  role: GroveRole;
  joinedAt: number;
  xp: number;
}

export interface ChatRow {
  /** Increasing per server, used as the chat cursor. */
  seq: number;
  id: string;
  groveId: string;
  at: number;
  playerId: string | null;
  name: string | null;
  text: string;
  kind: 'chat' | 'request' | 'donation' | 'system';
}

export interface TroopRequest {
  id: string;
  groveId: string;
  playerId: string;
  name: string;
  at: number;
  size: number;
  filled: number;
  open: boolean;
}

export interface Donation {
  id: string;
  requestId: string;
  groveId: string;
  fromId: string;
  fromName: string;
  toId: string;
  troop: string;
  count: number;
  level: number;
  at: number;
  delivered: boolean;
}

export interface RosterEntry {
  index: number;
  name: string;
  hallLevel: number;
  trophies: number;
  base: BaseLayout;
  playerId: string | null;
}

/** One side's view of a week's Grove Raid pairing. */
export interface RaidPairing {
  week: number;
  groveId: string;
  /** Null when the opponent is a server-generated bot Grove. */
  opponentGroveId: string | null;
  opponentName: string;
  /** Seed for the bot Grove's attacks (bot opponents only). */
  botSeed: number;
  /** The enemy bases this Grove attacks. */
  roster: RosterEntry[];
  /** How many of our members the enemy attacks (for bot attacks). */
  ourSize: number;
  ourHall: number;
  createdAt: number;
}

export interface RaidAttack {
  id: string;
  week: number;
  groveId: string;
  attackerId: string;
  target: number;
  stars: number;
  destruction: number;
  at: number;
}

export interface RaidClaim {
  week: number;
  playerId: string;
  groveId: string;
  outcome: 'win' | 'draw' | 'loss';
  at: number;
}

export interface OpponentQuery {
  excludeIds: string[];
  minHall: number;
  maxHall: number;
  minTrophies: number;
  maxTrophies: number;
  now: number;
  /** Skip players with an unused ticket issued after this time (someone is attacking them). */
  lockedSince: number;
  limit: number;
  /** Protocol 4: only defenders that may be attacked by real players. */
  eligibility?: EligibilityRules;
  /** Protocol 4: skip accounts registered from this install (alternate accounts). */
  excludeOwnerKey?: string | null;
}

export interface Repo {
  // players
  createPlayer(p: Player): Promise<void>;
  playerByTokenHash(hash: string): Promise<Player | null>;
  getPlayer(id: string): Promise<Player | null>;
  updatePlayer(id: string, patch: PlayerPatch): Promise<void>;
  findOpponents(q: OpponentQuery): Promise<Player[]>;
  topPlayers(limit: number): Promise<Player[]>;
  /** 1 + number of players (with a base) who have more trophies. */
  rankOf(trophies: number): Promise<number>;
  // tickets and attacks
  createTicket(t: Ticket): Promise<void>;
  getTicket(id: string): Promise<Ticket | null>;
  /** Marks a ticket used; returns false if it already was (prevents double submits). */
  useTicket(id: string): Promise<boolean>;
  addAttack(a: AttackRecord): Promise<void>;
  defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]>;
  recentTargets(attackerId: string, since: number): Promise<string[]>;
  // groves
  createGrove(g: Grove): Promise<void>;
  getGrove(id: string): Promise<Grove | null>;
  listGroves(query: string, limit: number): Promise<GroveSummaryRow[]>;
  members(groveId: string): Promise<GroveMember[]>;
  getMembership(playerId: string): Promise<GroveMember | null>;
  /** False if the player is already in a Grove (one Grove per player). */
  addMember(m: GroveMember): Promise<boolean>;
  removeMember(groveId: string, playerId: string): Promise<void>;
  updateMember(groveId: string, playerId: string, patch: Partial<Pick<GroveMember, 'role' | 'xp'>>): Promise<void>;
  // chat
  addChat(row: Omit<ChatRow, 'seq'>): Promise<ChatRow>;
  chatAfter(groveId: string, afterSeq: number, limit: number): Promise<ChatRow[]>;
  recentChatCount(playerId: string, since: number): Promise<number>;
  // troop requests and donations
  addRequest(r: TroopRequest): Promise<void>;
  getRequest(id: string): Promise<TroopRequest | null>;
  openRequests(groveId: string, since: number): Promise<TroopRequest[]>;
  lastRequestAt(playerId: string): Promise<number>;
  closeRequestsOf(playerId: string): Promise<void>;
  /** Adds to `filled` only if it stays within `size`; returns the updated request or null. */
  fillRequest(id: string, housing: number): Promise<TroopRequest | null>;
  addDonation(d: Donation): Promise<void>;
  undelivered(playerId: string): Promise<Donation[]>;
  markDelivered(playerId: string, ids: string[]): Promise<void>;
  // grove raids
  getPairing(week: number, groveId: string): Promise<RaidPairing | null>;
  /** Saves both sides of a pairing; false if either Grove was already paired this week. */
  createPairings(pairs: RaidPairing[]): Promise<boolean>;
  unpairedGroves(week: number, activeSince: number, limit: number): Promise<GroveSummaryRow[]>;
  addRaidAttack(a: RaidAttack): Promise<void>;
  raidAttacks(week: number, groveId: string): Promise<RaidAttack[]>;
  /** False if this player already claimed this week. */
  addClaim(c: RaidClaim): Promise<boolean>;
  getClaim(week: number, playerId: string): Promise<RaidClaim | null>;
  // Shadow Clans (protocol 4)
  /** True when someone holds an unused ticket on this defender issued after `since`. */
  isLocked(defenderId: string, since: number): Promise<boolean>;
  /** Players `findOpponents` would return, ignoring trophies, exclusions and the limit. */
  countEligible(q: Pick<OpponentQuery, 'minHall' | 'maxHall' | 'now' | 'lockedSince'> & { eligibility: EligibilityRules }): Promise<number>;
  /** Players with a village seen since `since`, in a Keep range. */
  countActive(minHall: number, maxHall: number, since: number): Promise<number>;
  /** Real-player attacks on one defender since `since`. */
  attacksOnSince(defenderId: string, since: number): Promise<number>;
  /** Real-player attacks on anyone since `since`. */
  attacksSince(since: number): Promise<number>;
  /** PvP tickets handed out since `since`: real defenders and generated ones. */
  ticketsSince(since: number): Promise<{ human: number; bot: number }>;
  /** Top rated players (only players with a rated battle). */
  ratingBoard(board: 'rank' | 'defense', limit: number): Promise<Player[]>;
  ratingRankOf(board: 'rank' | 'defense', value: number): Promise<number>;
  latestRegion(): Promise<Region | null>;
  createRegion(r: Region): Promise<void>;
  getRegion(id: string): Promise<Region | null>;
  regionPlayers(id: string): Promise<number>;
  factionMembers(clan: string): Promise<Player[]>;
  /** Real-player attacks with at least one star since `since`, per attacker. */
  winsSince(playerIds: string[], since: number): Promise<Record<string, number>>;
  factionTerms(clan: string): Promise<{ season: number; playerId: string }[]>;
  /** Records the season's leader once (later calls for the same season are ignored). */
  recordFactionTerm(clan: string, season: number, playerId: string): Promise<void>;
  /** Keeps the best score per player and fortress; returns the best. */
  saveTournamentScore(row: TournamentScoreRow): Promise<number>;
  /** Players by total score (sum of best per fortress). */
  tournamentTotals(tournament: number, limit: number): Promise<{ playerId: string; name: string; score: number }[]>;
  tournamentTotal(tournament: number, playerId: string): Promise<number>;
  /** 1 + players with a higher total. */
  tournamentRankOf(tournament: number, total: number): Promise<number>;
  /** Opponent searches (rivals boards and matches), for measured demand per band. */
  addSearch(playerId: string, hall: number, at: number): Promise<void>;
  searchesSince(minHall: number, maxHall: number, since: number): Promise<number>;
  regionClaims(regionId: string): Promise<RegionClaim[]>;
  /** Inserts the claim when the settlement is free; returns whoever holds it afterwards. */
  claimSettlement(c: RegionClaim): Promise<RegionClaim>;
  /** Moves a claim from one player to another; false if `fromId` no longer holds it. */
  transferClaim(regionId: string, settlement: string, fromId: string, to: { playerId: string; name: string; since: number }): Promise<boolean>;
  releaseClaim(regionId: string, settlement: string, playerId: string): Promise<void>;
  /** A human faction leader's war target for a week. */
  setFactionTarget(clan: string, week: number, target: string, by: string): Promise<void>;
  factionTarget(clan: string, week: number): Promise<string | null>;
  /** Stars of a player's most recent real-player attacks, newest first. */
  recentStars(playerId: string, limit: number): Promise<number[]>;
  /** Rated battles since `since`: expected and actual scores. */
  ratedSince(since: number): Promise<{ expected: number; score: number }[]>;
  /** Players seen since `since`, and how many of them are in an Alliance or an AI faction. */
  participation(since: number): Promise<{ active: number; inAlliance: number; inFaction: number }>;
  /** Alliance War claims for weeks >= `week` (one row per player). */
  claimsFromWeek(week: number): Promise<RaidClaim[]>;
  /** Region settlements held by any of these players. */
  territoryOf(playerIds: string[]): Promise<number>;
}

/** Shared rule check for the memory adapter (Postgres does the same in SQL). */
function eligible(p: Player, rules: EligibilityRules, attacksOn: number): boolean {
  const pvp = p.hallLevel >= rules.pvpStandardHall || (p.hallLevel >= rules.pvpMinHall && Boolean(p.pvpOptIn));
  return pvp && attacksOn < rules.maxAttacks;
}

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryRepo implements Repo {
  players = new Map<string, Player>();
  tickets = new Map<string, Ticket>();
  attacks: AttackRecord[] = [];
  groves = new Map<string, Grove>();
  memberRows: GroveMember[] = [];
  chatRows: ChatRow[] = [];
  requestRows = new Map<string, TroopRequest>();
  donations: Donation[] = [];
  pairings: RaidPairing[] = [];
  raidAttackRows: RaidAttack[] = [];
  claims: RaidClaim[] = [];
  regions: Region[] = [];
  terms: { clan: string; season: number; playerId: string }[] = [];
  tournamentRows: TournamentScoreRow[] = [];
  searches: { playerId: string; hall: number; at: number }[] = [];
  claimsRegion: RegionClaim[] = [];
  targets: { clan: string; week: number; target: string; by: string }[] = [];
  private seq = 0;

  async createPlayer(p: Player): Promise<void> {
    this.players.set(p.id, clone(p));
  }
  async playerByTokenHash(hash: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.tokenHash === hash) return clone(p);
    return null;
  }
  async getPlayer(id: string): Promise<Player | null> {
    const p = this.players.get(id);
    return p ? clone(p) : null;
  }
  async updatePlayer(id: string, patch: PlayerPatch): Promise<void> {
    const p = this.players.get(id);
    if (p) Object.assign(p, clone(patch));
  }
  async findOpponents(q: OpponentQuery): Promise<Player[]> {
    const locked = new Set([...this.tickets.values()].filter((t) => !t.used && t.defenderId && t.createdAt > q.lockedSince).map((t) => t.defenderId));
    return [...this.players.values()]
      .filter((p) => p.base && !q.excludeIds.includes(p.id) && !locked.has(p.id) && p.shieldUntil <= q.now)
      .filter((p) => p.hallLevel >= q.minHall && p.hallLevel <= q.maxHall && p.trophies >= q.minTrophies && p.trophies <= q.maxTrophies)
      .filter((p) => !q.eligibility || eligible(p, q.eligibility, this.attacks.filter((a) => a.defenderId === p.id && a.at > q.eligibility!.attacksSince).length))
      .filter((p) => !q.excludeOwnerKey || p.ownerKey !== q.excludeOwnerKey)
      .slice(0, q.limit)
      .map(clone);
  }
  async topPlayers(limit: number): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.base).sort((a, b) => b.trophies - a.trophies || a.createdAt - b.createdAt).slice(0, limit).map(clone);
  }
  async rankOf(trophies: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => p.base && p.trophies > trophies).length;
  }
  async createTicket(t: Ticket): Promise<void> {
    this.tickets.set(t.id, clone(t));
  }
  async getTicket(id: string): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    return t ? clone(t) : null;
  }
  async useTicket(id: string): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.used) return false;
    t.used = true;
    return true;
  }
  async addAttack(a: AttackRecord): Promise<void> {
    this.attacks.push(clone(a));
  }
  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    return this.attacks.filter((a) => a.defenderId === defenderId && a.at > since).slice(-limit).map(clone);
  }
  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return this.attacks.filter((a) => a.attackerId === attackerId && a.at > since).map((a) => a.defenderId);
  }
  async createGrove(g: Grove): Promise<void> {
    this.groves.set(g.id, clone(g));
  }
  async getGrove(id: string): Promise<Grove | null> {
    const g = this.groves.get(id);
    return g ? clone(g) : null;
  }
  private summary(g: Grove): GroveSummaryRow {
    const rows = this.memberRows.filter((m) => m.groveId === g.id);
    const players = rows.map((m) => this.players.get(m.playerId)).filter((p): p is Player => Boolean(p));
    const avg = players.length ? Math.round(players.reduce((s, p) => s + p.trophies, 0) / players.length) : 0;
    return { ...clone(g), members: rows.length, averageTrophies: avg, lastActiveAt: Math.max(0, ...players.map((p) => p.lastSeenAt)) };
  }
  async listGroves(query: string, limit: number): Promise<GroveSummaryRow[]> {
    const q = query.trim().toLowerCase();
    return [...this.groves.values()]
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .map((g) => this.summary(g))
      .filter((s) => s.members > 0)
      .slice(0, limit);
  }
  async members(groveId: string): Promise<GroveMember[]> {
    return this.memberRows.filter((m) => m.groveId === groveId).map(clone);
  }
  async getMembership(playerId: string): Promise<GroveMember | null> {
    const m = this.memberRows.find((r) => r.playerId === playerId);
    return m ? clone(m) : null;
  }
  async addMember(m: GroveMember): Promise<boolean> {
    if (this.memberRows.some((r) => r.playerId === m.playerId)) return false;
    this.memberRows.push(clone(m));
    return true;
  }
  async removeMember(groveId: string, playerId: string): Promise<void> {
    this.memberRows = this.memberRows.filter((m) => !(m.groveId === groveId && m.playerId === playerId));
  }
  async updateMember(groveId: string, playerId: string, patch: Partial<Pick<GroveMember, 'role' | 'xp'>>): Promise<void> {
    const m = this.memberRows.find((r) => r.groveId === groveId && r.playerId === playerId);
    if (m) Object.assign(m, patch);
  }
  async addChat(row: Omit<ChatRow, 'seq'>): Promise<ChatRow> {
    const full = { ...clone(row), seq: ++this.seq };
    this.chatRows.push(full);
    return clone(full);
  }
  async chatAfter(groveId: string, afterSeq: number, limit: number): Promise<ChatRow[]> {
    return this.chatRows.filter((c) => c.groveId === groveId && c.seq > afterSeq).slice(-limit).map(clone);
  }
  async recentChatCount(playerId: string, since: number): Promise<number> {
    return this.chatRows.filter((c) => c.playerId === playerId && c.at > since && c.kind === 'chat').length;
  }
  async addRequest(r: TroopRequest): Promise<void> {
    this.requestRows.set(r.id, clone(r));
  }
  async getRequest(id: string): Promise<TroopRequest | null> {
    const r = this.requestRows.get(id);
    return r ? clone(r) : null;
  }
  async openRequests(groveId: string, since: number): Promise<TroopRequest[]> {
    return [...this.requestRows.values()].filter((r) => r.groveId === groveId && r.open && r.at > since).sort((a, b) => a.at - b.at).map(clone);
  }
  async lastRequestAt(playerId: string): Promise<number> {
    return Math.max(0, ...[...this.requestRows.values()].filter((r) => r.playerId === playerId).map((r) => r.at));
  }
  async closeRequestsOf(playerId: string): Promise<void> {
    for (const r of this.requestRows.values()) if (r.playerId === playerId) r.open = false;
  }
  async fillRequest(id: string, housing: number): Promise<TroopRequest | null> {
    const r = this.requestRows.get(id);
    if (!r || !r.open || r.filled + housing > r.size) return null;
    r.filled += housing;
    if (r.filled >= r.size) r.open = false;
    return clone(r);
  }
  async addDonation(d: Donation): Promise<void> {
    this.donations.push(clone(d));
  }
  async undelivered(playerId: string): Promise<Donation[]> {
    return this.donations.filter((d) => d.toId === playerId && !d.delivered).map(clone);
  }
  async markDelivered(playerId: string, ids: string[]): Promise<void> {
    for (const d of this.donations) if (d.toId === playerId && ids.includes(d.id)) d.delivered = true;
  }
  async getPairing(week: number, groveId: string): Promise<RaidPairing | null> {
    const p = this.pairings.find((x) => x.week === week && x.groveId === groveId);
    return p ? clone(p) : null;
  }
  async createPairings(pairs: RaidPairing[]): Promise<boolean> {
    if (pairs.some((p) => this.pairings.some((x) => x.week === p.week && x.groveId === p.groveId))) return false;
    for (const p of pairs) this.pairings.push(clone(p));
    return true;
  }
  async unpairedGroves(week: number, activeSince: number, limit: number): Promise<GroveSummaryRow[]> {
    const paired = new Set(this.pairings.filter((p) => p.week === week).map((p) => p.groveId));
    return [...this.groves.values()]
      .filter((g) => !paired.has(g.id))
      .map((g) => this.summary(g))
      .filter((s) => s.members > 0 && s.lastActiveAt >= activeSince)
      .slice(0, limit);
  }
  async addRaidAttack(a: RaidAttack): Promise<void> {
    this.raidAttackRows.push(clone(a));
  }
  async raidAttacks(week: number, groveId: string): Promise<RaidAttack[]> {
    return this.raidAttackRows.filter((a) => a.week === week && a.groveId === groveId).map(clone);
  }
  async addClaim(c: RaidClaim): Promise<boolean> {
    if (this.claims.some((x) => x.week === c.week && x.playerId === c.playerId)) return false;
    this.claims.push(clone(c));
    return true;
  }
  async getClaim(week: number, playerId: string): Promise<RaidClaim | null> {
    const c = this.claims.find((x) => x.week === week && x.playerId === playerId);
    return c ? clone(c) : null;
  }
  async isLocked(defenderId: string, since: number): Promise<boolean> {
    return [...this.tickets.values()].some((t) => !t.used && t.defenderId === defenderId && t.createdAt > since);
  }
  async countEligible(q: Pick<OpponentQuery, 'minHall' | 'maxHall' | 'now' | 'lockedSince'> & { eligibility: EligibilityRules }): Promise<number> {
    return (await this.findOpponents({ ...q, excludeIds: [], minTrophies: Number.NEGATIVE_INFINITY, maxTrophies: Number.POSITIVE_INFINITY, limit: Number.MAX_SAFE_INTEGER })).length;
  }
  async countActive(minHall: number, maxHall: number, since: number): Promise<number> {
    return [...this.players.values()].filter((p) => p.base && p.hallLevel >= minHall && p.hallLevel <= maxHall && p.lastSeenAt >= since).length;
  }
  async attacksOnSince(defenderId: string, since: number): Promise<number> {
    return this.attacks.filter((a) => a.defenderId === defenderId && a.at > since).length;
  }
  async attacksSince(since: number): Promise<number> {
    return this.attacks.filter((a) => a.at > since).length;
  }
  async ticketsSince(since: number): Promise<{ human: number; bot: number }> {
    const ts = [...this.tickets.values()].filter((t) => t.kind === 'pvp' && t.createdAt > since);
    return { human: ts.filter((t) => t.defenderId).length, bot: ts.filter((t) => !t.defenderId).length };
  }
  async ratingBoard(board: 'rank' | 'defense', limit: number): Promise<Player[]> {
    const v = (p: Player) => (board === 'rank' ? p.rating ?? 0 : p.defenseRating ?? 0);
    return [...this.players.values()].filter((p) => (p.ratedGames ?? 0) > 0).sort((a, b) => v(b) - v(a) || a.createdAt - b.createdAt).slice(0, limit).map(clone);
  }
  async ratingRankOf(board: 'rank' | 'defense', value: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => (p.ratedGames ?? 0) > 0 && (board === 'rank' ? p.rating ?? 0 : p.defenseRating ?? 0) > value).length;
  }
  async latestRegion(): Promise<Region | null> {
    const r = [...this.regions].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))[0];
    return r ? clone(r) : null;
  }
  async createRegion(r: Region): Promise<void> {
    this.regions.push(clone(r));
  }
  async getRegion(id: string): Promise<Region | null> {
    const r = this.regions.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async regionPlayers(id: string): Promise<number> {
    return [...this.players.values()].filter((p) => p.regionId === id).length;
  }
  async factionMembers(clan: string): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.faction === clan).map(clone);
  }
  async winsSince(playerIds: string[], since: number): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const a of this.attacks) if (a.at > since && a.result.stars >= 1 && playerIds.includes(a.attackerId)) out[a.attackerId] = (out[a.attackerId] ?? 0) + 1;
    return out;
  }
  async factionTerms(clan: string): Promise<{ season: number; playerId: string }[]> {
    return this.terms.filter((t) => t.clan === clan).map(({ season, playerId }) => ({ season, playerId }));
  }
  async recordFactionTerm(clan: string, season: number, playerId: string): Promise<void> {
    if (!this.terms.some((t) => t.clan === clan && t.season === season)) this.terms.push({ clan, season, playerId });
  }
  async saveTournamentScore(row: TournamentScoreRow): Promise<number> {
    const cur = this.tournamentRows.find((r) => r.tournament === row.tournament && r.playerId === row.playerId && r.index === row.index);
    if (!cur) this.tournamentRows.push(clone(row));
    else if (row.score > cur.score) Object.assign(cur, clone(row));
    return Math.max(row.score, cur?.score ?? 0);
  }
  private totals(tournament: number): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of this.tournamentRows) if (r.tournament === tournament) m.set(r.playerId, (m.get(r.playerId) ?? 0) + r.score);
    return m;
  }
  async tournamentTotals(tournament: number, limit: number): Promise<{ playerId: string; name: string; score: number }[]> {
    return [...this.totals(tournament).entries()]
      .map(([playerId, score]) => ({ playerId, name: this.players.get(playerId)?.name ?? '?', score }))
      .sort((a, b) => b.score - a.score || (a.playerId < b.playerId ? -1 : 1))
      .slice(0, limit);
  }
  async tournamentTotal(tournament: number, playerId: string): Promise<number> {
    return this.totals(tournament).get(playerId) ?? 0;
  }
  async tournamentRankOf(tournament: number, total: number): Promise<number> {
    return 1 + [...this.totals(tournament).values()].filter((v) => v > total).length;
  }
  async addSearch(playerId: string, hall: number, at: number): Promise<void> {
    this.searches.push({ playerId, hall, at });
  }
  async searchesSince(minHall: number, maxHall: number, since: number): Promise<number> {
    return this.searches.filter((x) => x.at > since && x.hall >= minHall && x.hall <= maxHall).length;
  }
  async regionClaims(regionId: string): Promise<RegionClaim[]> {
    return this.claimsRegion.filter((c) => c.regionId === regionId).map(clone);
  }
  async claimSettlement(c: RegionClaim): Promise<RegionClaim> {
    const cur = this.claimsRegion.find((x) => x.regionId === c.regionId && x.settlement === c.settlement);
    if (cur) return clone(cur);
    this.claimsRegion.push(clone(c));
    return clone(c);
  }
  async transferClaim(regionId: string, settlement: string, fromId: string, to: { playerId: string; name: string; since: number }): Promise<boolean> {
    const cur = this.claimsRegion.find((x) => x.regionId === regionId && x.settlement === settlement && x.playerId === fromId);
    if (!cur) return false;
    Object.assign(cur, to);
    return true;
  }
  async releaseClaim(regionId: string, settlement: string, playerId: string): Promise<void> {
    this.claimsRegion = this.claimsRegion.filter((x) => !(x.regionId === regionId && x.settlement === settlement && x.playerId === playerId));
  }
  async setFactionTarget(clan: string, week: number, target: string, by: string): Promise<void> {
    this.targets = this.targets.filter((x) => !(x.clan === clan && x.week === week));
    this.targets.push({ clan, week, target, by });
  }
  async factionTarget(clan: string, week: number): Promise<string | null> {
    return this.targets.find((x) => x.clan === clan && x.week === week)?.target ?? null;
  }
  async recentStars(playerId: string, limit: number): Promise<number[]> {
    return this.attacks.filter((a) => a.attackerId === playerId).sort((a, b) => b.at - a.at).slice(0, limit).map((a) => a.result.stars);
  }
  async ratedSince(since: number): Promise<{ expected: number; score: number }[]> {
    return this.attacks.filter((a) => a.at > since && typeof a.expected === 'number' && typeof a.score === 'number').map((a) => ({ expected: a.expected!, score: a.score! }));
  }
  async participation(since: number): Promise<{ active: number; inAlliance: number; inFaction: number }> {
    const active = [...this.players.values()].filter((p) => p.lastSeenAt >= since);
    return { active: active.length, inAlliance: active.filter((p) => p.groveId).length, inFaction: active.filter((p) => p.faction).length };
  }
  async claimsFromWeek(week: number): Promise<RaidClaim[]> {
    return this.claims.filter((c) => c.week >= week).map(clone);
  }
  async territoryOf(playerIds: string[]): Promise<number> {
    return this.claimsRegion.filter((c) => playerIds.includes(c.playerId)).length;
  }
}
