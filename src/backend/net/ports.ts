/**
 * Ports: what the game needs from a multiplayer server, as plain async
 * interfaces. The game only talks to these. Adapters implement them:
 *   - HttpServerAdapter (src/net/httpAdapter.ts): any server speaking the
 *     protocol in protocol.ts over HTTPS (ours, or a future one).
 *   - InProcessServerAdapter (server/inProcess.ts): calls our server core
 *     directly, for tests and local sandboxes.
 */
import type {
  AttackResponse,
  BattleSubmission,
  BlocksResponse,
  CommandBatch,
  CommandBatchResponse,
  LedgerResponse,
  LinkCredential,
  LinkProvider,
  LinksResponse,
  VillageResponse,
  ChatResponse,
  ChatView,
  DefensesResponse,
  DonateRequest,
  DonateResponse,
  ErrorCode,
  GroveView,
  GrovesResponse,
  HelloResponse,
  InboxResponse,
  LeaderboardResponse,
  MatchResponse,
  PlayerView,
  PowerLeaderboardResponse,
  ChallengeView,
  DuelResponse,
  DuelsResponse,
  DuelSubmission,
  DuelTicketRequest,
  DuelTicketResponse,
  MyGangResponse,
  FriendImportRequest,
  FriendRequestRequest,
  FriendRequestResult,
  FriendsResponse,
  PrivacyRequest,
  ProfileCard,
  SuggestionsResponse,
  SeasonLeaderboardResponse,
  PurchaseHistoryResponse,
  PurchaseIntentRequest,
  PurchaseIntentResponse,
  PushTokenRequest,
  RedeemRequest,
  RedeemResponse,
  RaidAttackResponse,
  RaidClaimResponse,
  RaidTicketResponse,
  RaidView,
  RegisterResponse,
  ReportRequest,
  ReportResponse,
  RequestView,
  RequestsResponse,
  UploadBaseRequest,
} from './protocol';

/** A failed server call, with the protocol error code. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    /** Name suggestions with `name_taken` / `bad_name`. */
    readonly suggestions: string[] = [],
  ) {
    super(message);
  }
  /**
   * Network problems, server hiccups and rate limits can be retried later;
   * rule violations cannot. (A rate-limited battle report stays in the outbox
   * instead of becoming a practice result.)
   */
  get retryable(): boolean {
    return this.code === 'network' || this.code === 'rate_limited' || this.status >= 500;
  }
}

export interface IdentityPort {
  hello(): Promise<HelloResponse>;
  register(name: string): Promise<RegisterResponse>;
  me(): Promise<PlayerView>;
  rename(name: string): Promise<PlayerView>;
  /** Delete this player's online account on the server, then forget its credentials on this device. */
  deleteAccount(): Promise<void>;
  /** Linked sign-ins (roadmap step 24). */
  links(): Promise<LinksResponse>;
  link(provider: LinkProvider, credential: LinkCredential): Promise<LinksResponse>;
  unlink(provider: LinkProvider): Promise<LinksResponse>;
  /** Become the player linked to this sign-in on this device (its own token; other devices keep theirs). */
  signIn(provider: LinkProvider, credential: LinkCredential, device?: string): Promise<RegisterResponse>;
}

export interface PvpPort {
  uploadBase(req: UploadBaseRequest): Promise<void>;
  /** Null when there is nobody to attack right now. */
  match(): Promise<MatchResponse | null>;
  submitAttack(sub: BattleSubmission): Promise<AttackResponse>;
  defenses(since: number): Promise<DefensesResponse>;
  leaderboard(limit?: number): Promise<LeaderboardResponse>;
  /** The Power Ranking (roadmap step 31). */
  powerLeaderboard(limit?: number): Promise<PowerLeaderboardResponse>;
  /** An archived season's top (feature `season-archive`); the last closed season by default. */
  seasonLeaderboard(season?: number, limit?: number): Promise<SeasonLeaderboardResponse>;
}

export interface GrovePort {
  listGroves(query?: string): Promise<GrovesResponse>;
  createGrove(name: string): Promise<GroveView>;
  joinGrove(id: string): Promise<GroveView>;
  leaveGrove(): Promise<void>;
  /** Null when the player is not in a Grove. */
  myGrove(): Promise<GroveView | null>;
  chat(after?: string): Promise<ChatResponse>;
  postChat(text: string): Promise<ChatView>;
  requests(): Promise<RequestsResponse>;
  requestTroops(capacity: number): Promise<RequestView>;
  donate(requestId: string, req: DonateRequest): Promise<DonateResponse>;
  inbox(): Promise<InboxResponse>;
  ackInbox(ids: string[]): Promise<void>;
}

export interface GroveRaidPort {
  raid(): Promise<RaidView>;
  raidTicket(target: number): Promise<RaidTicketResponse>;
  submitRaidAttack(sub: BattleSubmission): Promise<RaidAttackResponse>;
  claimRaid(week: number): Promise<RaidClaimResponse>;
}

/** A village kept on the server (roadmap Phase 2; feature `server-economy`). */
export interface VillagePort {
  /** Null when this player's village lives on the device. */
  getVillage(): Promise<VillageResponse | null>;
  /** Start keeping a (new) village on the server, or get the one there. */
  startVillage(): Promise<VillageResponse>;
  /** Move this device's village to the server (once; refused if it could not exist at its Keep). */
  importVillage(file: unknown): Promise<VillageResponse>;
  sendCommands(batch: CommandBatch): Promise<CommandBatchResponse>;
  ledger(limit?: number): Promise<LedgerResponse>;
}

/** Store purchases checked by the server (roadmap Phase 4; features `purchases-apple`, `purchases-google`). */
export interface PurchasePort {
  purchaseIntent(req: PurchaseIntentRequest): Promise<PurchaseIntentResponse>;
  redeem(req: RedeemRequest): Promise<RedeemResponse>;
  purchaseHistory(): Promise<PurchaseHistoryResponse>;
}

/** Unique names and friends (roadmap steps 59-61; feature `friends`). */
export interface FriendsPort {
  lookup(name: string): Promise<ProfileCard>;
  friends(): Promise<FriendsResponse>;
  requestFriend(req: FriendRequestRequest): Promise<FriendRequestResult>;
  answerFriendRequest(id: string, accept: boolean): Promise<FriendsResponse>;
  removeFriend(id: string): Promise<FriendsResponse>;
  setPrivacy(req: PrivacyRequest): Promise<FriendsResponse>;
  friendSuggestions(): Promise<SuggestionsResponse>;
  importFriends(req: FriendImportRequest): Promise<SuggestionsResponse>;
}

/** Friendly Duels (step 62; feature `duels`) and Gangs (step 63; feature `gangs`). */
export interface DuelsPort {
  duelTicket(req: DuelTicketRequest): Promise<DuelTicketResponse>;
  submitDuel(sub: DuelSubmission): Promise<DuelResponse>;
  duels(): Promise<DuelsResponse>;
  challengeFriend(friendId: string): Promise<ChallengeView>;
  /** null clears it. */
  setDuelLayout(base: unknown): Promise<void>;
}

export interface GangsPort {
  myGang(): Promise<MyGangResponse>;
  createGang(name: string): Promise<MyGangResponse>;
  inviteToGang(friendId: string): Promise<MyGangResponse>;
  answerGangInvite(id: string, accept: boolean): Promise<MyGangResponse>;
  leaveGang(): Promise<MyGangResponse>;
  handOverGang(playerId: string): Promise<MyGangResponse>;
  gangChat(after?: string): Promise<ChatResponse>;
  postGangChat(text: string): Promise<ChatView>;
  gangRequests(): Promise<RequestsResponse>;
  gangRequestTroops(capacity: number): Promise<RequestView>;
  gangDonate(requestId: string, req: DonateRequest): Promise<DonateResponse>;
}

/** Server-sent push (roadmap step 40; feature `push`). */
export interface PushPort {
  putPushToken(req: PushTokenRequest): Promise<void>;
  deletePushToken(token: string): Promise<void>;
}

/** Reports and blocks (Apple 1.2). */
export interface ModerationPort {
  report(req: ReportRequest): Promise<ReportResponse>;
  block(playerId: string): Promise<void>;
  unblock(playerId: string): Promise<void>;
  blocks(): Promise<BlocksResponse>;
}

/** Everything a multiplayer server provides. */
export interface ServerPort extends IdentityPort, PvpPort, GrovePort, GroveRaidPort, ModerationPort, VillagePort, PurchasePort, PushPort, FriendsPort, DuelsPort, GangsPort {
  /** Human-readable, e.g. the server URL. */
  readonly label: string;
  /** Credentials for this device's player, if registered. */
  hasIdentity(): boolean;
}
