/**
 * The server's storage port: six aggregate stores and `Repo`, which joins them with transactions and
 * housekeeping. Postgres in production (pg/), memory in tests and local dev (memory/). A future server can
 * add another adapter (any database) by implementing Repo; tests/backend/server/repo.test.ts runs the same
 * checks against every adapter.
 */
import type { AgeBand } from '../../src/gameplay/sim/age';
import type {
  Player,
  PlayerPatch,
  DuelRecord,
  DuelTally,
  DuelChallenge,
  Squad,
  SquadMember,
  SquadInvite,
  GangWar,
  GangWarAttack,
  GangRelay,
  GangQueueEntry,
  FriendRequest,
  StaffAction,
  Ticket,
  AttackRecord,
  Grove,
  GroveSummaryRow,
  GroveMember,
  ChatRow,
  StatsInstallSummary,
  StatsDailyRow,
  Report,
  Block,
  TroopRequest,
  Donation,
  RaidPairing,
  RaidAttack,
  RaidClaim,
  VillageRow,
  LedgerEntry,
  CommandLogRow,
  IdentityLink,
  PlayerNotice,
  TokenRotation,
  PurchaseRow,
  PurchaseIntent,
  ImportHold,
  Complaint,
  PushToken,
  DeletionRequest,
  PruneCutoffs,
  PruneResult,
  OpponentQuery,
  ReferralRow,
  SharedReplayRow,
  InstallSummaryRow,
  StatsEventRow,
} from './types';

/** Players, sessions, staff tools, account protections and deletion. Part of `Repo` (report section 5 step 10, quality 16: split by aggregate). */
export interface PlayerStore {
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
  /**
   * Delete extra device tokens last used (or made) before this time; how many. Backend A16 (2026-11-14): an
   * account's last working key is never deleted: for a player whose first token was signed out and who has
   * no linked sign-in, the most recently used device token stays.
   */
  pruneTokens(unusedBefore: number): Promise<number>;
  /** Backend A16: the account's working keys: its first token (null once signed out) and other devices' tokens with the sign-in that made them. */
  keysOf(playerId: string): Promise<{ main: string | null; devices: { hash: string; provider: string | null }[] }>;
  /**
   * Backend A16 (2026-11-14): a token rotation waiting for the new token's first use. Until then the old
   * token keeps working; the first request with the new token swaps them (`replaceToken`).
   */
  addRotation(r: TokenRotation): Promise<void>;
  rotationOf(newHash: string): Promise<TokenRotation | null>;
  /** Forget every rotation waiting on this old token (it was swapped, signed out or revoked); how many. */
  dropRotations(oldHash: string): Promise<number>;
  /** Forget rotations made before this time (never confirmed); how many. */
  pruneRotations(before: number): Promise<number>;
  /**
   * Backend A23: ids of anonymous accounts last seen before `seenBefore` that nothing else holds: no
   * purchase, no linked sign-in, not staff, not suspended, and no server-held village above `maxKeep`.
   * Oldest first, at most `limit`.
   */
  dormantPlayers(seenBefore: number, maxKeep: number, limit: number): Promise<string[]>;
  /**
   * Backend A16: give the token `oldHash` of this player the hash `newHash` (rotation), whether it is the
   * account's first token or another device's. False when the player holds no such token.
   */
  replaceToken(playerId: string, oldHash: string, newHash: string): Promise<boolean>;
  /** Backend A15: a sign-in nonce the server issued, usable once until `expiresAt`. */
  addNonce(nonce: string, expiresAt: number): Promise<void>;
  /** Use a nonce up: true only the first time, before it expired. */
  useNonce(nonce: string, now: number): Promise<boolean>;
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
}

/** Store purchases, intents, spending protection and push devices. Part of `Repo` (report section 5 step 10, quality 16: split by aggregate). */
export interface PurchaseStore {
  // purchases (roadmap Phase 4)
  /** False (nothing stored) if that store transaction is already recorded. */
  addPurchase(p: PurchaseRow): Promise<boolean>;
  getPurchase(store: string, transactionId: string): Promise<PurchaseRow | null>;
  purchaseByRef(store: string, ref: string): Promise<PurchaseRow | null>;
  /** Newest first. */
  purchasesOf(playerId: string, limit: number): Promise<PurchaseRow[]>;
  /**
   * Japan C17 (資金決済法 base-date report): every purchase made in one of these storefronts (Apple alpha-3 `JPN`,
   * Play region `JP`, compared case-insensitively) at or before `before`, refunded ones included (the report
   * decides by `refundedAt`). Oldest first.
   */
  storefrontPurchases(storefronts: string[], before: number): Promise<PurchaseRow[]>;
  /** False if it already had that status. */
  setPurchaseStatus(store: string, transactionId: string, status: PurchaseRow['status'], at: number): Promise<boolean>;
  /** Cents of credited purchases since `since`, plus unused intents still holding at `now` (reserved by the age cap). */
  spentCents(playerId: string, since: number, now: number): Promise<number>;
  /**
   * Backend A5/A24: purchases since `since` (newest first, at most 500) of this player, of these devices
   * (by the intent that asked), and of every player whose server-held village was played on one of them.
   * A new free account on the same phone is the same buyer. Device ids are chosen by the game (a random
   * id per install), never verified: a modified client can send a fresh id to look like a new device, or
   * another player's id (if it learned it) to share their count. The link only ever adds refunds or test
   * spend to the count (stricter), so a forged id cannot loosen a limit below the account's own history.
   */
  linkedPurchases(playerId: string, devices: string[], since: number): Promise<PurchaseRow[]>;
  /** Backend A24: cents of Sandbox/test purchases (environment other than Production) credited since `since`, all players. */
  testCentsSince(since: number): Promise<number>;
  /**
   * Backend A29: note a store notification (`id` unique per store). `duplicate`: seen before (skip it).
   * `newerAt`: the latest signed time of another refund-state notification (REFUND, REVOKE,
   * REFUND_REVERSED) for the same transaction, so an older one arriving late is not applied over it.
   */
  noteStoreNotification(n: { id: string; store: string; ref: string | null; type: string; signedAt: number; receivedAt: number }): Promise<{ duplicate: boolean; newerAt: number | null }>;
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
  /** Backend A20: every Power Ranking value (one scan, cached by the core for a minute). */
  powerValues(minBattles: number, beta: number): Promise<number[]>;
  /** Every ranked player (with a base), to rebuild a leaderboard index. */
  rankedPlayers(): Promise<{ id: string; trophies: number; createdAt: number }[]>;
}

/** Shared play statistics (and other operations data). Part of `Repo` (report section 5 step 10, quality 16: split by aggregate). */
export interface OpsStore {
  // shared play statistics (report section 5 step 5, migration 0027): no player id, no IP address
  /** Keep cleaned events under a statistics id; resolves how many were kept. */
  addStatsEvents(install: string, build: string, arm: string, events: import('../../src/backend/net/stats').StatsEvent[], receivedAt: number): Promise<number>;
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
  /** GLOBAL-002 staff release: mark a held import resolved (only from `held`); false when it was not held. */
  resolveImportHold(id: string, playerId: string): Promise<boolean>;
  // complaints (backend batch 2026-11-13)
  addComplaint(c: Complaint): Promise<void>;
  /** Oldest first. */
  complaints(status: 'open' | 'all', limit: number): Promise<Complaint[]>;
  /** False when it is not an open complaint. */
  resolveComplaint(id: string, resolution: string, at: number): Promise<boolean>;
  /** Newest first. */
  importHoldsOf(playerId: string): Promise<ImportHold[]>;
}

/** Tickets, attacks and stored bases. Part of `Repo` (report section 5 step 10, quality 16: split by aggregate). */
export interface BattleStore {
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
  /** Mark the battle started (once); `stake` is kept only with the first start. */
  startTicket(id: string, at: number, stake?: number): Promise<boolean>;
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
}

/** Alliances, chat, names and friends, duels, Gangs, Gang Wars, reports and blocks, donations and war raids. Part of `Repo` (report section 5 step 10, quality 16: split by aggregate). */
export interface SocialStore {
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

/** Server-held villages, their ledger and command log. Part of `Repo` (report section 5 step 10, quality 16: split by aggregate). */
export interface VillageStore {
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
  /** The balance of `resource` after the last ledger line at or before `at`; null when there is none (Japan C17 report). */
  balanceAt(playerId: string, resource: string, at: number): Promise<number | null>;
  /** The sum of `resource` deltas of ledger lines with this `reason` at or before `at` (Japan C17: stipend Jade delivered). */
  ledgerSumAt(playerId: string, resource: string, reason: string, at: number): Promise<number>;
  /** Oldest first, after `sinceSeq`. */
  commandsOf(playerId: string, sinceSeq: number, limit: number): Promise<CommandLogRow[]>;
}

/**
 * Growth batch 2026-11-14: referrals (one row per recruit, both sides' reward times), shared replays (a
 * re-simulated battle under a short code, 90 days or until deleted) and statistics summaries (time zone
 * offsets, one summary per statistics id rebuilt by watermark). Part of `Repo`; account deletion
 * (`deletePlayer`) removes a player's referrals either way and their shared replays.
 */
export interface GrowthStore {
  addReferral(r: ReferralRow): Promise<boolean>;
  referralOf(recruitId: string): Promise<ReferralRow | null>;
  referralsBy(inviterId: string): Promise<ReferralRow[]>;
  updateReferral(recruitId: string, patch: Partial<Pick<ReferralRow, 'qualifiedAt' | 'recruitRewardedAt' | 'inviterRewardedAt'>>): Promise<void>;
  /** Inviter rewards paid since `since` (the monthly cap). */
  inviterRewardsSince(inviterId: string, since: number): Promise<number>;

  addSharedReplay(r: SharedReplayRow): Promise<boolean>;
  /** The replay (counting a view when `view`), or null when missing or expired. */
  getSharedReplay(id: string, now: number, view: boolean): Promise<SharedReplayRow | null>;
  sharedReplaysOf(ownerId: string, since: number): Promise<SharedReplayRow[]>;
  deleteSharedReplay(id: string, ownerId: string): Promise<boolean>;
  pruneSharedReplays(before: number): Promise<number>;

  setInstallTz(install: string, tz: number, at: number): Promise<void>;
  /** Statistics ids with events received after `after`, oldest first, and the newest receipt time among them. */
  statsTouched(after: number, limit: number): Promise<{ installs: string[]; maxReceived: number }>;
  statsEventsOf(installs: string[]): Promise<StatsEventRow[]>;
  installTzs(installs: string[]): Promise<Map<string, number>>;
  putInstallSummaries(rows: InstallSummaryRow[]): Promise<void>;
  /** Summaries whose first day (on that basis) is in [fromDay, toDay]. */
  installSummaries(basis: 'utc' | 'local', fromDay: number, toDay: number): Promise<InstallSummaryRow[]>;
  getWatermark(name: string): Promise<number>;
  setWatermark(name: string, value: number): Promise<void>;
  /** Sharing turned off: the id's summary and offset go with its events. */
  deleteInstall(install: string): Promise<void>;
  pruneInstalls(firstBefore: number): Promise<number>;

}

/**
 * Storage port of the server core: every aggregate store plus transactions and housekeeping. New methods go in
 * the aggregate they belong to; core modules can depend on the narrower store they need.
 */
export interface Repo extends PlayerStore, PurchaseStore, OpsStore, BattleStore, SocialStore, VillageStore, GrowthStore {
  // transactions, locks, periodic jobs and idempotent answers (cross-cutting)
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
  /** The answer remembered for a write's Idempotency-Key (protocol 7), per caller. */
  getIdempotent(scope: string, key: string): Promise<{ status: number; body: unknown; fingerprint: string | null } | null>;
  /**
   * Remember it (the first answer wins). `fingerprint` (backend A13): the method, route and body hash of the
   * request it answered, so the same key on another route or with another body is refused instead of replayed.
   */
  putIdempotent(scope: string, key: string, status: number, body: unknown, at: number, fingerprint?: string | null): Promise<void>;
  /** Forget every remembered answer of these callers (a signed-out or rotated token; backend A12/A16). */
  dropIdempotentScopes(scopes: string[]): Promise<number>;
  /** Run `fn` atomically: what it writes through `tx` lands together, or not at all if it throws. */
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;
  /** Throws when the store cannot answer (readiness checks). */
  ping(): Promise<void>;
}
