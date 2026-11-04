/**
 * The Toadstool Kingdoms multiplayer protocol: every request and response the
 * game exchanges with a server. Our server (server/) implements it, and so must
 * any future server. tests/contract/ checks an implementation against it, and
 * docs/PROTOCOL.md describes it in prose.
 *
 * Plain JSON over HTTPS. Auth is a bearer token from POST /v1/players.
 * Errors: HTTP status + { error: ErrorCode, message }.
 * Pure types and constants only (shared by browser and Node).
 */
import type { BaseLayout, BattleResult, Deployment } from '../../gameplay/sim/battle/types';
import type { SaveFile } from '../../gameplay/sim/save';
import type { Economy } from '../../gameplay/sim/serverEconomy';
import type { Command } from '../../gameplay/sim/village';

/**
 * Bump when a change would break older clients; servers report the oldest
 * they accept. 7 (roadmap step 26): the server owns the economy (villages are
 * kept on the server), every request says which game it comes from
 * (`ClientHeaders`), and writes carry an Idempotency-Key.
 */
export const PROTOCOL_VERSION = 7;

/** Headers the game sends with every request (protocol 7). */
export const ClientHeaders = {
  /** PROTOCOL_VERSION of the game. Older than the server's minProtocol: 426 version_mismatch. */
  protocol: 'x-protocol',
  /** SIM_RULES the game simulates battles with. */
  simRules: 'x-sim-rules',
  /** Hash of the game's balance data (src/gameplay/data), so a server can tell builds apart. */
  dataVersion: 'x-data-version',
  /** The game's version and platform, e.g. "0.1.0+ios". */
  clientBuild: 'x-client-build',
  /** On writes: a fresh id per action; the same key again (by the same player) gets the first answer back. */
  idempotencyKey: 'idempotency-key',
} as const;

export type ErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'expired'
  | 'cooldown'
  | 'full'
  | 'not_in_grove'
  | 'already_in_grove'
  | 'raid_not_live'
  | 'raid_not_ended'
  | 'no_attacks_left'
  | 'no_opponents'
  | 'version_mismatch'
  /** 429: too many requests; wait for the Retry-After header (seconds), then try again. */
  | 'rate_limited'
  /** 403: a moderator muted this player's chat for a while (the message says until when). */
  | 'muted'
  /** 404: this player's village is not kept on the server (it lives on the device). */
  | 'no_village'
  /** 403: the purchase is not allowed (the under-18 monthly cap, or purchases not set up on this server); nothing was charged. */
  | 'purchase_refused'
  /** 403: staff suspended this account from online play (the message says why and until when). */
  | 'banned'
  /** 409: another player has that name (or it is held for its previous owner); `suggestions` lists free ones. */
  | 'name_taken'
  /** 400: the name breaks a rule (length, characters, reserved); `suggestions` lists free ones. */
  | 'bad_name';

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  /** With `name_taken` and `bad_name`: names that are free and fit the rules. */
  suggestions?: string[];
}

export const Routes = {
  hello: '/v1/hello',
  players: '/v1/players',
  me: '/v1/me',
  base: '/v1/base',
  match: '/v1/match',
  attacks: '/v1/attacks',
  defenses: '/v1/defenses',
  leaderboard: '/v1/leaderboard',
  powerLeaderboard: '/v1/leaderboard/power',
  /** GET ?season=: an archived season's top (default: the last closed season). */
  seasonLeaderboard: '/v1/leaderboard/season',
  groves: '/v1/groves',
  groveJoin: (id: string) => `/v1/groves/${encodeURIComponent(id)}/join`,
  grove: '/v1/grove',
  groveLeave: '/v1/grove/leave',
  groveChat: '/v1/grove/chat',
  groveRequests: '/v1/grove/requests',
  groveDonate: (id: string) => `/v1/grove/requests/${encodeURIComponent(id)}/donate`,
  groveInbox: '/v1/grove/inbox',
  groveInboxAck: '/v1/grove/inbox/ack',
  groveRaid: '/v1/grove/raid',
  groveRaidTicket: '/v1/grove/raid/ticket',
  groveRaidAttacks: '/v1/grove/raid/attacks',
  groveRaidClaim: '/v1/grove/raid/claim',
  links: '/v1/links',
  link: (provider: string) => `/v1/links/${encodeURIComponent(provider)}`,
  /** POST, no token: sign in on this device with a linked account. */
  sessions: '/v1/sessions',
  village: '/v1/village',
  villageCommands: '/v1/village/commands',
  /** POST { file }: move this device's village to the server (once, with sanity limits for its Keep). */
  villageImport: '/v1/village/import',
  villageLedger: '/v1/village/ledger',
  reports: '/v1/reports',
  blocks: '/v1/blocks',
  block: (playerId: string) => `/v1/blocks/${encodeURIComponent(playerId)}`,
  /** POST, no token: a deletion request from the web form, for players who cannot open the game. */
  deletionRequests: '/v1/account/deletion-requests',
  /** GET (HTML): the web account-deletion page to link from store listings. Not part of the game's API. */
  deletionPage: '/account/delete',
  /** POST: ask before paying (age cap); returns the token the store purchase carries back. */
  purchaseIntent: '/v1/purchases/intent',
  /** POST: redeem a store receipt (verified, credited once); GET: purchase history. */
  purchases: '/v1/purchases',
  /** POST, no token: App Store Server Notifications v2 (signed by Apple). */
  appleNotifications: '/v1/webhooks/apple',
  /** POST, no token: Google Play Real-time Developer Notifications (Pub/Sub push, OIDC-signed). */
  googleNotifications: '/v1/webhooks/google',
  /** GET ?name=: the one player with exactly that name (roadmap step 59), if they can be found. */
  lookup: '/v1/players/lookup',
  /** GET: friends, requests, my code and privacy. */
  friends: '/v1/friends',
  /** POST { code } | { name }: ask to be friends. */
  friendRequests: '/v1/friends/requests',
  /** POST { accept }: answer (or, the sender, withdraw) a request. */
  friendRequest: (id: string) => `/v1/friends/requests/${encodeURIComponent(id)}`,
  /** DELETE: stop being friends. */
  friend: (id: string) => `/v1/friends/${encodeURIComponent(id)}`,
  /** GET: recent opponents and Alliance mates who aren't friends yet (step 60). */
  friendSuggestions: '/v1/friends/suggestions',
  /** POST { provider, ids }: Game Center / Play Games friends who play (step 61, opt-in). */
  friendImport: '/v1/friends/import',
  /** PUT { findable?, hideOnline? }. */
  privacy: '/v1/me/privacy',
  /** POST { friendId, layout? }: a Friendly Duel ticket for a friend's base (roadmap step 62). */
  duelTicket: '/v1/duels/ticket',
  /** POST DuelSubmission: report a duel (never ranked). GET: my duels, rivalries and challenges. */
  duels: '/v1/duels',
  /** PUT { base } / DELETE: the separate layout friends may duel against. */
  duelLayout: '/v1/duels/layout',
  /** POST { friendId }: challenge a friend: both attack each other's base within 24 hours. */
  duelChallenges: '/v1/duels/challenges',
  /** POST { name }: start a Gang (roadmap step 63). */
  squads: '/v1/squads',
  /** POST { friendId }: the leader invites a friend. */
  squadInvites: '/v1/squads/invites',
  /** POST { accept }: answer an invite (or, the leader, withdraw it). */
  squadInvite: (id: string) => `/v1/squads/invites/${encodeURIComponent(id)}`,
  /** GET: my Gang and invites to me. */
  squad: '/v1/squad',
  squadLeave: '/v1/squad/leave',
  /** POST { playerId }: hand leadership over. */
  squadLeader: '/v1/squad/leader',
  /** GET ?after= / POST { text }: Gang chat (filtered, like Alliance chat). */
  squadChat: '/v1/squad/chat',
  /** GET / POST { capacity }: troop requests inside the Gang. */
  squadRequests: '/v1/squad/requests',
  squadDonate: (id: string) => `/v1/squad/requests/${encodeURIComponent(id)}/donate`,
  /** GET (HTML): a share link that opens the game with this friend code. Not part of the game's API. */
  shareLink: (code: string) => `/f/${encodeURIComponent(code)}`,
  /** PUT: this device's push token and choices; DELETE (?token=): stop pushing to it. */
  pushTokens: '/v1/push/tokens',
} as const;

// ---------------------------------------------------------------- identity

export interface HelloResponse {
  name: 'toadstool-kingdoms';
  protocol: number;
  /** Oldest client protocol this server still accepts. */
  minProtocol: number;
  /** Server clock (epoch ms), so all players agree on Grove Raid times. */
  serverTime: number;
  features: string[];
  /** 'staging' or 'development' on a test server (the game says so in Settings); absent or 'production' otherwise. */
  environment?: string;
  /** A message from the operators for every player (maintenance, an incident), shown in Settings → Online play. */
  notice?: string;
}

export interface RegisterRequest {
  name: string;
}
export interface RegisterResponse {
  playerId: string;
  token: string;
}

export interface PlayerView {
  id: string;
  name: string;
  trophies: number;
  hallLevel: number;
  shieldUntil: number;
  groveId: string | null;
  /** Friend code (roadmap step 59), e.g. KAGE-7Q4M2X. */
  friendCode?: string;
  /** When the name may next be changed (0: now). */
  nameChangeAt?: number;
  /** Staff or official account. */
  staff?: boolean;
}

export interface RenameRequest {
  name: string;
}

/**
 * DELETE /v1/me deletes the caller's online account (204): the player, their
 * base, raids on them, Alliance membership, chat lines, troop requests and
 * gifts to them. Replays of raids they made stay with the defenders, as
 * "Deleted player". The token stops working. The village on the device is
 * not touched (it never left it).
 */
export interface DeletionRequestBody {
  /** The Player ID shown in Settings → Online play. */
  playerId?: string;
  /** The player name, if the ID is unknown. One of the two is needed. */
  name?: string;
  /** How staff can reach the player to confirm (optional, kept only for this request). */
  contact?: string;
  note?: string;
}
export interface DeletionRequestResponse {
  /** Reference for the player; the request is handled by staff. */
  id: string;
}

// ---------------------------------------------------------------- PvP

export interface UploadBaseRequest {
  base: BaseLayout;
  name?: string;
}

export interface OpponentView {
  name: string;
  trophies: number;
  hallLevel: number;
  /** A real player's base, or a server-generated one when nobody fits. */
  kind: 'player' | 'bot';
}

export interface MatchResponse {
  ticket: string;
  /**
   * The battle seed for this ticket, chosen by the server. The client plays
   * the battle with it and sends it back in `BattleSubmission.seed`. Servers
   * from before server seeds leave it out; the client then picks its own.
   */
  seed: number;
  /** The base to attack, loot already reduced by the attacker's loot penalty. */
  base: BaseLayout;
  opponent: OpponentView;
  /** The attack must be submitted before this time. */
  expiresAt: number;
}

/** The battle a client played; the server re-runs it from seed + deployments. */
export interface BattleSubmission {
  ticket: string;
  /**
   * The ticket's seed (`MatchResponse.seed` / `RaidTicketResponse.seed`). The
   * server re-simulates with the seed it issued; a different one is refused
   * with `bad_request` (an old client that picks its own seed must update).
   */
  seed: number;
  army: Record<string, number>;
  levels?: Record<string, number>;
  /** Donated troops in `army` and the level each was donated at (protocol 6+). */
  reinforcements?: Record<string, { count: number; level: number }>;
  deployments: Deployment[];
  endTick?: number;
  /**
   * The result hash the client's own simulation got. Only for spotting
   * desyncs (counted and logged by the server); never trusted.
   */
  clientHash?: string;
}

export interface AttackResponse {
  attackId: string;
  result: BattleResult;
  /** Trophy change for the attacker. */
  trophies: number;
  /** The attacker's trophies after the attack. */
  playerTrophies: number;
}

export interface DefenseView {
  id: string;
  at: number;
  attackerName: string;
  seed: number;
  army: Record<string, number>;
  levels: Record<string, number>;
  base: BaseLayout;
  deployments: Deployment[];
  endTick?: number;
  result: BattleResult;
  /** The attack used Infiltration Points (replay with the same rule). Absent on attacks from before protocol v5. */
  infiltration?: boolean;
  /** Donated troops the attacker brought, with their levels (protocol 6+). */
  reinforcements?: Record<string, { count: number; level: number }>;
  /** Battle rules version the server simulated it with; a replay is shown only when it matches (protocol 6+). */
  rules?: number;
  /** Trophy change for the defender. */
  trophies: number;
}

export interface DefensesResponse {
  defenses: DefenseView[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  trophies: number;
  hallLevel: number;
  grove: string | null;
}
/** GET /v1/leaderboard/power (roadmap step 31): Attack Rating plus power, for players with enough rated attacks. */
export interface PowerLeaderboardEntry {
  rank: number;
  name: string;
  power: number;
  hallLevel: number;
  grove: string | null;
}
export interface PowerLeaderboardResponse {
  players: PowerLeaderboardEntry[];
  /** Null until the player has enough rated attacks. */
  me: { rank: number; power: number; battles: number } | null;
}

export interface LeaderboardResponse {
  players: LeaderboardEntry[];
  me: { rank: number; trophies: number } | null;
}

// ---------------------------------------------------------------- Groves

export interface GroveSummary {
  id: string;
  name: string;
  color: string;
  members: number;
  maxMembers: number;
  averageTrophies: number;
}
export interface GrovesResponse {
  groves: GroveSummary[];
}

export interface CreateGroveRequest {
  name: string;
}

export type GroveRole = 'Leader' | 'Elder' | 'Member';

export interface MemberView {
  id: string;
  name: string;
  role: GroveRole;
  trophies: number;
  hallLevel: number;
  lastSeenAt: number;
  /** Grove XP from donations. */
  xp: number;
}

export interface GroveView {
  id: string;
  name: string;
  color: string;
  maxMembers: number;
  members: MemberView[];
  you: { id: string; role: GroveRole; xp: number };
}

/** GET /v1/grove: the player's Grove, or null when they are not in one. */
export interface MyGroveResponse {
  grove: GroveView | null;
}

export interface ChatView {
  id: string;
  at: number;
  /** Null for system messages. */
  from: { id: string; name: string } | null;
  text: string;
  kind: 'chat' | 'request' | 'donation' | 'system';
}

export interface ChatResponse {
  /** Newer messages, without hidden ones or ones from players the caller blocked. */
  messages: ChatView[];
  /** Pass back as ?after= to get only newer messages. */
  cursor: string;
  /**
   * Ids of recent messages that moderation has removed (they may already be
   * on screen): drop them. Absent from servers without moderation.
   */
  hidden?: string[];
}

export interface PostChatRequest {
  text: string;
}

export interface RequestView {
  id: string;
  at: number;
  playerId: string;
  name: string;
  /** Housing space asked for and filled so far. */
  size: number;
  filled: number;
  mine: boolean;
}

export interface RequestsResponse {
  requests: RequestView[];
  /** When the player may ask again (0 = now). */
  nextRequestAt: number;
}

export interface CreateRequestRequest {
  /** Free housing in the requester's Grove Lodge. */
  capacity: number;
}

export interface DonateRequest {
  troop: string;
  count: number;
  level: number;
}

export interface DonateResponse {
  request: RequestView;
  xp: number;
}

export interface DonationView {
  id: string;
  at: number;
  fromName: string;
  troop: string;
  count: number;
  level: number;
}

export interface InboxResponse {
  donations: DonationView[];
}

export interface AckRequest {
  ids: string[];
}

// ---------------------------------------------------------------- Linked sign-ins (roadmap step 24)

export type LinkProvider = 'apple' | 'google' | 'gamecenter' | 'playgames';

/**
 * What a provider's sign-in gives the game, passed through to the server:
 * apple/google `{ idToken }`; gamecenter `{ teamPlayerId, bundleId,
 * timestamp, salt, signature, publicKeyUrl }`; playgames `{ serverAuthCode }`.
 */
export type LinkCredential = Record<string, unknown>;

/** GET /v1/links; POST /v1/links { provider, credential } links; DELETE /v1/links/:provider unlinks. */
export interface LinksResponse {
  /** Providers this server can check. */
  providers: LinkProvider[];
  links: { provider: LinkProvider; linkedAt: number }[];
}

/** POST /v1/sessions (no token): `{ provider, credential, device? }` → `RegisterResponse` for the linked player. */
export interface SignInRequest {
  provider: LinkProvider;
  credential: LinkCredential;
  device?: string;
}

// ---------------------------------------------------------------- Server-owned village (roadmap Phase 2)

/**
 * A village kept on the server (feature `server-economy`). GET /v1/village
 * returns it (404 `no_village` if the village lives on the device); POST
 * /v1/village starts one on the server (or returns the one there).
 */
export interface VillageResponse {
  /** The whole village as a save file (the game loads it with deserialize). */
  file: SaveFile;
  revision: number;
  /** The last command of this player the server applied. */
  seq: number;
  /** The time the village is settled to. */
  at: number;
  /** economyHash of the village. */
  stateHash: string;
}

/** One player action, numbered by the game (`seq` goes up by one per command) and timed by its clock. */
export interface VillageCommand {
  seq: number;
  /** When the player did it (the game's clock, epoch ms). */
  t: number;
  command: Command;
}

/** POST /v1/village/commands: what the player did since the last batch. */
export interface CommandBatch {
  /** The game's economy hash right after its last command in this batch. */
  stateHash: string;
  commands: VillageCommand[];
}

export interface CommandOutcome {
  seq: number;
  ok: boolean;
  /** Why it was refused (a sim error code, NOT_ALLOWED, TOO_MANY_BATTLES). */
  error?: string;
}

export interface CommandBatchResponse {
  /** Every command up to here was processed (applied or refused); drop them from the queue. */
  ackSeq: number;
  revision: number;
  /** The server's economy hash after the batch. */
  stateHash: string;
  /** Commands that were in this batch (repeats of already-applied ones are left out). */
  results: CommandOutcome[];
  /**
   * Present when the server's economy differs from the game's: the game puts
   * this economy in place (the server is the truth) and replays any commands
   * it has queued since.
   */
  corrections?: { economy: Economy; at: number };
}

export interface LedgerEntryView {
  at: number;
  resource: string;
  delta: number;
  balance: number;
  reason: string;
}
export interface LedgerResponse {
  entries: LedgerEntryView[];
}

// ---------------------------------------------------------------- Reports and blocks

export type ReportReason = 'harassment' | 'hate' | 'sexual' | 'spam' | 'cheating' | 'name' | 'other';
export const REPORT_REASONS: readonly ReportReason[] = ['harassment', 'hate', 'sexual', 'spam', 'cheating', 'name', 'other'];

/** POST /v1/reports: report a chat message (the server keeps its text as it was) or a player. */
export interface ReportRequest {
  kind: 'chat' | 'player';
  /** kind 'chat': a message in the caller's Alliance chat. */
  messageId?: string;
  /** kind 'player': whom to report. */
  playerId?: string;
  reason: ReportReason;
  note?: string;
  /** Also block the player (hide their messages and requests from the caller). */
  block?: boolean;
}
export interface ReportResponse {
  /** Null when the caller already has an open report on it (nothing new was filed). */
  id: string | null;
  alreadyReported: boolean;
  blocked: boolean;
}

export interface BlockRequest {
  playerId: string;
}
export interface BlockView {
  id: string;
  name: string;
  at: number;
}
/** GET /v1/blocks. POST /v1/blocks { playerId } blocks (204); DELETE /v1/blocks/:id unblocks (204). */
export interface BlocksResponse {
  blocked: BlockView[];
}

// ---------------------------------------------------------------- Grove Raid

export interface RaidMemberView {
  index: number;
  name: string;
  hallLevel: number;
  trophies: number;
}

export interface RaidView {
  phase: 'upcoming' | 'live' | 'ended';
  week: number;
  start: number;
  end: number;
  nextStart: number;
  /** False when the player joined their Grove after this raid started (they take part from next week). */
  eligible: boolean;
  opponent: { name: string; kind: 'grove' | 'bot'; members: RaidMemberView[] } | null;
  ours: number;
  theirs: number;
  /** Best stars so far on each enemy base (by index). */
  enemyBaseStars: number[];
  attacksLeft: number;
  result: { outcome: 'win' | 'draw' | 'loss'; ours: number; theirs: number } | null;
  /** The player already collected this week's chest. */
  claimed: boolean;
  /**
   * Ended Grove Raids (this week and last week) the player took part in, and
   * whether their chest was claimed. Claiming again is safe and returns the
   * same outcome, so a client that lost a claim answer can recover it.
   */
  chests: { week: number; claimed: boolean }[];
}

export interface RaidTicketRequest {
  target: number;
}
export interface RaidTicketResponse {
  ticket: string;
  /** The battle seed for this ticket, chosen by the server (see MatchResponse.seed). */
  seed: number;
  base: BaseLayout;
  expiresAt: number;
}

export interface RaidAttackResponse {
  result: BattleResult;
  stars: number;
  ours: number;
  theirs: number;
}

export interface RaidClaimRequest {
  week: number;
}
export interface RaidClaimResponse {
  week: number;
  outcome: 'win' | 'draw' | 'loss';
  /** Final stars for each side. */
  ours: number;
  theirs: number;
  /** True when this claim was already made (safe to retry). */
  alreadyClaimed: boolean;
}

// ---------------------------------------------------------------- purchases (roadmap Phase 4)

export type PurchaseStore = 'apple' | 'google';

export interface PurchaseIntentRequest {
  store: PurchaseStore;
  /** The game's product id (store.json packs, pass.json, offers.json). */
  productId: string;
  /** The player's age group from the game; ignored when the server holds the village (it knows). */
  under18: boolean | null;
}
export interface PurchaseIntentResponse {
  /** A UUID: Apple appAccountToken / Google obfuscatedAccountId. */
  accountToken: string;
  /** The product's id in that store. */
  storeProductId: string;
}

export interface RedeemRequest {
  store: PurchaseStore;
  /** The product's id in that store (Google needs it to look the token up). */
  storeProductId: string;
  /** Apple: the transaction's JWS (jwsRepresentation). Google: the purchase token. */
  receipt: string;
}
export interface RedeemResponse {
  /** The id the village records the purchase under ("apple:…", "google:…"). */
  transactionId: string;
  /** The game's product id. */
  productId: string;
  usd: number;
  /** The server delivered it into the village it holds; otherwise the game delivers it. */
  heldOnServer: boolean;
  /** It was redeemed before (a retry): nothing new was credited. */
  already: boolean;
}

export interface PurchaseView {
  transactionId: string;
  store: PurchaseStore;
  productId: string;
  usd: number;
  at: number;
  status: 'credited' | 'refunded';
}
export interface PurchaseHistoryResponse {
  purchases: PurchaseView[];
}

// ---------------------------------------------------------------- push (roadmap step 40)

export interface PushTokenRequest {
  token: string;
  platform: 'ios' | 'android';
  /** Notification types this device switched on (notifications.json ids). */
  types: string[];
  /** Date#getTimezoneOffset on the device, for quiet hours and the daily limit. */
  tzOffsetMinutes: number;
}

// ---------------------------------------------------------------- seasons (roadmap step 55)

/** A closed season's archived Honor top (seasons are UTC months: year * 12 + month). */
export interface SeasonLeaderboardResponse {
  /** Null before the server closed its first season. */
  season: number | null;
  players: { rank: number; name: string; honor: number; hallLevel: number }[];
  me: { rank: number; honor: number } | null;
}

// ---------------------------------------------------------------- friends (roadmap steps 59-61)

/** Who can find a player by typing their name. */
export type Findable = 'everyone' | 'friends_of_friends' | 'nobody';

/** What anyone who found a player sees. */
export interface ProfileCard {
  id: string;
  name: string;
  hallLevel: number;
  honor: number;
  /** League display name. */
  league: string;
  /** Their Gang's name, if any (step 63). */
  gang: string | null;
  /** Staff or official account (a badge nobody else can get). */
  staff: boolean;
}

export interface FriendView extends ProfileCard {
  since: number;
  /** Last seen online; null when they hide it. */
  lastSeen: number | null;
  /** Their name before a recent change ("formerly …"), for 28 days. */
  formerly: string | null;
}

export interface FriendRequestView {
  id: string;
  at: number;
  player: ProfileCard;
}

export interface FriendsResponse {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  code: string;
  findable: Findable;
  hideOnline: boolean;
  max: number;
}

export interface FriendRequestRequest {
  code?: string;
  name?: string;
}
export interface FriendRequestResult {
  /** 'friends': they had already asked you, so you are friends now. */
  status: 'sent' | 'friends';
}

export type SuggestionReason = 'opponent' | 'alliance' | 'gamecenter' | 'playgames';
export interface SuggestionsResponse {
  players: (ProfileCard & { reason: SuggestionReason })[];
}

export interface PrivacyRequest {
  findable?: Findable;
  hideOnline?: boolean;
}

export interface FriendImportRequest {
  provider: 'gamecenter' | 'playgames';
  /** The platform's ids of the player's friends (Game Center teamPlayerID, Play Games player id). */
  ids: string[];
}

// ---------------------------------------------------------------- Gangs (roadmap step 63)

export interface GangMemberView {
  id: string;
  name: string;
  role: 'leader' | 'member';
  hallLevel: number;
  honor: number;
  /** Null when they hide when they were last online. */
  lastSeen: number | null;
  staff: boolean;
}

export interface GangView {
  id: string;
  name: string;
  members: GangMemberView[];
  you: { role: 'leader' | 'member' };
  /** Invites the Gang sent that are still open. */
  invites: { id: string; at: number; player: ProfileCard }[];
  max: number;
}

export interface GangInviteView {
  id: string;
  at: number;
  gang: { id: string; name: string; members: number };
  from: string;
}

export interface MyGangResponse {
  gang: GangView | null;
  invites: GangInviteView[];
  /** After leaving a Gang: when the player may join or start another (0: now). */
  canJoinAt: number;
}

// ---------------------------------------------------------------- Friendly Duels (roadmap step 62)

export interface DuelTicketRequest {
  friendId: string;
  /** Their live base (default) or the duel layout they set. */
  layout?: 'live' | 'duel';
}
export interface DuelTicketResponse {
  ticket: string;
  seed: number;
  base: BaseLayout;
  expiresAt: number;
  opponent: { id: string; name: string };
  /** Which base this is ('duel' only when they set a duel layout). */
  layout: 'live' | 'duel';
}

/** A duel report: the same shape as a PvP report, plus the challenge it answers. */
export type DuelSubmission = BattleSubmission & { challengeId?: string };

export interface RivalryView {
  friendId: string;
  name: string;
  duels: number;
  myWins: number;
  theirWins: number;
  myBest: number;
  theirBest: number;
}

export interface ChallengeView {
  id: string;
  with: { id: string; name: string };
  startedByMe: boolean;
  endsAt: number;
  myDone: boolean;
  theirDone: boolean;
  /** 'me' or 'them' (more stars, then destruction), 'draw', or null while open. */
  winner: 'me' | 'them' | 'draw' | null;
  status: 'open' | 'done' | 'expired';
}

export interface DuelResponse {
  duelId: string;
  result: BattleResult;
  rivalry: RivalryView;
  challenge: ChallengeView | null;
}

export interface DuelView {
  id: string;
  at: number;
  attacker: { id: string; name: string };
  defender: { id: string; name: string };
  /** I attacked (else I defended). */
  mine: boolean;
  layout: 'live' | 'duel';
  challengeId: string | null;
  result: { stars: number; destruction: number };
  replay: { seed: number; base: BaseLayout; army: Record<string, number>; levels: Record<string, number>; reinforcements?: Record<string, { count: number; level: number }>; deployments: Deployment[]; endTick?: number; rules: number };
}

export interface DuelsResponse {
  duels: DuelView[];
  rivalries: RivalryView[];
  challenges: ChallengeView[];
  hasDuelLayout: boolean;
}

