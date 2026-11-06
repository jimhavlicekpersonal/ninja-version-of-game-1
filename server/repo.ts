/**
 * The server's storage port. Postgres in production (pgRepo.ts), memory in
 * tests and local dev (MemoryRepo below). A future server can add another
 * adapter (any database) by implementing Repo; tests/server/repo.test.ts runs
 * the same checks against every adapter.
 */
import type { BaseLayout, BattleResult, Deployment } from '../src/gameplay/sim/battle/types';
import type { GroveRole, ReportReason } from '../src/backend/net/protocol';
import type { Rating } from '../src/gameplay/sim/rating';
import type { AgeBand } from '../src/gameplay/sim/age';
import { contentHash } from './contentHash';
import { isolateName } from '../src/gameplay/sim/social/names';

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
  /** Why (shown with the mute, with how to appeal; re-audit, EU DSA art. 17). */
  muteReason?: string | null;
  /** Hidden matchmaking ratings (roadmap Phase 3); absent means not rated yet. */
  ratings?: { attack: Rating; base: Rating };
  /** Honor lost as a defender on one UTC day (the daily cap). */
  honorLoss?: { day: number; lost: number };
  /** Suspended by staff until this time (0 or absent: not banned). Banned players are not matched or ranked. */
  bannedUntil?: number;
  banReason?: string | null;
  /**
   * Names (roadmap step 59): `name` is unique by this key (lower case,
   * space/_/- the same; `nameKey` in src/backend/net/names.ts). Absent only on
   * players from before step 59 until the name migration gives them one.
   */
  nameKey?: string;
  /** The name before the last change, and when it changed ("formerly …" for 28 days). */
  previousName?: string | null;
  nameChangedAt?: number;
  /** Changes that skip the 28-day wait (one after the name migration). */
  freeRenames?: number;
  /** Who may find them by name (default everyone). */
  findable?: import('../src/backend/net/protocol').Findable;
  /** Friends see when they were last online (default true). */
  showOnline?: boolean;
  /** Their friend code ("KAGE-XXXXXX"), made on first use. */
  friendCode?: string | null;
  /** Staff and official accounts (a badge nobody else can get). */
  staff?: boolean;
  /** The layout friends duel against (step 62); null or absent: their village. */
  duelBase?: BaseLayout | null;
  /** When they last left a Gang (step 63: 24 hours before joining another). */
  squadLeftAt?: number;
  /** Runtime only, never stored: the token hash this request came with (set by `authenticate`). */
  session?: string;
}

export type PlayerPatch = Partial<Pick<Player, 'name' | 'trophies' | 'hallLevel' | 'shieldUntil' | 'base' | 'groveId' | 'updatedAt' | 'lastSeenAt' | 'mutedUntil' | 'muteReason' | 'ratings' | 'honorLoss' | 'bannedUntil' | 'banReason' | 'nameKey' | 'previousName' | 'nameChangedAt' | 'freeRenames' | 'findable' | 'showOnline' | 'friendCode' | 'staff' | 'duelBase' | 'squadLeftAt'>>;

/** Two players asked to change to the same name at once: the second one gets this (the store's unique key said no). */
export class NameTakenError extends Error {
  constructor() {
    super('That name was just taken.');
  }
}

/** A Friendly Duel, kept 30 days with its replay (roadmap step 62). Never pays and never moves a rating. */
export interface DuelRecord {
  id: string;
  at: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  challengeId: string | null;
  seed: number;
  army: Record<string, number>;
  levels: Record<string, number>;
  base: BaseLayout;
  deployments: Deployment[];
  endTick?: number;
  result: BattleResult;
  rules: number;
}

/** One direction of a rivalry: how `attackerId` did against `defenderId`. */
export interface DuelTally {
  attackerId: string;
  defenderId: string;
  duels: number;
  wins: number;
  bestStars: number;
  bestDestruction: number;
}

/** A duel challenge: both attack each other within 24 h. */
export interface DuelChallenge {
  id: string;
  fromId: string;
  toId: string;
  createdAt: number;
  expiresAt: number;
  fromResult: { stars: number; destruction: number } | null;
  toResult: { stars: number; destruction: number } | null;
}

/** A Gang of 2-4 friends (roadmap step 63). Its chat and troop requests use the Alliance tables with the Gang's id. */
export interface Squad {
  id: string;
  name: string;
  createdAt: number;
  /** Gang Rating (step 66); absent until the first war. */
  rating?: Rating;
}
export interface SquadMember {
  playerId: string;
  squadId: string;
  role: 'leader' | 'member';
  joinedAt: number;
}
export interface SquadInvite {
  id: string;
  squadId: string;
  fromId: string;
  toId: string;
  at: number;
}

/** One base in a Gang War roster (a copy taken when the war starts, refreshed during prep). */
export interface GangWarEntry {
  index: number;
  /** Null for a generated (bot) Gang, or a member who deleted their account. */
  playerId: string | null;
  name: string;
  keep: number;
  base: BaseLayout;
}
export interface GangWarSide {
  squadId: string | null;
  name: string;
  bot: boolean;
  /** Seed of a bot Gang's attacks. */
  botSeed: number;
  roster: GangWarEntry[];
}
/** A Gang War (roadmap step 65). */
export interface GangWar {
  id: string;
  createdAt: number;
  prepEndsAt: number;
  endsAt: number;
  size: number;
  a: GangWarSide;
  b: GangWarSide;
  /** The Gang Ratings were updated after it ended (step 66; never for a bot war). */
  rated: boolean;
  /** Pushes already sent (step 68): the battle day began; 2 hours left. */
  notified?: { battle?: boolean; ending?: boolean };
}
export interface GangWarAttack {
  id: string;
  warId: string;
  /** The attacking side. */
  side: 'a' | 'b';
  attackerId: string;
  target: number;
  relay: boolean;
  stars: number;
  destruction: number;
  at: number;
}
/** A relay assault on one base: the damage so far, and who holds the next strike. */
export interface GangRelay {
  warId: string;
  side: 'a' | 'b';
  target: number;
  damage: Record<string, number>;
  stars: number;
  destruction: number;
  strikes: number;
  lastBy: string | null;
  holder: string | null;
  holdUntil: number;
}
export interface GangQueueEntry {
  squadId: string;
  size: number;
  rating: number;
  power: number;
  /** Alliance ids of the members (a Gang mostly from one Alliance is not paired with that Alliance's Gangs). */
  alliances: (string | null)[];
  queuedAt: number;
}

/** A friend request (roadmap step 59). */
export interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  at: number;
}

/** One thing staff did (the admin tool, roadmap step 48). */
export interface StaffAction {
  id: string;
  at: number;
  /** Who (the X-Staff-Name the admin tool sends). */
  actor: string;
  action: string;
  playerId: string | null;
  detail: Record<string, unknown>;
}

export interface Ticket {
  id: string;
  kind: 'pvp' | 'raid' | 'duel' | 'war';
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
  /**
   * Raid tickets of a server-held village (ledger audit A1/E15): the village's
   * scout seed when the ticket was issued. The same scout gets the same ticket
   * back; a new opponent needs a new (paid) scout.
   */
  scoutSeed?: number;
  /**
   * The battle rules (SIM_RULES) and data version the ticket was issued under
   * (roadmap step 73): the report is re-simulated with that engine. Absent on
   * tickets from before protocol 8 (the live engine).
   */
  rules?: number;
  dataVersion?: string;
  /** Duel tickets for a challenge (step 62). */
  challengeId?: string;
  /** Gang War tickets (step 65): the war, whether it is a relay strike, and the damage it starts from. */
  warId?: string;
  relay?: boolean;
  startDamage?: Record<string, number>;
  /** Grove Raid tickets only. */
  week?: number;
  groveId?: string;
  target?: number;
  /** The answer given when the ticket was used, so a repeated report gets the same answer (idempotent). */
  response?: unknown;
  /** When the game said this battle started (the player tapped Attack): from then on it counts (re-audit). */
  startedAt?: number;
  /** Reports refused after a re-simulation; the ticket is burned after MAX_TICKET_FAILURES. */
  failures?: number;
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
/** One statistics id's history, as the daily rollup needs it (report section 5 step 5). */
export interface StatsInstallSummary {
  install: string;
  /** The experiment arm of its first event ('' for none). */
  arm: string;
  /** UTC day of its first event. */
  firstDay: number;
  firstAt: number;
  /** Every UTC day it sent an event from. */
  days: number[];
  tutorialDone: boolean;
  firstRaidAt: number | null;
  firstPurchaseAt: number | null;
}

/** One install day and arm in the daily table. */
export interface StatsDailyRow {
  day: number;
  arm: string;
  installs: number;
  d1: number;
  d7: number;
  d30: number;
  tutorialDone: number;
  raided7: number;
  payers7: number;
  computedAt: number;
}

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
  /** The last command number processed per sending device (GLOBAL-009); absent before any device-numbered batch. */
  deviceSeqs?: Record<string, number>;
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
  /** Sign in with Apple: the refresh token from the authorization code, to revoke on deletion/unlink (re-audit). */
  refreshToken?: string | null;
  /** The client id (bundle id or Services ID) the refresh token was issued to. */
  clientId?: string | null;
}

/** A notice to a player (re-audit, EU DSA art. 16(5)/17): a report's outcome, or a decision about them. */
export interface PlayerNotice {
  id: string;
  playerId: string;
  at: number;
  kind: 'report_outcome' | 'moderation_action' | 'account';
  text: string;
  read: boolean;
}

/** A device token (each sign-in on another device gets its own). */
export interface TokenRow {
  tokenHash: string;
  playerId: string;
  createdAt: number;
  label: string;
  /** The sign-in provider that issued it (null: registration, or from before migration 0024). */
  provider?: string | null;
  lastUsedAt?: number | null;
}

/** A store purchase the server checked (roadmap steps 35-37): each store transaction once. */
export interface PurchaseRow {
  store: 'apple' | 'google';
  /** Apple's transactionId, Google's order id (or a hash of the token). */
  transactionId: string;
  playerId: string;
  /** The game's product id. */
  productId: string;
  /** The game's USD price, in cents (for the under-18 cap and refund rates; the store's own price may differ). */
  cents: number;
  at: number;
  /** 'Production', 'Sandbox' (Apple), 'Test' (Google license testers). */
  environment: string;
  status: 'credited' | 'refunded';
  refundedAt: number | null;
  /** What refund notices name: Apple's originalTransactionId, Google's purchase token. */
  ref: string;
  /** Delivered into a village the server holds (else the device delivered it). */
  heldOnServer: boolean;
  /** Storefront country, currency and price in micros as the store reported them (re-audit; absent before migration 0023). */
  storefront?: string | null;
  currency?: string | null;
  priceMicros?: number | null;
}

/** Asked before paying: the age cap was checked, and the store purchase carries this id back (Apple appAccountToken, Google obfuscatedAccountId). */
export interface PurchaseIntent {
  id: string;
  playerId: string;
  productId: string;
  cents: number;
  at: number;
  used: boolean;
  /**
   * Until when this intent holds its share of an under-18 player's monthly cap
   * (GLOBAL-005): `at` + 30 min when asked; now when the purchase was
   * cancelled; longer while a store reports it pending (Ask to Buy).
   */
  holdUntil: number;
}

/** What a village move held back because the server could not confirm where it came from (GLOBAL-002). */
export interface ImportHold {
  id: string;
  playerId: string;
  at: number;
  jade: number;
  /** A premium Season Scroll with no purchase this server checked. */
  premium: boolean;
  /** Purchase records in the village that this server never credited (ids as the village has them). */
  purchases: string[];
  status: 'held' | 'resolved';
}

/** A device that receives server push (roadmap step 40). */
export interface PushToken {
  token: string;
  playerId: string;
  platform: 'ios' | 'android';
  /** Notification types this device switched on, and its time zone (Date#getTimezoneOffset). */
  types: string[];
  tzOffsetMinutes: number;
  updatedAt: number;
  /** Pushes sent on local day `day` (for `maxPerDay`). */
  day: number;
  sent: number;
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
  /** The request carried the player's one-time deletion code (re-audit): staff may carry it out. */
  verified?: boolean;
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
  /** Unused tickets that expired before this go (defaults to `staleBefore`; later for raids that may still be reported late). */
  ticketsBefore?: number;
  /** Handled reports (with their evidence) resolved before this time are deleted. */
  resolvedReportsBefore?: number;
  /** Handled account-deletion requests resolved before this time are deleted (re-audit: they were kept for ever). */
  deletionRequestsBefore?: number;
  /** Command log lines before this time are deleted (the ledger is kept). */
  commandsBefore?: number;
  /** Remembered answers to Idempotency-Keys from before this time are forgotten. */
  idempotencyBefore?: number;
  /** Purchase intents from before this time are forgotten (a purchase that comes later is still credited, without the age-cap reservation). */
  intentsBefore?: number;
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
  addToken(playerId: string, tokenHash: string, at: number, label: string, provider?: string): Promise<void>;
  linksOf(playerId: string): Promise<IdentityLink[]>;
  playerByIdentity(provider: string, subject: string): Promise<string | null>;
  /** False if that sign-in is linked to someone, or this player already has one from that provider. */
  addLink(l: IdentityLink): Promise<boolean>;
  removeLink(playerId: string, provider: string): Promise<void>;
  // staff tools (roadmap step 48)
  /** Players whose id is `q`, or whose name starts with `q` (any case). */
  searchPlayers(q: string, limit: number): Promise<Player[]>;
  addStaffAction(a: StaffAction): Promise<void>;
  /** Newest first; one player's, or everyone's. */
  staffActions(playerId: string | null, limit: number): Promise<StaffAction[]>;
  // purchases (roadmap Phase 4)
  /** False (nothing stored) if that store transaction is already recorded. */
  addPurchase(p: PurchaseRow): Promise<boolean>;
  getPurchase(store: string, transactionId: string): Promise<PurchaseRow | null>;
  purchaseByRef(store: string, ref: string): Promise<PurchaseRow | null>;
  /** Newest first. */
  purchasesOf(playerId: string, limit: number): Promise<PurchaseRow[]>;
  /** False if it already had that status. */
  setPurchaseStatus(store: string, transactionId: string, status: PurchaseRow['status'], at: number): Promise<boolean>;
  /** Cents of credited purchases since `since`, plus unused intents still holding at `now` (reserved by the age cap). */
  spentCents(playerId: string, since: number, now: number): Promise<number>;
  /**
   * Serialise a player's purchase intents (GLOBAL-004): inside a transaction,
   * only one request per player gets past this until it commits, on any
   * instance (Postgres advisory lock; memory transactions already run one at a
   * time). Outside a transaction it does nothing.
   */
  lockPurchases(playerId: string): Promise<void>;
  /**
   * Inside a transaction: hold this player until it ends (ledger audit A6: two raid reports, or a report
   * and a forfeit, read and wrote one player's honor and village at the same time). Lock several players
   * in ascending id order (`lockPlayers` in core/pvp.ts) so two transactions never wait on each other.
   */
  lockPlayer(playerId: string): Promise<void>;
  /**
   * Claim a periodic job (retention, voided purchases, Gang War reminders) for
   * `leaseMs`: true when this holder may run it now (no lease, a lapsed one,
   * or its own). One instance runs each job; another takes over when a lease
   * lapses (report section 5 step 2, backend A21; migration 0026).
   */
  claimJob(name: string, holder: string, now: number, leaseMs: number): Promise<boolean>;
  // shared play statistics (report section 5 step 5, migration 0027): no player id, no IP address
  /** Keep cleaned events under a statistics id; resolves how many were kept. */
  addStatsEvents(install: string, build: string, arm: string, events: import('../src/backend/net/stats').StatsEvent[], receivedAt: number): Promise<number>;
  /** Forget everything one statistics id sent; resolves how many events went. */
  deleteStats(install: string): Promise<number>;
  /** Statistics ids whose first event fell on UTC days [fromDay, toDay]. */
  statsInstalls(fromDay: number, toDay: number): Promise<StatsInstallSummary[]>;
  /** Replace the daily table's rows for days [fromDay, toDay] with `rows`. */
  putStatsDaily(fromDay: number, toDay: number, rows: StatsDailyRow[]): Promise<void>;
  statsDaily(fromDay: number, toDay: number): Promise<StatsDailyRow[]>;
  /** Drop events that arrived before `before`; resolves how many. */
  pruneStats(before: number): Promise<number>;
  addIntent(i: PurchaseIntent): Promise<void>;
  getIntent(id: string): Promise<PurchaseIntent | null>;
  useIntent(id: string): Promise<void>;
  /** Set an unused intent's hold (the player's own only); false when nothing changed. */
  holdIntent(id: string, playerId: string, holdUntil: number): Promise<boolean>;
  /** The age group the server keeps for a player (GLOBAL-006), or null when never stated. */
  getAgeGroup(playerId: string): Promise<{ under18: boolean; at: number } | null>;
  setAgeGroup(playerId: string, under18: boolean | null, at: number): Promise<void>;
  addImportHold(h: ImportHold): Promise<void>;
  /** Newest first. */
  importHoldsOf(playerId: string): Promise<ImportHold[]>;
  // push (roadmap step 40)
  /** Adds or refreshes a device (a token that moved to another player now belongs to them). */
  putPushToken(t: Omit<PushToken, 'day' | 'sent'>): Promise<void>;
  pushTokensOf(playerId: string): Promise<PushToken[]>;
  removePushToken(token: string): Promise<void>;
  /** Count one push sent on local day `day`. */
  countPush(token: string, day: number): Promise<void>;
  /** Players by id, in the order asked (missing ones left out). */
  playersByIds(ids: string[]): Promise<Player[]>;
  /** The Power Ranking (step 31): players with a base and at least `minBattles` rated attacks, by attack rating + beta x (Keep - 1). */
  topByPower(limit: number, minBattles: number, beta: number): Promise<Player[]>;
  /** 1 + players on the Power Ranking above this power. */
  powerRankOf(power: number, minBattles: number, beta: number): Promise<number>;
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
  /** Mark an unused ticket started (first call wins); false when it is used or unknown. */
  startTicket(id: string, at: number): Promise<boolean>;
  /** Count one refused report on a ticket; returns the new count. */
  bumpTicketFailures(id: string): Promise<number>;
  /** This attacker's unused tickets of a kind (any expiry, newest first). */
  openTickets(attackerId: string, kind: Ticket['kind']): Promise<Ticket[]>;
  /** Unused tickets of a kind that expired before `before` (oldest first), to settle as forfeits. */
  expiredOpenTickets(kind: Ticket['kind'], before: number, limit: number): Promise<Ticket[]>;
  /** A store refund or void we heard about for a purchase we had not recorded (re-audit). */
  addRefundNotice(store: string, key: string, at: number, why: string): Promise<void>;
  refundNotice(store: string, key: string): Promise<{ at: number; why: string } | null>;
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
  // account protections (re-audit: minors, sessions, Apple tokens, deletion codes, notices)
  /** The age band the server keeps (with the older under18 answer); null when never stated. */
  getAgeBand(playerId: string): Promise<{ band: AgeBand | null; under18: boolean; at: number } | null>;
  /** Store a band (under18 follows it). The core checks that it only gets stricter. */
  setAgeBand(playerId: string, band: AgeBand, at: number): Promise<void>;
  /** A device token was used (at most about once a minute per player). */
  touchToken(tokenHash: string, at: number): Promise<void>;
  /** Sign out the devices a provider's sign-in made (unlink), except `except`; how many. */
  revokeTokens(playerId: string, provider: string, except?: string): Promise<number>;
  /** Sign out every device but `keepHash` (which becomes the player's main token); how many. */
  revokeOtherTokens(playerId: string, keepHash: string): Promise<number>;
  /** Delete extra device tokens last used (or made) before this time; how many. */
  pruneTokens(unusedBefore: number): Promise<number>;
  setLinkToken(provider: string, subject: string, refreshToken: string | null, clientId: string | null): Promise<void>;
  /** Links of this player that hold a refresh token. */
  linkTokensOf(playerId: string): Promise<{ provider: string; subject: string; refreshToken: string; clientId: string | null }[]>;
  setDeletionCode(playerId: string, codeHash: string, at: number, expiresAt: number): Promise<void>;
  deletionCodeOf(playerId: string): Promise<{ codeHash: string; expiresAt: number } | null>;
  clearDeletionCode(playerId: string): Promise<void>;
  addNotice(n: PlayerNotice): Promise<void>;
  /** Newest first. */
  noticesOf(playerId: string, limit: number): Promise<PlayerNotice[]>;
  markNoticesRead(playerId: string, ids: string[]): Promise<void>;
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
  // names and friends (roadmap step 59)
  /** The player whose name has this key (names.ts `nameKey`). */
  playerByNameKey(key: string): Promise<Player | null>;
  playerByFriendCode(code: string): Promise<Player | null>;
  /** A released name still kept for its previous owner, if `now` is before the hold ends. */
  nameHold(key: string, now: number): Promise<{ playerId: string; until: number } | null>;
  /** Keep a released name for its previous owner until `until` (replaces an older hold on it). */
  holdName(key: string, playerId: string, until: number): Promise<void>;
  /** Players from before step 59 with no name key yet, oldest first (the name migration). */
  playersWithoutNameKey(limit: number): Promise<Player[]>;
  addFriendship(a: string, b: string, at: number): Promise<void>;
  removeFriendship(a: string, b: string): Promise<void>;
  /** Friends of a player, with when the friendship started. */
  friendsOf(playerId: string): Promise<{ id: string; since: number }[]>;
  addFriendRequest(r: FriendRequest): Promise<void>;
  getFriendRequest(id: string): Promise<FriendRequest | null>;
  /** Requests to or from the player made after `since` (older ones have lapsed). */
  friendRequestsOf(playerId: string, since: number): Promise<FriendRequest[]>;
  deleteFriendRequest(id: string): Promise<void>;
  /** Every request between two players, either way (on becoming friends, or a block). */
  deleteFriendRequestsBetween(a: string, b: string): Promise<void>;
  /** Retention: requests made before `before`; returns how many went. */
  pruneFriendRequests(before: number): Promise<number>;
  // duels (roadmap step 62)
  addDuel(d: DuelRecord): Promise<void>;
  /** Duels the player fought or defended after `since`, newest first. */
  duelsOf(playerId: string, since: number, limit: number): Promise<DuelRecord[]>;
  /** Add one duel to the attacker's tally against the defender. */
  bumpDuelTally(attackerId: string, defenderId: string, won: boolean, stars: number, destruction: number): Promise<void>;
  /** Every tally the player is in, either side. */
  duelTallies(playerId: string): Promise<DuelTally[]>;
  addChallenge(c: DuelChallenge): Promise<void>;
  getChallenge(id: string): Promise<DuelChallenge | null>;
  /** Challenges to or from the player created after `since`. */
  challengesOf(playerId: string, since: number): Promise<DuelChallenge[]>;
  /** Record one side's attack; false if that side already attacked. */
  setChallengeResult(id: string, side: 'from' | 'to', r: { stars: number; destruction: number }): Promise<boolean>;
  /** Retention: duels and challenges from before `before`. */
  pruneDuels(before: number): Promise<number>;
  // Gangs (roadmap step 63)
  createSquad(s: Squad): Promise<void>;
  getSquad(id: string): Promise<Squad | null>;
  updateSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'rating'>>): Promise<void>;
  deleteSquad(id: string): Promise<void>;
  squadMembers(squadId: string): Promise<SquadMember[]>;
  squadOf(playerId: string): Promise<SquadMember | null>;
  /** False if the player is already in a Gang. */
  addSquadMember(m: SquadMember): Promise<boolean>;
  removeSquadMember(playerId: string): Promise<void>;
  setSquadRole(playerId: string, role: SquadMember['role']): Promise<void>;
  addSquadInvite(i: SquadInvite): Promise<void>;
  getSquadInvite(id: string): Promise<SquadInvite | null>;
  /** Invites to the player made after `since`. */
  squadInvitesTo(playerId: string, since: number): Promise<SquadInvite[]>;
  /** Invites a Gang sent after `since`. */
  squadInvitesFrom(squadId: string, since: number): Promise<SquadInvite[]>;
  deleteSquadInvite(id: string): Promise<void>;
  /** Every invite to the player (on joining a Gang) or from a Gang (when it closes). */
  deleteSquadInvitesTo(playerId: string): Promise<void>;
  deleteSquadInvitesFrom(squadId: string): Promise<void>;
  // Gang Wars (roadmap steps 65-66)
  createWar(w: GangWar): Promise<void>;
  getWar(id: string): Promise<GangWar | null>;
  updateWar(id: string, patch: Partial<Pick<GangWar, 'a' | 'b' | 'notified'>>): Promise<void>;
  /** Wars that have not ended at `now` (the reminder job). */
  activeWars(now: number, limit: number): Promise<GangWar[]>;
  /** Set `rated` once; false if it already was. */
  markWarRated(id: string): Promise<boolean>;
  /** The Gang's war that has not ended at `now`, if any. */
  activeWarOf(squadId: string, now: number): Promise<GangWar | null>;
  /** The Gang's latest wars, newest first. */
  warsOf(squadId: string, limit: number): Promise<GangWar[]>;
  addWarAttack(a: GangWarAttack): Promise<void>;
  warAttacks(warId: string): Promise<GangWarAttack[]>;
  getRelay(warId: string, side: 'a' | 'b', target: number): Promise<GangRelay | null>;
  /** Take the next relay strike on a base: false if someone else holds it until after `now`. */
  holdRelay(warId: string, side: 'a' | 'b', target: number, playerId: string, until: number, now: number): Promise<boolean>;
  /** Store a relay strike's result and free the base for the next striker. */
  putRelay(r: GangRelay): Promise<void>;
  enqueueGang(e: GangQueueEntry): Promise<boolean>;
  dequeueGang(squadId: string): Promise<boolean>;
  queuedGang(squadId: string): Promise<GangQueueEntry | null>;
  gangQueue(size: number): Promise<GangQueueEntry[]>;
  /** False if this player already claimed this war's chest. */
  addGangClaim(warId: string, playerId: string, outcome: string, at: number): Promise<boolean>;
  gangClaimed(warId: string, playerId: string): Promise<boolean>;
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
  /**
   * A batch that changed nothing (every command refused): store the next
   * revision, the command numbers (`seq`, `deviceSeqs` when given) and the log
   * lines, without rewriting the village file. False (nothing written) if the
   * stored revision is no longer `expectedRevision`.
   */
  recordVillageCommands(v: Pick<VillageRow, 'playerId' | 'revision' | 'seq' | 'updatedAt' | 'deviceSeqs'>, expectedRevision: number, commands: CommandLogRow[]): Promise<boolean>;
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
export function nameNoticePatterns(name: string): { exact: string[]; prefixes: string[] } {
  const names = [name, isolateName(name)];
  return {
    exact: names.flatMap((n) => [
      `${n} joined the Alliance. Say hello!`, `${n} left the Alliance.`, `${n} is the new leader.`,
      `${n} joined the Gang.`, `${n} left the Gang.`, `${n} leads the Gang now.`,
    ]),
    prefixes: names.map((n) => `${n} founded `),
  };
}

export function noticesNaming(name: string): (text: string) => boolean {
  const { exact, prefixes } = nameNoticePatterns(name);
  const matches = new Set(exact);
  return (text) => matches.has(text) || prefixes.some((p) => text.startsWith(p));
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
  nameHolds = new Map<string, { playerId: string; until: number }>();
  friendshipRows: { a: string; b: string; since: number }[] = [];
  friendRequestRows: FriendRequest[] = [];
  duelRows: DuelRecord[] = [];
  duelTallyRows: DuelTally[] = [];
  challengeRows: DuelChallenge[] = [];
  squadRows = new Map<string, Squad>();
  squadMemberRows: SquadMember[] = [];
  squadInviteRows: SquadInvite[] = [];
  warRows = new Map<string, GangWar>();
  warAttackRows: GangWarAttack[] = [];
  relayRows: GangRelay[] = [];
  gangQueueRows: GangQueueEntry[] = [];
  gangClaimRows: { warId: string; playerId: string; outcome: string; at: number }[] = [];
  villageRows = new Map<string, VillageRow>();
  tokenRows: TokenRow[] = [];
  deletionCodeRows = new Map<string, { codeHash: string; createdAt: number; expiresAt: number }>();
  noticeRows: PlayerNotice[] = [];
  linkRows: IdentityLink[] = [];
  purchaseRows: PurchaseRow[] = [];
  staffRows: StaffAction[] = [];
  intentRows: PurchaseIntent[] = [];
  ageRows = new Map<string, { under18: boolean; at: number; band?: AgeBand | null }>();
  importHoldRows: ImportHold[] = [];
  pushRows: PushToken[] = [];
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
  async recordVillageCommands(v: Pick<VillageRow, 'playerId' | 'revision' | 'seq' | 'updatedAt' | 'deviceSeqs'>, expectedRevision: number, commands: CommandLogRow[]): Promise<boolean> {
    const cur = this.villageRows.get(v.playerId);
    if (!cur || cur.revision !== expectedRevision) return false;
    this.villageRows.set(v.playerId, { ...cur, revision: v.revision, seq: v.seq, updatedAt: v.updatedAt, ...(v.deviceSeqs ? { deviceSeqs: clone(v.deviceSeqs) } : {}) });
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
    if (p.nameKey && [...this.players.values()].some((x) => x.nameKey === p.nameKey)) throw new NameTakenError();
    this.players.set(p.id, clone(p));
  }
  async playerByTokenHash(hash: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.tokenHash === hash) return clone(p);
    const t = this.tokenRows.find((x) => x.tokenHash === hash);
    const p = t ? this.players.get(t.playerId) : undefined;
    return p ? clone(p) : null;
  }
  async addToken(playerId: string, tokenHash: string, at: number, label: string, provider?: string): Promise<void> {
    this.tokenRows.push({ tokenHash, playerId, createdAt: at, label, provider: provider ?? null, lastUsedAt: null });
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
  async searchPlayers(q: string, limit: number): Promise<Player[]> {
    const lower = q.toLowerCase();
    return [...this.players.values()]
      .filter((p) => p.id === q || p.name.toLowerCase().startsWith(lower))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(clone);
  }
  async addStaffAction(a: StaffAction): Promise<void> {
    this.staffRows.push(clone(a));
  }
  async staffActions(playerId: string | null, limit: number): Promise<StaffAction[]> {
    return this.staffRows
      .filter((a) => playerId === null || a.playerId === playerId)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(clone);
  }
  async addPurchase(p: PurchaseRow): Promise<boolean> {
    if (this.purchaseRows.some((x) => x.store === p.store && x.transactionId === p.transactionId)) return false;
    this.purchaseRows.push(clone(p));
    return true;
  }
  async getPurchase(store: string, transactionId: string): Promise<PurchaseRow | null> {
    const p = this.purchaseRows.find((x) => x.store === store && x.transactionId === transactionId);
    return p ? clone(p) : null;
  }
  async purchaseByRef(store: string, ref: string): Promise<PurchaseRow | null> {
    const p = this.purchaseRows.find((x) => x.store === store && x.ref === ref);
    return p ? clone(p) : null;
  }
  async purchasesOf(playerId: string, limit: number): Promise<PurchaseRow[]> {
    return this.purchaseRows
      .filter((p) => p.playerId === playerId)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(clone);
  }
  async setPurchaseStatus(store: string, transactionId: string, status: PurchaseRow['status'], at: number): Promise<boolean> {
    const p = this.purchaseRows.find((x) => x.store === store && x.transactionId === transactionId);
    if (!p || p.status === status) return false;
    p.status = status;
    p.refundedAt = status === 'refunded' ? at : null;
    return true;
  }
  async spentCents(playerId: string, since: number, now: number): Promise<number> {
    const bought = this.purchaseRows.filter((p) => p.playerId === playerId && p.status === 'credited' && p.at >= since).reduce((s, p) => s + p.cents, 0);
    const held = this.intentRows.filter((i) => i.playerId === playerId && !i.used && i.holdUntil > now).reduce((s, i) => s + i.cents, 0);
    return bought + held;
  }
  async lockPurchases(): Promise<void> {
    /* memory transactions already run one at a time */
  }
  async lockPlayer(): Promise<void> {
    /* memory transactions already run one at a time */
  }
  statsRows: { install: string; day: number; name: string; at: number; props: Record<string, unknown>; build: string; arm: string; receivedAt: number }[] = [];
  statsDailyRows: StatsDailyRow[] = [];
  async addStatsEvents(install: string, build: string, arm: string, events: import('../src/backend/net/stats').StatsEvent[], receivedAt: number): Promise<number> {
    for (const e of events) this.statsRows.push({ install, day: Math.floor(e.at / 86_400_000), name: e.name, at: e.at, props: clone(e.props), build, arm, receivedAt });
    return events.length;
  }
  async deleteStats(install: string): Promise<number> {
    const before = this.statsRows.length;
    this.statsRows = this.statsRows.filter((r) => r.install !== install);
    return before - this.statsRows.length;
  }
  async statsInstalls(fromDay: number, toDay: number): Promise<StatsInstallSummary[]> {
    const by = new Map<string, typeof this.statsRows>();
    for (const r of this.statsRows) by.set(r.install, [...(by.get(r.install) ?? []), r]);
    const out: StatsInstallSummary[] = [];
    for (const [install, rows] of by) {
      rows.sort((a, b) => a.at - b.at);
      const firstDay = Math.min(...rows.map((r) => r.day));
      if (firstDay < fromDay || firstDay > toDay) continue;
      const firstOf = (name: string) => rows.find((r) => r.name === name)?.at ?? null;
      out.push({
        install,
        arm: rows[0].arm,
        firstDay,
        firstAt: rows[0].at,
        days: [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b),
        tutorialDone: rows.some((r) => r.name === 'tutorial_step' && r.props.done === true),
        firstRaidAt: firstOf('raid_end'),
        firstPurchaseAt: firstOf('purchase'),
      });
    }
    return out;
  }
  async putStatsDaily(fromDay: number, toDay: number, rows: StatsDailyRow[]): Promise<void> {
    this.statsDailyRows = [...this.statsDailyRows.filter((r) => r.day < fromDay || r.day > toDay), ...clone(rows)];
  }
  async statsDaily(fromDay: number, toDay: number): Promise<StatsDailyRow[]> {
    return clone(this.statsDailyRows.filter((r) => r.day >= fromDay && r.day <= toDay).sort((a, b) => a.day - b.day || a.arm.localeCompare(b.arm)));
  }
  async pruneStats(before: number): Promise<number> {
    const n = this.statsRows.length;
    this.statsRows = this.statsRows.filter((r) => r.receivedAt >= before);
    return n - this.statsRows.length;
  }
  private jobLeases = new Map<string, { holder: string; until: number }>();
  async claimJob(name: string, holder: string, now: number, leaseMs: number): Promise<boolean> {
    const l = this.jobLeases.get(name);
    if (l && l.until > now && l.holder !== holder) return false;
    this.jobLeases.set(name, { holder, until: now + leaseMs });
    return true;
  }
  async holdIntent(id: string, playerId: string, holdUntil: number): Promise<boolean> {
    const i = this.intentRows.find((x) => x.id === id && x.playerId === playerId && !x.used);
    if (!i || i.holdUntil === holdUntil) return false;
    i.holdUntil = holdUntil;
    return true;
  }
  async getAgeGroup(playerId: string): Promise<{ under18: boolean; at: number } | null> {
    const a = this.ageRows.get(playerId);
    return a ? { ...a } : null;
  }
  async setAgeGroup(playerId: string, under18: boolean | null, at: number): Promise<void> {
    if (under18 === null) this.ageRows.delete(playerId);
    else this.ageRows.set(playerId, { ...this.ageRows.get(playerId), under18, at });
  }
  async addImportHold(h: ImportHold): Promise<void> {
    this.importHoldRows.push(clone(h));
  }
  async importHoldsOf(playerId: string): Promise<ImportHold[]> {
    return clone(this.importHoldRows.filter((h) => h.playerId === playerId).reverse());
  }
  async addIntent(i: PurchaseIntent): Promise<void> {
    this.intentRows.push(clone(i));
  }
  async getIntent(id: string): Promise<PurchaseIntent | null> {
    const i = this.intentRows.find((x) => x.id === id);
    return i ? clone(i) : null;
  }
  async useIntent(id: string): Promise<void> {
    const i = this.intentRows.find((x) => x.id === id);
    if (i) i.used = true;
  }
  async putPushToken(t: Omit<PushToken, 'day' | 'sent'>): Promise<void> {
    const old = this.pushRows.find((x) => x.token === t.token);
    this.pushRows = this.pushRows.filter((x) => x.token !== t.token);
    this.pushRows.push({ ...clone(t), day: old?.playerId === t.playerId ? old.day : 0, sent: old?.playerId === t.playerId ? old.sent : 0 });
  }
  async pushTokensOf(playerId: string): Promise<PushToken[]> {
    return this.pushRows.filter((t) => t.playerId === playerId).map(clone);
  }
  async removePushToken(token: string): Promise<void> {
    this.pushRows = this.pushRows.filter((t) => t.token !== token);
  }
  async countPush(token: string, day: number): Promise<void> {
    const t = this.pushRows.find((x) => x.token === token);
    if (!t) return;
    if (t.day !== day) Object.assign(t, { day, sent: 0 });
    t.sent++;
  }
  async getPlayer(id: string): Promise<Player | null> {
    const p = this.players.get(id);
    return p ? clone(p) : null;
  }
  async updatePlayer(id: string, patch: PlayerPatch): Promise<void> {
    const p = this.players.get(id);
    if (patch.nameKey !== undefined && [...this.players.values()].some((x) => x.id !== id && x.nameKey === patch.nameKey)) throw new NameTakenError();
    if (patch.friendCode && [...this.players.values()].some((x) => x.id !== id && x.friendCode === patch.friendCode)) throw new NameTakenError();
    if (p) Object.assign(p, clone(patch));
  }
  async playerByNameKey(key: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.nameKey === key) return clone(p);
    return null;
  }
  async playerByFriendCode(code: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.friendCode === code) return clone(p);
    return null;
  }
  async nameHold(key: string, now: number): Promise<{ playerId: string; until: number } | null> {
    const h = this.nameHolds.get(key);
    return h && h.until > now ? { ...h } : null;
  }
  async holdName(key: string, playerId: string, until: number): Promise<void> {
    this.nameHolds.set(key, { playerId, until });
  }
  async playersWithoutNameKey(limit: number): Promise<Player[]> {
    return [...this.players.values()]
      .filter((p) => !p.nameKey)
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map(clone);
  }
  async addFriendship(a: string, b: string, at: number): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    if (!this.friendshipRows.some((f) => f.a === x && f.b === y)) this.friendshipRows.push({ a: x, b: y, since: at });
  }
  async removeFriendship(a: string, b: string): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    this.friendshipRows = this.friendshipRows.filter((f) => !(f.a === x && f.b === y));
  }
  async friendsOf(playerId: string): Promise<{ id: string; since: number }[]> {
    return this.friendshipRows.filter((f) => f.a === playerId || f.b === playerId).map((f) => ({ id: f.a === playerId ? f.b : f.a, since: f.since }));
  }
  async addFriendRequest(r: FriendRequest): Promise<void> {
    this.friendRequestRows.push(clone(r));
  }
  async getFriendRequest(id: string): Promise<FriendRequest | null> {
    const r = this.friendRequestRows.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async friendRequestsOf(playerId: string, since: number): Promise<FriendRequest[]> {
    return this.friendRequestRows.filter((r) => (r.fromId === playerId || r.toId === playerId) && r.at > since).map(clone);
  }
  async deleteFriendRequest(id: string): Promise<void> {
    this.friendRequestRows = this.friendRequestRows.filter((r) => r.id !== id);
  }
  async deleteFriendRequestsBetween(a: string, b: string): Promise<void> {
    this.friendRequestRows = this.friendRequestRows.filter((r) => !((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)));
  }
  async pruneFriendRequests(before: number): Promise<number> {
    const n = this.friendRequestRows.length;
    this.friendRequestRows = this.friendRequestRows.filter((r) => r.at >= before);
    return n - this.friendRequestRows.length;
  }
  async addDuel(d: DuelRecord): Promise<void> {
    this.duelRows.push(clone(d));
  }
  async duelsOf(playerId: string, since: number, limit: number): Promise<DuelRecord[]> {
    return this.duelRows
      .filter((d) => (d.attackerId === playerId || d.defenderId === playerId) && d.at > since)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(clone);
  }
  async bumpDuelTally(attackerId: string, defenderId: string, won: boolean, stars: number, destruction: number): Promise<void> {
    let t = this.duelTallyRows.find((x) => x.attackerId === attackerId && x.defenderId === defenderId);
    if (!t) this.duelTallyRows.push((t = { attackerId, defenderId, duels: 0, wins: 0, bestStars: 0, bestDestruction: 0 }));
    t.duels++;
    if (won) t.wins++;
    t.bestStars = Math.max(t.bestStars, stars);
    t.bestDestruction = Math.max(t.bestDestruction, destruction);
  }
  async duelTallies(playerId: string): Promise<DuelTally[]> {
    return this.duelTallyRows.filter((t) => t.attackerId === playerId || t.defenderId === playerId).map(clone);
  }
  async addChallenge(c: DuelChallenge): Promise<void> {
    this.challengeRows.push(clone(c));
  }
  async getChallenge(id: string): Promise<DuelChallenge | null> {
    const c = this.challengeRows.find((x) => x.id === id);
    return c ? clone(c) : null;
  }
  async challengesOf(playerId: string, since: number): Promise<DuelChallenge[]> {
    return this.challengeRows.filter((c) => (c.fromId === playerId || c.toId === playerId) && c.createdAt > since).map(clone);
  }
  async setChallengeResult(id: string, side: 'from' | 'to', r: { stars: number; destruction: number }): Promise<boolean> {
    const c = this.challengeRows.find((x) => x.id === id);
    const key = side === 'from' ? 'fromResult' : 'toResult';
    if (!c || c[key]) return false;
    c[key] = { ...r };
    return true;
  }
  async pruneDuels(before: number): Promise<number> {
    const n = this.duelRows.length + this.challengeRows.length;
    this.duelRows = this.duelRows.filter((d) => d.at >= before);
    this.challengeRows = this.challengeRows.filter((c) => c.expiresAt >= before);
    return n - this.duelRows.length - this.challengeRows.length;
  }
  async createSquad(s: Squad): Promise<void> {
    this.squadRows.set(s.id, clone(s));
  }
  async getSquad(id: string): Promise<Squad | null> {
    const s = this.squadRows.get(id);
    return s ? clone(s) : null;
  }
  async updateSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'rating'>>): Promise<void> {
    const s = this.squadRows.get(id);
    if (s) Object.assign(s, clone(patch));
  }
  async deleteSquad(id: string): Promise<void> {
    this.squadRows.delete(id);
    this.squadMemberRows = this.squadMemberRows.filter((m) => m.squadId !== id);
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.squadId !== id);
  }
  async squadMembers(squadId: string): Promise<SquadMember[]> {
    return this.squadMemberRows.filter((m) => m.squadId === squadId).sort((a, b) => a.joinedAt - b.joinedAt).map(clone);
  }
  async squadOf(playerId: string): Promise<SquadMember | null> {
    const m = this.squadMemberRows.find((x) => x.playerId === playerId);
    return m ? clone(m) : null;
  }
  async addSquadMember(m: SquadMember): Promise<boolean> {
    if (this.squadMemberRows.some((x) => x.playerId === m.playerId)) return false;
    this.squadMemberRows.push(clone(m));
    return true;
  }
  async removeSquadMember(playerId: string): Promise<void> {
    this.squadMemberRows = this.squadMemberRows.filter((m) => m.playerId !== playerId);
  }
  async setSquadRole(playerId: string, role: SquadMember['role']): Promise<void> {
    const m = this.squadMemberRows.find((x) => x.playerId === playerId);
    if (m) m.role = role;
  }
  async addSquadInvite(i: SquadInvite): Promise<void> {
    this.squadInviteRows.push(clone(i));
  }
  async getSquadInvite(id: string): Promise<SquadInvite | null> {
    const i = this.squadInviteRows.find((x) => x.id === id);
    return i ? clone(i) : null;
  }
  async squadInvitesTo(playerId: string, since: number): Promise<SquadInvite[]> {
    return this.squadInviteRows.filter((i) => i.toId === playerId && i.at > since).map(clone);
  }
  async squadInvitesFrom(squadId: string, since: number): Promise<SquadInvite[]> {
    return this.squadInviteRows.filter((i) => i.squadId === squadId && i.at > since).map(clone);
  }
  async deleteSquadInvite(id: string): Promise<void> {
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.id !== id);
  }
  async deleteSquadInvitesTo(playerId: string): Promise<void> {
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.toId !== playerId);
  }
  async deleteSquadInvitesFrom(squadId: string): Promise<void> {
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.squadId !== squadId);
  }
  async createWar(w: GangWar): Promise<void> {
    this.warRows.set(w.id, clone(w));
  }
  async getWar(id: string): Promise<GangWar | null> {
    const w = this.warRows.get(id);
    return w ? clone(w) : null;
  }
  async updateWar(id: string, patch: Partial<Pick<GangWar, 'a' | 'b' | 'notified'>>): Promise<void> {
    const w = this.warRows.get(id);
    if (w) Object.assign(w, clone(patch));
  }
  async activeWars(now: number, limit: number): Promise<GangWar[]> {
    return [...this.warRows.values()].filter((w) => w.endsAt > now).slice(0, limit).map(clone);
  }
  async markWarRated(id: string): Promise<boolean> {
    const w = this.warRows.get(id);
    if (!w || w.rated) return false;
    w.rated = true;
    return true;
  }
  async activeWarOf(squadId: string, now: number): Promise<GangWar | null> {
    for (const w of this.warRows.values()) if ((w.a.squadId === squadId || w.b.squadId === squadId) && w.endsAt > now) return clone(w);
    return null;
  }
  async warsOf(squadId: string, limit: number): Promise<GangWar[]> {
    return [...this.warRows.values()]
      .filter((w) => w.a.squadId === squadId || w.b.squadId === squadId)
      .sort((x, y) => y.createdAt - x.createdAt)
      .slice(0, limit)
      .map(clone);
  }
  async addWarAttack(a: GangWarAttack): Promise<void> {
    this.warAttackRows.push(clone(a));
  }
  async warAttacks(warId: string): Promise<GangWarAttack[]> {
    return this.warAttackRows.filter((a) => a.warId === warId).map(clone);
  }
  async getRelay(warId: string, side: 'a' | 'b', target: number): Promise<GangRelay | null> {
    const r = this.relayRows.find((x) => x.warId === warId && x.side === side && x.target === target);
    return r ? clone(r) : null;
  }
  async holdRelay(warId: string, side: 'a' | 'b', target: number, playerId: string, until: number, now: number): Promise<boolean> {
    let r = this.relayRows.find((x) => x.warId === warId && x.side === side && x.target === target);
    if (!r) this.relayRows.push((r = { warId, side, target, damage: {}, stars: 0, destruction: 0, strikes: 0, lastBy: null, holder: null, holdUntil: 0 }));
    if (r.holder && r.holder !== playerId && r.holdUntil > now) return false;
    r.holder = playerId;
    r.holdUntil = until;
    return true;
  }
  async putRelay(r: GangRelay): Promise<void> {
    this.relayRows = this.relayRows.filter((x) => !(x.warId === r.warId && x.side === r.side && x.target === r.target));
    this.relayRows.push(clone(r));
  }
  async enqueueGang(e: GangQueueEntry): Promise<boolean> {
    if (this.gangQueueRows.some((x) => x.squadId === e.squadId)) return false;
    this.gangQueueRows.push(clone(e));
    return true;
  }
  async dequeueGang(squadId: string): Promise<boolean> {
    const n = this.gangQueueRows.length;
    this.gangQueueRows = this.gangQueueRows.filter((x) => x.squadId !== squadId);
    return this.gangQueueRows.length < n;
  }
  async queuedGang(squadId: string): Promise<GangQueueEntry | null> {
    const e = this.gangQueueRows.find((x) => x.squadId === squadId);
    return e ? clone(e) : null;
  }
  async gangQueue(size: number): Promise<GangQueueEntry[]> {
    return this.gangQueueRows.filter((x) => x.size === size).sort((a, b) => a.queuedAt - b.queuedAt).map(clone);
  }
  async addGangClaim(warId: string, playerId: string, outcome: string, at: number): Promise<boolean> {
    if (this.gangClaimRows.some((c) => c.warId === warId && c.playerId === playerId)) return false;
    this.gangClaimRows.push({ warId, playerId, outcome, at });
    return true;
  }
  async gangClaimed(warId: string, playerId: string): Promise<boolean> {
    return this.gangClaimRows.some((c) => c.warId === warId && c.playerId === playerId);
  }
  async findOpponents(q: OpponentQuery): Promise<Player[]> {
    const since = q.lockedSince;
    const locked = new Set(since === null ? [] : [...this.tickets.values()].filter((t) => !t.used && t.defenderId && t.createdAt > since).map((t) => t.defenderId));
    return [...this.players.values()]
      .filter((p) => p.base && !p.bannedUntil && !q.excludeIds.includes(p.id) && !locked.has(p.id) && p.shieldUntil <= q.now)
      .filter((p) => p.hallLevel >= q.minHall && p.hallLevel <= q.maxHall && p.trophies >= q.minTrophies && p.trophies <= q.maxTrophies)
      .slice(0, q.limit)
      .map(clone);
  }
  async topPlayers(limit: number): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.base && !p.bannedUntil).sort((a, b) => b.trophies - a.trophies || a.createdAt - b.createdAt).slice(0, limit).map(clone);
  }
  async rankOf(trophies: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => p.base && !p.bannedUntil && p.trophies > trophies).length;
  }
  async playersByIds(ids: string[]): Promise<Player[]> {
    return ids.map((id) => this.players.get(id)).filter((p): p is Player => Boolean(p)).map(clone);
  }
  private powerOf(p: Player, beta: number): number {
    return (p.ratings?.attack.rating ?? 1500) + beta * (Math.max(1, p.hallLevel) - 1);
  }
  async topByPower(limit: number, minBattles: number, beta: number): Promise<Player[]> {
    return [...this.players.values()]
      .filter((p) => p.base && !p.bannedUntil && (p.ratings?.attack.battles ?? 0) >= minBattles)
      .sort((a, b) => this.powerOf(b, beta) - this.powerOf(a, beta) || a.createdAt - b.createdAt)
      .slice(0, limit)
      .map(clone);
  }
  async powerRankOf(power: number, minBattles: number, beta: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => p.base && !p.bannedUntil && (p.ratings?.attack.battles ?? 0) >= minBattles && this.powerOf(p, beta) > power).length;
  }
  async rankedPlayers(): Promise<{ id: string; trophies: number; createdAt: number }[]> {
    return [...this.players.values()].filter((p) => p.base && !p.bannedUntil).map((p) => ({ id: p.id, trophies: p.trophies, createdAt: p.createdAt }));
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
  async startTicket(id: string, at: number): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.used) return false;
    if (t.startedAt === undefined) t.startedAt = at;
    return true;
  }
  async bumpTicketFailures(id: string): Promise<number> {
    const t = this.tickets.get(id);
    if (!t) return 0;
    t.failures = (t.failures ?? 0) + 1;
    return t.failures;
  }
  async openTickets(attackerId: string, kind: Ticket['kind']): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => !t.used && t.attackerId === attackerId && t.kind === kind).sort((a, b) => b.createdAt - a.createdAt).map((t) => this.withBase(t));
  }
  async expiredOpenTickets(kind: Ticket['kind'], before: number, limit: number): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => !t.used && t.kind === kind && t.expiresAt < before).sort((a, b) => a.expiresAt - b.expiresAt).slice(0, limit).map((t) => this.withBase(t));
  }
  refundRows = new Map<string, { at: number; why: string }>();
  async addRefundNotice(store: string, key: string, at: number, why: string): Promise<void> {
    if (!this.refundRows.has(`${store}:${key}`)) this.refundRows.set(`${store}:${key}`, { at, why });
  }
  async refundNotice(store: string, key: string): Promise<{ at: number; why: string } | null> {
    const r = this.refundRows.get(`${store}:${key}`);
    return r ? { ...r } : null;
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
      if (t.createdAt < c.recordsBefore || (!t.used && t.expiresAt < (c.ticketsBefore ?? c.staleBefore))) {
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
    const delBefore = c.deletionRequestsBefore;
    if (delBefore !== undefined) this.deletionRows = this.deletionRows.filter((r) => r.status === 'open' || (r.resolvedAt ?? 0) >= delBefore);
    const intentsBefore = c.intentsBefore;
    if (intentsBefore !== undefined) this.intentRows = this.intentRows.filter((i) => i.at >= intentsBefore);
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
    // Friends and requests go; name holds go (the name is free again).
    this.friendshipRows = this.friendshipRows.filter((f) => f.a !== id && f.b !== id);
    this.friendRequestRows = this.friendRequestRows.filter((r) => r.fromId !== id && r.toId !== id);
    for (const [k, h] of this.nameHolds) if (h.playerId === id) this.nameHolds.delete(k);
    // Duels, tallies and challenges either way; Gang membership and invites (the core hands leadership over first).
    this.duelRows = this.duelRows.filter((d) => d.attackerId !== id && d.defenderId !== id);
    this.duelTallyRows = this.duelTallyRows.filter((t) => t.attackerId !== id && t.defenderId !== id);
    this.challengeRows = this.challengeRows.filter((c) => c.fromId !== id && c.toId !== id);
    this.squadMemberRows = this.squadMemberRows.filter((m) => m.playerId !== id);
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.toId !== id && i.fromId !== id);
    // Gang War rosters keep the base (the war's score depends on it) without the player.
    for (const w of this.warRows.values()) for (const e of [...w.a.roster, ...w.b.roster]) if (e.playerId === id) Object.assign(e, { playerId: null, name: DELETED_PLAYER.name });
    this.gangClaimRows = this.gangClaimRows.filter((c) => c.playerId !== id);
    // A server-held village, its ledger and command log, other devices' tokens and linked sign-ins are only theirs.
    this.villageRows.delete(id);
    this.tokenRows = this.tokenRows.filter((t) => t.playerId !== id);
    this.linkRows = this.linkRows.filter((l) => l.playerId !== id);
    this.deletionCodeRows.delete(id);
    this.noticeRows = this.noticeRows.filter((n) => n.playerId !== id);
    this.intentRows = this.intentRows.filter((i) => i.playerId !== id);
    this.ageRows.delete(id);
    this.importHoldRows = this.importHoldRows.filter((h) => h.playerId !== id);
    this.pushRows = this.pushRows.filter((t) => t.playerId !== id);
    // Purchase records are financial records (refunds, tax): kept, no longer tied to the player.
    for (const p of this.purchaseRows) if (p.playerId === id) p.playerId = D.id;
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
  async getAgeBand(playerId: string): Promise<{ band: AgeBand | null; under18: boolean; at: number } | null> {
    const a = this.ageRows.get(playerId);
    return a ? { band: a.band ?? null, under18: a.under18, at: a.at } : null;
  }
  async setAgeBand(playerId: string, band: AgeBand, at: number): Promise<void> {
    this.ageRows.set(playerId, { under18: band !== 'adult', band, at });
  }
  async touchToken(tokenHash: string, at: number): Promise<void> {
    const t = this.tokenRows.find((x) => x.tokenHash === tokenHash);
    if (t) t.lastUsedAt = at;
  }
  async revokeTokens(playerId: string, provider: string, except?: string): Promise<number> {
    const before = this.tokenRows.length;
    this.tokenRows = this.tokenRows.filter((t) => !(t.playerId === playerId && t.provider === provider && t.tokenHash !== except));
    return before - this.tokenRows.length;
  }
  async revokeOtherTokens(playerId: string, keepHash: string): Promise<number> {
    const p = this.players.get(playerId);
    if (!p) return 0;
    const mine = this.tokenRows.filter((t) => t.playerId === playerId);
    if (p.tokenHash !== keepHash && !mine.some((t) => t.tokenHash === keepHash)) return 0;
    let n = mine.filter((t) => t.tokenHash !== keepHash).length;
    if (p.tokenHash !== keepHash) {
      p.tokenHash = keepHash;
      n += 1;
    }
    this.tokenRows = this.tokenRows.filter((t) => t.playerId !== playerId);
    return n;
  }
  async pruneTokens(unusedBefore: number): Promise<number> {
    const before = this.tokenRows.length;
    this.tokenRows = this.tokenRows.filter((t) => (t.lastUsedAt ?? t.createdAt) >= unusedBefore);
    return before - this.tokenRows.length;
  }
  async setLinkToken(provider: string, subject: string, refreshToken: string | null, clientId: string | null): Promise<void> {
    const l = this.linkRows.find((x) => x.provider === provider && x.subject === subject);
    if (l) Object.assign(l, { refreshToken, clientId });
  }
  async linkTokensOf(playerId: string): Promise<{ provider: string; subject: string; refreshToken: string; clientId: string | null }[]> {
    return this.linkRows.filter((l) => l.playerId === playerId && l.refreshToken).map((l) => ({ provider: l.provider, subject: l.subject, refreshToken: l.refreshToken!, clientId: l.clientId ?? null }));
  }
  async setDeletionCode(playerId: string, codeHash: string, at: number, expiresAt: number): Promise<void> {
    this.deletionCodeRows.set(playerId, { codeHash, createdAt: at, expiresAt });
  }
  async deletionCodeOf(playerId: string): Promise<{ codeHash: string; expiresAt: number } | null> {
    const c = this.deletionCodeRows.get(playerId);
    return c ? { codeHash: c.codeHash, expiresAt: c.expiresAt } : null;
  }
  async clearDeletionCode(playerId: string): Promise<void> {
    this.deletionCodeRows.delete(playerId);
  }
  async addNotice(n: PlayerNotice): Promise<void> {
    if (this.players.has(n.playerId)) this.noticeRows.push(clone(n));
  }
  async noticesOf(playerId: string, limit: number): Promise<PlayerNotice[]> {
    return this.noticeRows.filter((n) => n.playerId === playerId).sort((a, b) => b.at - a.at).slice(0, limit).map(clone);
  }
  async markNoticesRead(playerId: string, ids: string[]): Promise<void> {
    const set = new Set(ids);
    for (const n of this.noticeRows) if (n.playerId === playerId && set.has(n.id)) n.read = true;
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
