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
 * (`ClientHeaders`), and writes carry an Idempotency-Key. 8 (roadmap steps
 * 72–75): the game also sends `x-data-version`; tickets are checked with the
 * battle rules they were issued under, and `/v1/hello` lists `supportedRules`
 * and `minClientBuild` so an old game can say "Update Kagemura". Servers
 * still accept 7 (it already sends `x-sim-rules`). 9 (roadmap steps 57-70):
 * Friendly Duels, Gangs and Gang Wars (features `duels`, `gangs`,
 * `gang-wars`), relay strikes (SIM_RULES 3, `BattleSetup.startDamage`),
 * `503 busy` from the re-simulation queue. All additions: servers still
 * accept 7.
 *
 * v10 (ledger audit A1): `GET /v1/match` no longer sends the battle seed;
 * `POST /v1/attacks/start` returns it (`AttackStartResponse.seed`) when the
 * player taps Attack, and the raid counts from then on. A started raid not
 * reported REPORT_GRACE_MS after Attack is settled as a loss when its
 * attacker next asks for a match, so the game sends its waiting reports
 * first. Servers refuse `match` from games older than 10 with 426.
 */
export const PROTOCOL_VERSION = 10;

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
  /** 409: another raid shielded this defender after the ticket was issued; the battle counts as practice (re-audit). */
  | 'defender_protected'
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
  /** 409: that name belongs to someone else (or is held for its previous owner); `suggestions` lists free ones. */
  | 'name_taken'
  /** 429: one name change per 28 days; the message says when the next one is free. */
  | 'name_cooldown'
  /** 503: the server is too busy to check a battle right now (step 57); retried like any server error. */
  | 'busy'
  /** 403: this player's age group does not allow it (free-text chat or a chosen name under 13; the message says what does work). */
  | 'age_restricted'
  /** 403: accept the community rules first (`PUT /v1/me/rules`; report section 5 step 7, compliance C14). */
  | 'rules_required';

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  /** `name_taken` and refused names: free names close to the one asked for. */
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
  /** POST { ticket }: the player tapped Attack; from now on the raid counts even if never reported (re-audit). */
  attackStart: '/v1/attacks/start',
  /** POST { ticket }: leave a scouted base without attacking (only before it started). */
  attackVoid: '/v1/attacks/void',
  purchaseIntent: '/v1/purchases/intent',
  /** POST: a purchase was cancelled (frees the age-cap hold) or is pending approval (holds longer). */
  purchaseIntentRelease: '/v1/purchases/intent/release',
  /** POST: redeem a store receipt (verified, credited once); GET: purchase history. */
  purchases: '/v1/purchases',
  /** POST, no token: App Store Server Notifications v2 (signed by Apple). */
  appleNotifications: '/v1/webhooks/apple',
  /** POST, no token: Google Play Real-time Developer Notifications (Pub/Sub push, OIDC-signed). */
  googleNotifications: '/v1/webhooks/google',
  /** PUT: this device's push token and choices; DELETE (?token=): stop pushing to it. */
  pushTokens: '/v1/push/tokens',
  /** GET, no token: the signed balance bundle for this game's rules, if any (step 76; feature `balance-bundles`). */
  balance: '/v1/balance',
  /**
   * POST, no token (StatsBatch): events an adult player chose to share, under a random statistics id;
   * DELETE (?install=): forget everything that id sent (report section 5 step 5; feature `stats`).
   */
  stats: '/v1/stats',
  /** GET: friends, requests, my friend code and privacy (step 59; feature `friends`). */
  friends: '/v1/friends',
  /** DELETE: stop being friends. */
  friend: (playerId: string) => `/v1/friends/${encodeURIComponent(playerId)}`,
  /** POST { name } | { code } | { playerId }: ask someone to be friends. */
  friendRequests: '/v1/friends/requests',
  /** POST { accept }: answer a request to me; DELETE: take back my own. */
  friendRequest: (id: string) => `/v1/friends/requests/${encodeURIComponent(id)}`,
  /** GET ?name=: one player by exact name (rate limited; respects their privacy). */
  playerLookup: '/v1/players/lookup',
  /** GET: one player by friend code (codes are shared on purpose). */
  playerByCode: (code: string) => `/v1/players/code/${encodeURIComponent(code)}`,
  /** PUT { findable?, showOnline? }: who can find me by name, and whether friends see when I was online. */
  privacy: '/v1/me/privacy',
  /** POST { provider, ids }: which of my Game Center / Play Games friends play Kagemura (step 61, opt-in). */
  platformFriends: '/v1/friends/platform',
  /** Friendly Duels (step 62; feature `duels`). POST { friendId, layout?, challengeId? }: a duel ticket. */
  duelTicket: '/v1/duels/ticket',
  /** POST BattleSubmission: report a duel; GET ?since=: my duels both ways, with replays. */
  duels: '/v1/duels',
  /** PUT { base | null }: the layout friends duel against (or none: my village). */
  duelLayout: '/v1/duels/layout',
  /** POST { friendId }: challenge a friend (both attack within 24 h); GET: my challenges. */
  duelChallenges: '/v1/duels/challenges',
  /** Gangs (step 63; feature `gangs`). GET: my Gang (or null) and invites to me; POST { name }: found one. */
  squad: '/v1/squad',
  /** POST { friendId }: invite a friend (leader only). */
  squadInvites: '/v1/squad/invites',
  /** POST { accept }: answer an invite to me. */
  squadInvite: (id: string) => `/v1/squad/invites/${encodeURIComponent(id)}`,
  squadLeave: '/v1/squad/leave',
  /** POST { playerId }: make another member the leader. */
  squadLeader: '/v1/squad/leader',
  /** GET ?after= / POST { text }: Gang chat (filtered, rate limited, reportable). */
  squadChat: '/v1/squad/chat',
  /** GET / POST { capacity }: troop requests inside the Gang; gifts arrive in the usual inbox. */
  squadRequests: '/v1/squad/requests',
  squadDonate: (id: string) => `/v1/squad/requests/${encodeURIComponent(id)}/donate`,
  /** Gang Wars (steps 65-66; feature `gang-wars`). GET: the current war, the search, recent wars and chests. */
  squadWar: '/v1/squad/war',
  /** POST: the leader starts looking for an opposing Gang; DELETE: stop looking. */
  squadWarQueue: '/v1/squad/war/queue',
  /** POST: during prep, copy my current village into the war again (moved defenses). */
  squadWarBase: '/v1/squad/war/base',
  /** POST { target, relay }: a war ticket (a relay strike starts from the damage so far). */
  squadWarTicket: '/v1/squad/war/ticket',
  /** POST BattleSubmission: report a war strike. */
  squadWarAttacks: '/v1/squad/war/attacks',
  /** POST { warId }: claim my chest once the war has ended. */
  squadWarClaim: '/v1/squad/war/claim',
  /** PUT { band }: the age band this device knows (null: just ask); the answer is the band the server keeps (feature `age-bands`). */
  meAge: '/v1/me/age',
  /** PUT { version }: this account accepted the community rules (feature `rules-acceptance`; chat and names need it). */
  meRules: '/v1/me/rules',
  /** POST: a one-time code for the web deletion page (feature `deletion-codes`). */
  deletionCode: '/v1/me/deletion-code',
  /** GET: moderation notices for me; POST /read { ids } marks them read (feature `notices`). */
  notices: '/v1/notices',
  noticesRead: '/v1/notices/read',
  /** POST: sign out every other device of this account (feature `sessions`). */
  sessionsRevokeOthers: '/v1/sessions/revoke-others',
  /** POST, no token: Sign in with Apple server-to-server notifications (consent revoked, account deleted). */
  appleSignInNotifications: '/v1/webhooks/apple-signin',
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
  /**
   * Protocol 8 (roadmap step 75): the battle-rule versions (SIM_RULES) this
   * server can check, newest first. A game whose SIM_RULES is not listed must
   * update before playing online (it shows "Update Kagemura").
   */
  supportedRules?: number[];
  /** Protocol 8: the oldest game build allowed online (e.g. "1.2.0"); older builds must update. */
  minClientBuild?: string;
  /** Protocol 8: the server's live data version (for support and dashboards). */
  dataVersion?: string;
}

/** GET /v1/balance (roadmap step 76): the operators' signed number changes, or null. */
export interface BalanceResponse {
  bundle: import('./balanceBundle').BalanceBundle | null;
  /** Experiment arms (report section 5 step 5): each player takes the arm their statistics id falls in, else `bundle`. */
  cohorts?: import('./balanceBundle').BalanceBundle[];
}

/** POST /v1/stats answer: how many events were kept (the others were not shareable). */
export interface StatsResponse {
  accepted: number;
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
  /** Protocol 8 (step 59): when the next name change is free (0: now). */
  nameChangeAt?: number;
  /** Protocol 8: staff and official accounts (shown with a badge nobody else can get). */
  staff?: boolean;
}

export interface RenameRequest {
  name: string;
}

// ---------------------------------------------------------------- friends (roadmap step 59)

/** Who may find a player by typing their name (friend codes always work). */
export type Findable = 'everyone' | 'friends_of_friends' | 'nobody';

/** A player as a profile card: lookups, friends and requests. */
export interface PlayerCard {
  id: string;
  name: string;
  /** Keep level. */
  keep: number;
  honor: number;
  /** League id (ranks.json). */
  league: string;
  /** Their Alliance's name, if any. */
  alliance: string | null;
  /** Staff and official accounts. */
  staff?: boolean;
  /** Their previous name, for 28 days after a change. */
  formerly?: string;
  /** How this player relates to me. */
  relation: 'self' | 'friend' | 'requested' | 'incoming' | 'none';
}

export interface FriendView extends PlayerCard {
  /** Friends since (epoch ms). */
  since: number;
  /** Last time they were online, unless they hide it. */
  lastSeen?: number;
}

export interface FriendRequestView {
  id: string;
  at: number;
  /** Requests lapse after 14 days. */
  expiresAt: number;
  /** The other player (the sender for incoming, the receiver for outgoing). */
  player: PlayerCard;
}

export interface FriendsResponse {
  /** My friend code, e.g. "KAGE-7Q4M2K" (share it, or as a link or QR code). */
  code: string;
  findable: Findable;
  showOnline: boolean;
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  /** Most friends a player can have. */
  max: number;
}

export interface FriendRequestBody {
  name?: string;
  code?: string;
  playerId?: string;
}

/** `friends`: they had already asked me, so we are friends now. */
export interface FriendRequestResult {
  status: 'sent' | 'friends';
  request?: FriendRequestView;
  friend?: FriendView;
}

/** Step 61: friend ids from Game Center (teamPlayerID) or Play Games, read on the device with the player's permission. */
export interface PlatformFriendsRequest {
  provider: 'gamecenter' | 'playgames';
  ids: string[];
}
export interface PlatformFriendsResponse {
  /** Kagemura players among them (not blocked either way, not hidden from search). */
  players: PlayerCard[];
}

// ---------------------------------------------------------------- duels (roadmap step 62)

/** Duel against the friend's village, or their duel layout if they set one. */
export interface DuelTicketRequest {
  friendId: string;
  layout?: 'live' | 'duel';
  /** Attack for a duel challenge (each side once). */
  challengeId?: string;
}
export interface DuelTicketResponse {
  ticket: string;
  seed: number;
  /** Their base, without loot (duels never pay). */
  base: BaseLayout;
  opponent: { id: string; name: string; keep: number };
  /** Which layout this is. */
  layout: 'live' | 'duel';
  expiresAt: number;
}

/** Wins, best stars and best destruction as the attacker, both ways. */
export interface RivalryView {
  friendId: string;
  duels: number;
  wins: number;
  bestStars: number;
  bestDestruction: number;
  theirDuels: number;
  theirWins: number;
  theirBestStars: number;
  theirBestDestruction: number;
}

export interface DuelView {
  id: string;
  at: number;
  /** 'attack': I attacked; 'defense': they attacked my base. */
  side: 'attack' | 'defense';
  opponent: { id: string; name: string };
  challengeId?: string;
  seed: number;
  army: Record<string, number>;
  levels: Record<string, number>;
  base: BaseLayout;
  deployments: Deployment[];
  endTick?: number;
  result: BattleResult;
  rules: number;
}
export interface DuelsResponse {
  duels: DuelView[];
  rivalries: RivalryView[];
}
export interface DuelReportResponse {
  duelId: string;
  result: BattleResult;
  rivalry: RivalryView;
  challenge?: ChallengeView;
}

export interface DuelLayoutRequest {
  base: BaseLayout | null;
}

/** A duel challenge: both attack each other within 24 h; more stars, then destruction, wins. */
export interface ChallengeView {
  id: string;
  createdAt: number;
  expiresAt: number;
  opponent: { id: string; name: string };
  /** I sent it. */
  mine: boolean;
  my: { stars: number; destruction: number } | null;
  their: { stars: number; destruction: number } | null;
  /** Decided when both attacked or time ran out. */
  outcome: 'win' | 'loss' | 'draw' | null;
}
export interface ChallengesResponse {
  challenges: ChallengeView[];
}

// ---------------------------------------------------------------- Gangs (roadmap step 63)

export interface SquadMemberView {
  id: string;
  name: string;
  keep: number;
  honor: number;
  role: 'leader' | 'member';
  joinedAt: number;
  lastSeen?: number;
  you: boolean;
}
export interface SquadView {
  id: string;
  name: string;
  members: SquadMemberView[];
  /** Invites the leader sent that are still open. */
  invited: { id: string; name: string; at: number }[];
  max: number;
  /** Gang Rating (step 66), shown as a number. */
  rating: number;
  /** Leaving or joining waits while a Gang War runs (the roster is locked). */
  locked: boolean;
}
export interface SquadInviteView {
  id: string;
  at: number;
  squad: { id: string; name: string; members: number };
  from: { id: string; name: string };
}
export interface SquadResponse {
  squad: SquadView | null;
  invites: SquadInviteView[];
  /** When this player may join a Gang again after leaving one (0: now). */
  canJoinAt: number;
}

// ---------------------------------------------------------------- Gang Wars (roadmap steps 65-66)

export interface GangWarBaseView {
  index: number;
  name: string;
  keep: number;
  /** The layout (enemy bases, to attack; our own, to see what they face). */
  base: BaseLayout;
  /** Its best result so far (a relay counts as one combined result). */
  best: { stars: number; destruction: number };
  /** The relay on it: damage so far, strikes, who struck last, and whether someone holds the next strike. */
  relay: { stars: number; destruction: number; strikes: number; lastBy: string | null; busy: boolean } | null;
}
export interface GangWarView {
  id: string;
  phase: 'prep' | 'battle' | 'ended';
  prepEndsAt: number;
  endsAt: number;
  size: number;
  opponent: { name: string; bot: boolean };
  ours: { stars: number; destruction: number };
  theirs: { stars: number; destruction: number };
  /** Our bases and what the enemy did to them. */
  mine: GangWarBaseView[];
  /** Their bases and what we did to them. */
  enemy: GangWarBaseView[];
  /** My attacks left (0 outside the battle day, or for a member who joined after it started). */
  attacksLeft: number;
  /** My index in our roster (null: not in this war). */
  myIndex: number | null;
  outcome: 'win' | 'draw' | 'loss' | null;
  claimed: boolean;
  /** The war so far, newest first: who hit which base (yours: replays in your battle log). */
  log: { at: number; by: string; ours: boolean; target: string; stars: number; destruction: number; relay: boolean }[];
}
export interface GangWarResponse {
  war: GangWarView | null;
  /** The leader is looking for an opponent; a generated Gang is offered from `botAt`. */
  queued: { since: number; botAt: number } | null;
  /** Ended wars this player took part in, newest first, with whether the chest was claimed. */
  recent: { id: string; opponent: string; bot: boolean; outcome: 'win' | 'draw' | 'loss'; ours: number; theirs: number; endsAt: number; claimed: boolean }[];
}
export interface GangWarTicketRequest {
  target: number;
  relay?: boolean;
}
export interface GangWarTicketResponse {
  ticket: string;
  seed: number;
  base: BaseLayout;
  /** A relay strike: the damage it starts from (BattleSetup.startDamage). */
  startDamage?: Record<string, number>;
  expiresAt: number;
}
export interface GangWarAttackResponse {
  result: BattleResult;
  ours: { stars: number; destruction: number };
  theirs: { stars: number; destruction: number };
}
export interface GangWarClaimResponse {
  warId: string;
  outcome: 'win' | 'draw' | 'loss';
  alreadyClaimed: boolean;
  /** The war was against a generated Gang: its chest pays no Jade (ledger audit E13; absent from older servers). */
  generated?: boolean;
}

export interface PrivacyRequest {
  findable?: Findable;
  showOnline?: boolean;
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
  /** Ignored and never stored (worldwide audit GLOBAL-019: the deletion flow needs no email). Older pages may still send it. */
  contact?: string;
  note?: string;
  /** The one-time deletion code from Settings → Online play → Account: with the Player ID it proves the request is the player's. */
  code?: string;
}
/** POST /v1/me/deletion-code: shown once in Settings; only its hash is kept. */
export interface DeletionCodeResponse {
  code: string;
  expiresAt: number;
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
   * Protocol 7–9 only. Since protocol 10 the seed comes from
   * `POST /v1/attacks/start` (`AttackStartResponse.seed`), so a raid cannot be
   * played out before it counts (ledger audit A1). When neither answer has
   * one, the client picks its own (servers from before server seeds).
   */
  seed?: number;
  /** The base to attack, loot already reduced by the attacker's loot penalty. */
  base: BaseLayout;
  opponent: OpponentView;
  /** The attack must be submitted before this time. */
  expiresAt: number;
}

/** POST /v1/attacks/start (feature `attack-commit`): the raid now counts. */
export interface AttackStartResponse {
  started: boolean;
  /**
   * The battle seed the server issued with the ticket (protocol 10, ledger
   * audit A1). The game plays the battle with it and sends it back in
   * `BattleSubmission.seed`. Absent from older servers, which sent it with
   * the match.
   */
  seed?: number;
}

/** The battle a client played; the server re-runs it from seed + deployments. */
export interface BattleSubmission {
  ticket: string;
  /**
   * The ticket's seed (`AttackStartResponse.seed` / `RaidTicketResponse.seed`). The
   * server re-simulates with the seed it issued; a different one is refused
   * with `bad_request` (an old client that picks its own seed must update).
   */
  seed: number;
  army: Record<string, number>;
  levels?: Record<string, number>;
  /** Donated troops in `army` and the level each was donated at (protocol 6+). */
  reinforcements?: Record<string, { count: number; level: number }>;
  /** The clan hero and level (SIM_RULES 5, report section 5 step 8); the server checks it against the attacker's Keep. */
  hero?: { id: string; level: number };
  deployments: Deployment[];
  endTick?: number;
  /**
   * The result hash the client's own simulation got. Only for spotting
   * desyncs (counted and logged by the server); never trusted.
   */
  clientHash?: string;
  /**
   * The SIM_RULES and data version the game played the battle with (protocol
   * 8). Must match the ticket's; the server re-simulates with the ticket's.
   */
  rules?: number;
  dataVersion?: string;
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
  /** The attacker's hero (SIM_RULES 5). */
  hero?: { id: string; level: number };
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
  /** Index in PRESET_CHAT, only set for validated ready-made chat. */
  presetId?: number;
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
  /**
   * Only on a village move (POST /v1/village/import, GLOBAL-002): what the
   * server held back because it could not confirm where it came from. The
   * game takes the server's village and keeps its own as a backup.
   */
  importHeld?: { jade: number; premium: boolean; purchases: number };
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
  /**
   * The sending queue's id (GLOBAL-009). With it, `seq` numbers are this
   * device's own: the server skips numbers it already processed for this
   * device and answers `ackSeq` in them. Without it (older games), `seq` is
   * compared with the village's single counter, as before.
   */
  device?: string;
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

/**
 * POST /v1/purchases/intent/release: what became of an intent that did not end in a receipt.
 * `cancelled` (the player closed the store sheet; nothing was charged) frees its share of the
 * under-18 cap at once; `pending` (Ask to Buy, a cash payment) keeps holding it for
 * `pendingHoldHours` so a late approval still counts. Anything else leaves the normal hold.
 */
export interface IntentReleaseRequest {
  accountToken: string;
  outcome: 'cancelled' | 'pending';
}
export interface IntentReleaseResponse {
  /** False when the intent was already used, belongs to someone else, or is unknown. */
  changed: boolean;
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
  /** This device’s chosen locale. Older clients default to English. */
  locale?: string;
  token: string;
  platform: 'ios' | 'android';
  /** Notification types this device switched on (notifications.json ids). */
  types: string[];
  /** Date#getTimezoneOffset on the device, for quiet hours and the daily limit. */
  tzOffsetMinutes: number;
}

// ---------------------------------------------------------------- age bands, notices, sessions (re-audit)

/** The age bands (src/gameplay/sim/age.ts): only ever stricter, on the device and on the server. */
export type AgeBandView = import('../../gameplay/sim/age').AgeBand;
/**
 * The community rules' version (public/community.html; the in-game short version is `ui/communityRules.ts`).
 * Bump it when the rules change: every account accepts again before chatting or naming (report section 5 step 7).
 */
export const COMMUNITY_RULES_VERSION = 2;
export interface RulesRequest {
  version: number;
}
export interface RulesResponse {
  /** The version this account has accepted (0: never). */
  version: number;
}

export interface AgeRequest {
  band: AgeBandView | null;
}
export interface AgeResponse {
  /** The band the server keeps (the stricter of what it had and what was sent); null when never stated. */
  band: AgeBandView | null;
}

/**
 * Chat for players under 13 (re-audit): these phrases only, never free text.
 * The server accepts exactly these strings from an under-13 account.
 */
export const PRESET_CHAT: readonly string[] = ['Hello!', 'Good luck!', 'Well played!', 'Thanks for the warriors!', 'Need warriors, please!', 'Ready for battle!', 'Nice attack!', 'See you later!'];

/**
 * Phrases older games offer (they said "troops" until the remnant audit, 2026-11-06): still accepted,
 * never offered, and stored as the preset they became, so every reader sees it in their language.
 */
export const PRESET_CHAT_RETIRED: Readonly<Record<string, number>> = { 'Thanks for the troops!': 3, 'Need troops, please!': 4 };

/** The preset a phrase is (current or retired wording), or -1 for free text. */
export function presetChatId(text: string): number {
  const t = text.trim();
  const i = PRESET_CHAT.indexOf(t);
  return i >= 0 ? i : PRESET_CHAT_RETIRED[t] ?? -1;
}

/** A moderation notice (EU DSA art. 16(5)/17): what was decided and how to appeal. */
export interface NoticeView {
  id: string;
  at: number;
  kind: 'report_outcome' | 'moderation_action' | 'account';
  text: string;
  read: boolean;
}
export interface NoticesResponse {
  notices: NoticeView[];
}
export interface RevokeOthersResponse {
  /** How many other devices were signed out. */
  revoked: number;
}
