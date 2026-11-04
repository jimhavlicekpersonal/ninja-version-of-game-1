/**
 * The server's storage port. Postgres in production (pgRepo.ts), memory in
 * tests and local dev (MemoryRepo below). A future server can add another
 * adapter (any database) by implementing Repo; tests/server/repo.test.ts runs
 * the same checks against every adapter.
 */
import type { BaseLayout, BattleResult, Deployment } from '../src/gameplay/sim/battle/types';
import type { GroveRole, ReportReason } from '../src/backend/net/protocol';
import { contentHash } from './contentHash';

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
  /** A moderator muted their chat until this time (0 or absent: not muted). */
  mutedUntil?: number;
}

export type PlayerPatch = Partial<Pick<Player, 'name' | 'trophies' | 'hallLevel' | 'shieldUntil' | 'base' | 'groveId' | 'updatedAt' | 'lastSeenAt' | 'mutedUntil'>>;

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
  /**
   * The battle seed the server issued with the ticket; the battle is
   * re-simulated with it whatever the client sends. Absent only on tickets
   * issued before server seeds (they keep using the client's seed).
   */
  seed?: number;
  /** Grove Raid tickets only. */
  week?: number;
  groveId?: string;
  target?: number;
  /** The answer given when the ticket was used, so a repeated report gets the same answer (idempotent). */
  response?: unknown;
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
  /** Infiltration Points were in force (protocol v5+); absent on older records. */
  infiltration?: boolean;
  /** Donated troops and their levels (protocol 6+). */
  reinforcements?: Record<string, { count: number; level: number }>;
  /** Battle rules version (SIM_RULES) the attack was simulated with (protocol 6+). */
  rules?: number;
  attackerTrophies: number;
  defenderTrophies: number;
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
  /** Removed by moderation (enough reports, or staff); never sent to players. */
  hidden?: boolean;
}

/** A report of a chat message or a player (roadmap step 15). */
export interface Report {
  id: string;
  at: number;
  reporterId: string;
  kind: 'chat' | 'player';
  /** The reported player. */
  targetId: string;
  targetName: string;
  /** Chat reports: the message, its Alliance, and its text as it was (evidence). */
  messageId: string | null;
  groveId: string | null;
  text: string | null;
  reason: ReportReason;
  note: string;
  status: 'open' | 'actioned' | 'dismissed';
  resolvedAt: number | null;
  resolution: string | null;
}

export interface Block {
  playerId: string;
  blockedId: string;
  /** The name when blocked, for the list (the player may have left or renamed). */
  blockedName: string;
  at: number;
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

/** A village the server keeps (roadmap Phase 2, step 19). */
export interface VillageRow {
  playerId: string;
  /** The village as a save file (src/gameplay/sim/save.ts: version, savedAt, village). */
  file: unknown;
  /** Goes up with every write; a write names the revision it read. */
  revision: number;
  /** The last client command applied (the game numbers its commands). */
  seq: number;
  /** The time the village is settled to (its last change). */
  at: number;
  /** economyHash (src/gameplay/sim/serverEconomy.ts) of the village at `at`. */
  stateHash: string;
  createdAt: number;
  updatedAt: number;
}

/** One change to a server-held resource (append-only). */
export interface LedgerEntry {
  playerId: string;
  at: number;
  resource: string;
  delta: number;
  /** The amount after this change. */
  balance: number;
  /** What changed it: `command:<type>`, `attack:loot`, `defense:loss`, `donation:sent`, … */
  reason: string;
  /** The ticket, attack, donation or command seq behind it. */
  ref: string | null;
}

/** A command a client sent, and what the server made of it. */
export interface CommandLogRow {
  playerId: string;
  seq: number;
  /** When the server applied it (the client's time, clamped). */
  at: number;
  /** The time the client said. */
  clientAt: number;
  type: string;
  command: unknown;
  ok: boolean;
  error: string | null;
}

/** A sign-in linked to a player (roadmap step 24). */
export interface IdentityLink {
  provider: string;
  subject: string;
  playerId: string;
  linkedAt: number;
}

/** How a deleted player appears in what other players keep (their defense replays, war rosters, donation notes). */
export const DELETED_PLAYER = { id: 'deleted', name: 'Deleted player' } as const;

/** A request from the web deletion form (roadmap step 14), for staff to verify and carry out. */
export interface DeletionRequest {
  id: string;
  at: number;
  /** As typed on the form: it may not exist, or belong to someone else (staff verify). */
  playerId: string;
  name: string;
  contact: string;
  note: string;
  status: 'open' | 'done' | 'rejected';
  resolvedAt: number | null;
  resolution: string | null;
}

/** What `prune` removes (roadmap step 11: 30-day replay retention). */
export interface PruneCutoffs {
  /** Attack records (replays) and tickets created before this time are deleted. */
  recordsBefore: number;
  /**
   * Unused tickets that expired before this time are deleted too (they only
   * mattered while they could be used), and so are base versions no ticket or
   * attack refers to any more and nobody used since this time.
   */
  staleBefore: number;
  /** Handled reports (with their evidence) resolved before this time are deleted. */
  resolvedReportsBefore?: number;
  /** Command log lines before this time are deleted (the ledger is kept). */
  commandsBefore?: number;
  /** Remembered answers to Idempotency-Keys from before this time are forgotten. */
  idempotencyBefore?: number;
}
export interface PruneResult {
  attacks: number;
  tickets: number;
  bases: number;
  reports: number;
  commands: number;
  idempotency: number;
}

export interface OpponentQuery {
  excludeIds: string[];
  minHall: number;
  maxHall: number;
  minTrophies: number;
  maxTrophies: number;
  now: number;
  /**
   * Skip players with an unused ticket issued after this time (someone is
   * attacking them). Null when match locks live elsewhere (Redis, step 16).
   */
  lockedSince: number | null;
  limit: number;
}

export interface Repo {
  /** Throws when the store cannot answer (readiness checks). */
  ping(): Promise<void>;
  // players
  createPlayer(p: Player): Promise<void>;
  playerByTokenHash(hash: string): Promise<Player | null>;
  getPlayer(id: string): Promise<Player | null>;
  updatePlayer(id: string, patch: PlayerPatch): Promise<void>;
  findOpponents(q: OpponentQuery): Promise<Player[]>;
  topPlayers(limit: number): Promise<Player[]>;
  /** 1 + number of players (with a base) who have more trophies. */
  rankOf(trophies: number): Promise<number>;
  /** Another device's token for a player (signing in with a linked account). */
  addToken(playerId: string, tokenHash: string, at: number, label: string): Promise<void>;
  linksOf(playerId: string): Promise<IdentityLink[]>;
  playerByIdentity(provider: string, subject: string): Promise<string | null>;
  /** False if that sign-in is linked to someone, or this player already has one from that provider. */
  addLink(l: IdentityLink): Promise<boolean>;
  removeLink(playerId: string, provider: string): Promise<void>;
  /** Players by id, in the order asked (missing ones left out). */
  playersByIds(ids: string[]): Promise<Player[]>;
  /** Every ranked player (with a base), to rebuild a leaderboard index. */
  rankedPlayers(): Promise<{ id: string; trophies: number; createdAt: number }[]>;
  // tickets and attacks. Each base is stored once per distinct content
  // (base versions, keyed by contentHash); tickets and attacks keep the key.
  createTicket(t: Ticket): Promise<void>;
  getTicket(id: string): Promise<Ticket | null>;
  /**
   * Marks a ticket used, storing the answer given for it; returns false if it
   * already was (prevents double submits; the stored answer is returned on a retry).
   */
  useTicket(id: string, response?: unknown): Promise<boolean>;
  addAttack(a: AttackRecord): Promise<void>;
  defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]>;
  recentTargets(attackerId: string, since: number): Promise<string[]>;
  /** Retention: delete old battle records and tickets, then base versions nothing refers to. */
  prune(cutoffs: PruneCutoffs): Promise<PruneResult>;
  // account deletion
  /**
   * Delete a player and everything that is only theirs: the player row (with
   * their base and token), tickets they hold, raids on them, their Alliance
   * membership, chat lines, troop requests and gifts to them, war claims, and
   * Alliance notices naming them. What other players keep (replays of raids
   * they made, gifts they sent, war rosters and attacks that count for a war
   * score) is kept under DELETED_PLAYER. Blocks either way and their own
   * reports go; open reports about them are closed at `at`, without the
   * evidence text. One transaction.
   */
  deletePlayer(id: string, name: string, at: number): Promise<void>;
  addDeletionRequest(r: DeletionRequest): Promise<void>;
  /** Oldest first; 'open' lists only those still waiting. */
  deletionRequests(status: 'open' | 'all', limit: number): Promise<DeletionRequest[]>;
  getDeletionRequest(id: string): Promise<DeletionRequest | null>;
  /** False if it was already resolved. */
  resolveDeletionRequest(id: string, status: 'done' | 'rejected', resolution: string, at: number): Promise<boolean>;
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
  /** Messages after the cursor, without hidden ones. */
  chatAfter(groveId: string, afterSeq: number, limit: number): Promise<ChatRow[]>;
  recentChatCount(playerId: string, since: number): Promise<number>;
  getChat(id: string): Promise<ChatRow | null>;
  setChatHidden(id: string, hidden: boolean): Promise<void>;
  /** Ids of hidden messages among the Alliance's latest `lastN` messages. */
  hiddenChatIds(groveId: string, lastN: number): Promise<string[]>;
  // reports and blocks (roadmap step 15)
  /** False (and nothing stored) if the reporter already has an open report on that message or player. */
  addReport(r: Report): Promise<boolean>;
  /** Oldest first; 'open' lists only those waiting for staff. */
  reports(status: 'open' | 'all', limit: number): Promise<Report[]>;
  getReport(id: string): Promise<Report | null>;
  /** Open reports on one message (to count distinct reporters, and to resolve them together). */
  openReportsOn(messageId: string): Promise<Report[]>;
  /** False if it was already resolved. */
  resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string, at: number): Promise<boolean>;
  /** Adds or refreshes a block. */
  addBlock(b: Block): Promise<void>;
  removeBlock(playerId: string, blockedId: string): Promise<void>;
  /** Newest first. */
  blocksOf(playerId: string): Promise<Block[]>;
  // server-owned villages (roadmap Phase 2)
  /** `forUpdate`: inside a transaction, hold the row until it ends (others wait). */
  getVillage(playerId: string, opts?: { forUpdate?: boolean }): Promise<VillageRow | null>;
  /** False if the player already has one. */
  createVillage(v: VillageRow): Promise<boolean>;
  /**
   * Store the next revision with its ledger entries and command lines, all or
   * nothing. False (nothing written) if the stored revision is no longer
   * `expectedRevision`: someone else wrote first.
   */
  saveVillage(v: VillageRow, expectedRevision: number, ledger: LedgerEntry[], commands: CommandLogRow[]): Promise<boolean>;
  /** Newest first. */
  ledgerOf(playerId: string, limit: number): Promise<LedgerEntry[]>;
  /** Oldest first, after `sinceSeq`. */
  commandsOf(playerId: string, sinceSeq: number, limit: number): Promise<CommandLogRow[]>;
  /** The answer remembered for a write's Idempotency-Key (protocol 7), per caller. */
  getIdempotent(scope: string, key: string): Promise<{ status: number; body: unknown } | null>;
  /** Remember it (the first answer wins). */
  putIdempotent(scope: string, key: string, status: number, body: unknown, at: number): Promise<void>;
  /** Run `fn` atomically: what it writes through `tx` lands together, or not at all if it throws. */
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;
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
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * The Alliance notices that name a player (server/core/groves.ts writes them):
 * "<name> founded …!", "<name> joined the Alliance. Say hello!",
 * "<name> left the Alliance.", "<name> is the new leader.".
 */
export function noticesNaming(name: string): (text: string) => boolean {
  const exact = new Set([`${name} joined the Alliance. Say hello!`, `${name} left the Alliance.`, `${name} is the new leader.`]);
  return (text) => exact.has(text) || text.startsWith(`${name} founded `);
}

/** A ticket or attack as stored: the base by its content hash. */
type Stored<T extends { base: BaseLayout }> = Omit<T, 'base'> & { baseHash: string };

export class MemoryRepo implements Repo {
  players = new Map<string, Player>();
  /** Base versions by content hash (stored once, like Postgres's base_versions). */
  bases = new Map<string, { base: BaseLayout; createdAt: number; lastUsedAt: number }>();
  tickets = new Map<string, Stored<Ticket>>();
  attacks: Stored<AttackRecord>[] = [];
  groves = new Map<string, Grove>();
  memberRows: GroveMember[] = [];
  chatRows: ChatRow[] = [];
  requestRows = new Map<string, TroopRequest>();
  donations: Donation[] = [];
  pairings: RaidPairing[] = [];
  raidAttackRows: RaidAttack[] = [];
  claims: RaidClaim[] = [];
  deletionRows: DeletionRequest[] = [];
  reportRows: Report[] = [];
  blockRows: Block[] = [];
  villageRows = new Map<string, VillageRow>();
  tokenRows: { tokenHash: string; playerId: string; createdAt: number; label: string }[] = [];
  linkRows: IdentityLink[] = [];
  ledgerRows: LedgerEntry[] = [];
  commandRows: CommandLogRow[] = [];
  idempotencyRows = new Map<string, { status: number; body: unknown; createdAt: number }>();
  private seq = 0;
  /** Transactions run one at a time (memory has no row locks). */
  private txChain: Promise<unknown> = Promise.resolve();

  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    const run = () => this.withRollback(fn);
    const result = this.txChain.then(run, run);
    this.txChain = result.catch(() => undefined);
    return result;
  }

  /**
   * Run `fn` with a handle on this repo; if it throws, every field goes back to
   * how it was (like a rollback, or a savepoint when nested).
   */
  private async withRollback<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, unknown>();
    for (const [k, v] of Object.entries(this)) if (k !== 'txChain' && typeof v !== 'function') snapshot.set(k, structuredClone(v));
    // Everything goes to this repo; a transaction inside the transaction is nested (no queueing).
    const tx: Repo = new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'transaction') return <U>(f: (r: Repo) => Promise<U>) => target.withRollback(f);
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    try {
      return await fn(tx);
    } catch (e) {
      for (const [k, v] of snapshot) (this as unknown as Record<string, unknown>)[k] = v;
      throw e;
    }
  }

  async getIdempotent(scope: string, key: string): Promise<{ status: number; body: unknown } | null> {
    const r = this.idempotencyRows.get(`${scope}\u0000${key}`);
    return r ? { status: r.status, body: clone(r.body) } : null;
  }
  async putIdempotent(scope: string, key: string, status: number, body: unknown, at: number): Promise<void> {
    const k = `${scope}\u0000${key}`;
    if (!this.idempotencyRows.has(k)) this.idempotencyRows.set(k, { status, body: clone(body), createdAt: at });
  }
  async getVillage(playerId: string): Promise<VillageRow | null> {
    const v = this.villageRows.get(playerId);
    return v ? clone(v) : null;
  }
  async createVillage(v: VillageRow): Promise<boolean> {
    if (this.villageRows.has(v.playerId) || !this.players.has(v.playerId)) return false;
    this.villageRows.set(v.playerId, clone(v));
    return true;
  }
  async saveVillage(v: VillageRow, expectedRevision: number, ledger: LedgerEntry[], commands: CommandLogRow[]): Promise<boolean> {
    const cur = this.villageRows.get(v.playerId);
    if (!cur || cur.revision !== expectedRevision) return false;
    this.villageRows.set(v.playerId, clone(v));
    this.ledgerRows.push(...clone(ledger));
    for (const c of commands) {
      this.commandRows = this.commandRows.filter((x) => !(x.playerId === c.playerId && x.seq === c.seq));
      this.commandRows.push(clone(c));
    }
    return true;
  }
  async ledgerOf(playerId: string, limit: number): Promise<LedgerEntry[]> {
    return this.ledgerRows
      .filter((l) => l.playerId === playerId)
      .slice(-limit)
      .reverse()
      .map(clone);
  }
  async commandsOf(playerId: string, sinceSeq: number, limit: number): Promise<CommandLogRow[]> {
    return this.commandRows
      .filter((c) => c.playerId === playerId && c.seq > sinceSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map(clone);
  }

  async ping(): Promise<void> {}
  async createPlayer(p: Player): Promise<void> {
    this.players.set(p.id, clone(p));
  }
  async playerByTokenHash(hash: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.tokenHash === hash) return clone(p);
    const t = this.tokenRows.find((x) => x.tokenHash === hash);
    const p = t ? this.players.get(t.playerId) : undefined;
    return p ? clone(p) : null;
  }
  async addToken(playerId: string, tokenHash: string, at: number, label: string): Promise<void> {
    this.tokenRows.push({ tokenHash, playerId, createdAt: at, label });
  }
  async linksOf(playerId: string): Promise<IdentityLink[]> {
    return this.linkRows.filter((l) => l.playerId === playerId).map(clone);
  }
  async playerByIdentity(provider: string, subject: string): Promise<string | null> {
    return this.linkRows.find((l) => l.provider === provider && l.subject === subject)?.playerId ?? null;
  }
  async addLink(l: IdentityLink): Promise<boolean> {
    if (this.linkRows.some((x) => (x.provider === l.provider && x.subject === l.subject) || (x.playerId === l.playerId && x.provider === l.provider))) return false;
    this.linkRows.push(clone(l));
    return true;
  }
  async removeLink(playerId: string, provider: string): Promise<void> {
    this.linkRows = this.linkRows.filter((l) => !(l.playerId === playerId && l.provider === provider));
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
    const since = q.lockedSince;
    const locked = new Set(since === null ? [] : [...this.tickets.values()].filter((t) => !t.used && t.defenderId && t.createdAt > since).map((t) => t.defenderId));
    return [...this.players.values()]
      .filter((p) => p.base && !q.excludeIds.includes(p.id) && !locked.has(p.id) && p.shieldUntil <= q.now)
      .filter((p) => p.hallLevel >= q.minHall && p.hallLevel <= q.maxHall && p.trophies >= q.minTrophies && p.trophies <= q.maxTrophies)
      .slice(0, q.limit)
      .map(clone);
  }
  async topPlayers(limit: number): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.base).sort((a, b) => b.trophies - a.trophies || a.createdAt - b.createdAt).slice(0, limit).map(clone);
  }
  async rankOf(trophies: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => p.base && p.trophies > trophies).length;
  }
  async playersByIds(ids: string[]): Promise<Player[]> {
    return ids.map((id) => this.players.get(id)).filter((p): p is Player => Boolean(p)).map(clone);
  }
  async rankedPlayers(): Promise<{ id: string; trophies: number; createdAt: number }[]> {
    return [...this.players.values()].filter((p) => p.base).map((p) => ({ id: p.id, trophies: p.trophies, createdAt: p.createdAt }));
  }
  private putBase(base: BaseLayout, at: number): string {
    const hash = contentHash(base);
    const known = this.bases.get(hash);
    if (known) known.lastUsedAt = Math.max(known.lastUsedAt, at);
    else this.bases.set(hash, { base: clone(base), createdAt: at, lastUsedAt: at });
    return hash;
  }
  private withBase<T extends { baseHash: string }>(row: T): Omit<T, 'baseHash'> & { base: BaseLayout } {
    const { baseHash, ...rest } = clone(row);
    return { ...rest, base: clone(this.bases.get(baseHash)!.base) };
  }
  async createTicket(t: Ticket): Promise<void> {
    const { base, ...rest } = clone(t);
    this.tickets.set(t.id, { ...rest, baseHash: this.putBase(base, t.createdAt) });
  }
  async getTicket(id: string): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    return t ? this.withBase(t) : null;
  }
  async useTicket(id: string, response?: unknown): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.used) return false;
    t.used = true;
    if (response !== undefined) t.response = clone(response);
    return true;
  }
  async addAttack(a: AttackRecord): Promise<void> {
    const { base, ...rest } = clone(a);
    this.attacks.push({ ...rest, baseHash: this.putBase(base, a.at) });
  }
  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    return this.attacks
      .filter((a) => a.defenderId === defenderId && a.at > since)
      .slice(-limit)
      .map((a) => this.withBase(a));
  }
  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return this.attacks.filter((a) => a.attackerId === attackerId && a.at > since).map((a) => a.defenderId);
  }
  async prune(c: PruneCutoffs): Promise<PruneResult> {
    const attacks = this.attacks.length;
    this.attacks = this.attacks.filter((a) => a.at >= c.recordsBefore);
    let tickets = 0;
    for (const [id, t] of this.tickets) {
      if (t.createdAt < c.recordsBefore || (!t.used && t.expiresAt < c.staleBefore)) {
        this.tickets.delete(id);
        tickets++;
      }
    }
    const used = new Set([...[...this.tickets.values()].map((t) => t.baseHash), ...this.attacks.map((a) => a.baseHash)]);
    let bases = 0;
    for (const [hash, b] of this.bases) {
      if (!used.has(hash) && b.lastUsedAt < c.staleBefore) {
        this.bases.delete(hash);
        bases++;
      }
    }
    const reports = this.reportRows.length;
    const before = c.resolvedReportsBefore;
    if (before !== undefined) this.reportRows = this.reportRows.filter((r) => r.status === 'open' || (r.resolvedAt ?? 0) >= before);
    const commands = this.commandRows.length;
    const cmdBefore = c.commandsBefore;
    if (cmdBefore !== undefined) this.commandRows = this.commandRows.filter((r) => r.at >= cmdBefore);
    let idempotency = 0;
    const idemBefore = c.idempotencyBefore;
    if (idemBefore !== undefined) {
      for (const [k, r] of this.idempotencyRows) {
        if (r.createdAt < idemBefore) {
          this.idempotencyRows.delete(k);
          idempotency++;
        }
      }
    }
    return { attacks: attacks - this.attacks.length, tickets, bases, reports: reports - this.reportRows.length, commands: commands - this.commandRows.length, idempotency };
  }
  async deletePlayer(id: string, name: string, at: number): Promise<void> {
    const D = DELETED_PLAYER;
    for (const [k, t] of this.tickets) {
      if (t.attackerId === id) this.tickets.delete(k);
      else if (t.defenderId === id) t.defenderId = null;
    }
    this.attacks = this.attacks.filter((a) => a.defenderId !== id);
    for (const a of this.attacks) if (a.attackerId === id) Object.assign(a, { attackerId: D.id, attackerName: D.name });
    this.memberRows = this.memberRows.filter((m) => m.playerId !== id);
    const notices = noticesNaming(name);
    this.chatRows = this.chatRows.filter((c) => c.playerId !== id && !(c.kind === 'system' && c.playerId === null && notices(c.text)));
    const giftNote = ` to ${name}.`;
    for (const c of this.chatRows) if (c.kind === 'donation' && c.text.endsWith(giftNote)) c.text = `${c.text.slice(0, -giftNote.length)} to ${D.name}.`;
    this.donations = this.donations.filter((d) => d.toId !== id);
    for (const d of this.donations) if (d.fromId === id) Object.assign(d, { fromId: D.id, fromName: D.name });
    for (const [k, r] of this.requestRows) if (r.playerId === id) this.requestRows.delete(k);
    for (const a of this.raidAttackRows) if (a.attackerId === id) a.attackerId = D.id;
    this.claims = this.claims.filter((c) => c.playerId !== id);
    for (const p of this.pairings) {
      for (const e of p.roster) if (e.playerId === id) Object.assign(e, { playerId: null, name: D.name, base: { ...e.base, name: D.name } });
    }
    // Blocks either way go; their own reports go; reports about them are closed and lose the evidence text.
    this.blockRows = this.blockRows.filter((b) => b.playerId !== id && b.blockedId !== id);
    // A server-held village, its ledger and command log, other devices' tokens and linked sign-ins are only theirs.
    this.villageRows.delete(id);
    this.tokenRows = this.tokenRows.filter((t) => t.playerId !== id);
    this.linkRows = this.linkRows.filter((l) => l.playerId !== id);
    this.ledgerRows = this.ledgerRows.filter((l) => l.playerId !== id);
    this.commandRows = this.commandRows.filter((c) => c.playerId !== id);
    this.reportRows = this.reportRows.filter((r) => r.reporterId !== id);
    for (const r of this.reportRows) {
      if (r.targetId !== id) continue;
      Object.assign(r, { targetId: D.id, targetName: D.name, text: null });
      if (r.status === 'open') Object.assign(r, { status: 'dismissed', resolution: 'Account deleted.', resolvedAt: at });
    }
    this.players.delete(id);
  }
  async addDeletionRequest(r: DeletionRequest): Promise<void> {
    this.deletionRows.push(clone(r));
  }
  async deletionRequests(status: 'open' | 'all', limit: number): Promise<DeletionRequest[]> {
    return this.deletionRows.filter((r) => status === 'all' || r.status === 'open').slice(0, limit).map(clone);
  }
  async getDeletionRequest(id: string): Promise<DeletionRequest | null> {
    const r = this.deletionRows.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async resolveDeletionRequest(id: string, status: 'done' | 'rejected', resolution: string, at: number): Promise<boolean> {
    const r = this.deletionRows.find((x) => x.id === id);
    if (!r || r.status !== 'open') return false;
    Object.assign(r, { status, resolution, resolvedAt: at });
    return true;
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
    return this.chatRows.filter((c) => c.groveId === groveId && c.seq > afterSeq && !c.hidden).slice(-limit).map(clone);
  }
  async getChat(id: string): Promise<ChatRow | null> {
    const c = this.chatRows.find((x) => x.id === id);
    return c ? clone(c) : null;
  }
  async setChatHidden(id: string, hidden: boolean): Promise<void> {
    const c = this.chatRows.find((x) => x.id === id);
    if (c) c.hidden = hidden;
  }
  async hiddenChatIds(groveId: string, lastN: number): Promise<string[]> {
    return this.chatRows.filter((c) => c.groveId === groveId).slice(-lastN).filter((c) => c.hidden).map((c) => c.id);
  }
  async addReport(r: Report): Promise<boolean> {
    if (this.reportRows.some((x) => x.status === 'open' && x.reporterId === r.reporterId && x.targetId === r.targetId && (x.messageId ?? '') === (r.messageId ?? ''))) return false;
    this.reportRows.push(clone(r));
    return true;
  }
  async reports(status: 'open' | 'all', limit: number): Promise<Report[]> {
    return this.reportRows.filter((r) => status === 'all' || r.status === 'open').slice(0, limit).map(clone);
  }
  async getReport(id: string): Promise<Report | null> {
    const r = this.reportRows.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async openReportsOn(messageId: string): Promise<Report[]> {
    return this.reportRows.filter((r) => r.status === 'open' && r.messageId === messageId).map(clone);
  }
  async resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string, at: number): Promise<boolean> {
    const r = this.reportRows.find((x) => x.id === id);
    if (!r || r.status !== 'open') return false;
    Object.assign(r, { status, resolution, resolvedAt: at });
    return true;
  }
  async addBlock(b: Block): Promise<void> {
    this.blockRows = this.blockRows.filter((x) => !(x.playerId === b.playerId && x.blockedId === b.blockedId));
    this.blockRows.push(clone(b));
  }
  async removeBlock(playerId: string, blockedId: string): Promise<void> {
    this.blockRows = this.blockRows.filter((x) => !(x.playerId === playerId && x.blockedId === blockedId));
  }
  async blocksOf(playerId: string): Promise<Block[]> {
    return this.blockRows
      .filter((b) => b.playerId === playerId)
      .sort((a, b) => b.at - a.at)
      .map(clone);
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
}
