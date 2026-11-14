/** Row types of the server's storage port (`Repo`, ports.ts). */
import type { BaseLayout, BattleResult, Deployment } from '../../src/gameplay/sim/battle/types';
import type { GroveRole, ReportReason } from '../../src/backend/net/protocol';
import type { Rating } from '../../src/gameplay/sim/rating';

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
  findable?: import('../../src/backend/net/protocol').Findable;
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
  /** The community rules version this account accepted, and when (migration 0028; 0: never). */
  rulesVersion?: number;
  rulesAcceptedAt?: number;
  /** Runtime only, never stored: the token hash this request came with (set by `authenticate`). */
  session?: string;
}

export type PlayerPatch = Partial<Pick<Player, 'name' | 'trophies' | 'hallLevel' | 'shieldUntil' | 'base' | 'groveId' | 'updatedAt' | 'lastSeenAt' | 'mutedUntil' | 'muteReason' | 'ratings' | 'honorLoss' | 'bannedUntil' | 'banReason' | 'nameKey' | 'previousName' | 'nameChangedAt' | 'freeRenames' | 'findable' | 'showOnline' | 'friendCode' | 'staff' | 'duelBase' | 'squadLeftAt' | 'rulesVersion' | 'rulesAcceptedAt'>>;

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
  /** The star count declared when the battle started (declared stakes, sim/carry.ts; migration 0030). */
  stake?: number;
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
  /** The attacker's hero (SIM_RULES 5). */
  hero?: { id: string; level: number };
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
  presetId?: number;
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
  /** The English (older games). */
  text: string;
  read: boolean;
  /** The same notice as message codes (migration 0037; absent on older notices). */
  parts?: import('../../src/backend/net/protocol').MessageRef[] | null;
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

/** Backend A16: the hash a signed-out first token gets (no token hashes to it). */
export const REVOKED_TOKEN_PREFIX = 'revoked:';

/** Backend A16 (2026-11-14): a rotated token waiting for its first use (`POST /v1/sessions/rotate`). */
export interface TokenRotation {
  newHash: string;
  oldHash: string;
  playerId: string;
  at: number;
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
  /** The device that asked for it (its purchase intent's `device`; backend A5/A24), when known. */
  device?: string | null;
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
  /** The device that asked (PurchaseIntentRequest.device; backend A5/A24), when the game sent one. */
  device?: string | null;
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

/** A complaint about illegal or harmful content (EU DSA art. 16, UK OSA; core/complaints.ts). */
export interface Complaint {
  id: string;
  at: number;
  subject: string;
  reason: string;
  /** Where to answer (optional); deleted with the complaint. */
  contact: string | null;
  /** The complainant's own player id, if they gave it. */
  playerId: string | null;
  status: 'open' | 'done';
  resolvedAt: number | null;
  resolution: string | null;
}

/** A device that receives server push (roadmap step 40). */
export interface PushToken {
  locale?: string;
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
  /** Sign-in nonces that expired before this go (backend A15). */
  noncesBefore?: number;
  /** Handled complaints resolved before this go, with their contact address. */
  complaintsBefore?: number;
  /** Store notifications received before this go (backend A29: kept long enough to order late deliveries). */
  storeNotificationsBefore?: number;
  /**
   * Backend A18: rows are deleted in batches of this many (each statement short, far under the statement
   * timeout), until this wall-clock time (ms); whatever is left goes in the next run. Memory ignores both.
   */
  batchSize?: number;
  deadline?: number;
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
  /** Backend A19: the honor to search outward from (Postgres keeps the `limit` nearest); the middle of the window if absent. */
  pivot?: number;
}
