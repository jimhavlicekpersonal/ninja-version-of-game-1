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
  BalanceResponse,
  ChallengesResponse,
  ChallengeView,
  DuelLayoutRequest,
  DuelReportResponse,
  DuelsResponse,
  DuelTicketRequest,
  DuelTicketResponse,
  SquadResponse,
  GangWarAttackResponse,
  GangWarClaimResponse,
  GangWarResponse,
  GangWarTicketRequest,
  GangWarTicketResponse,
  FriendRequestBody,
  FriendRequestResult,
  FriendsResponse,
  PlayerCard,
  PlatformFriendsRequest,
  PlatformFriendsResponse,
  PrivacyRequest,
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
  /** The signed balance bundle (step 76); servers without the feature have none. Optional so test ports can leave it out. */
  balance?(): Promise<BalanceResponse>;
  register(name: string): Promise<RegisterResponse>;
  me(): Promise<PlayerView>;
  rename(name: string): Promise<PlayerView>;
  /** Delete this player's online account on the server, then forget its credentials on this device. */
  deleteAccount(): Promise<void>;
  /** Friends (roadmap step 59; servers with the `friends` feature). */
  friends(): Promise<FriendsResponse>;
  /** One player by exact name (404 when there is none, or they hide from name search). */
  lookupPlayer(name: string): Promise<PlayerCard>;
  playerByCode(code: string): Promise<PlayerCard>;
  sendFriendRequest(req: FriendRequestBody): Promise<FriendRequestResult>;
  answerFriendRequest(id: string, accept: boolean): Promise<void>;
  cancelFriendRequest(id: string): Promise<void>;
  unfriend(playerId: string): Promise<void>;
  setPrivacy(req: PrivacyRequest): Promise<FriendsResponse>;
  /** Step 61: which of my platform friends play Kagemura. */
  platformFriends(req: PlatformFriendsRequest): Promise<PlatformFriendsResponse>;
  /** Friendly Duels (step 62; feature `duels`). */
  duelTicket(req: DuelTicketRequest): Promise<DuelTicketResponse>;
  reportDuel(sub: BattleSubmission): Promise<DuelReportResponse>;
  duels(since?: number): Promise<DuelsResponse>;
  setDuelLayout(req: DuelLayoutRequest): Promise<void>;
  challenge(friendId: string): Promise<ChallengeView>;
  challenges(): Promise<ChallengesResponse>;
  /** Gangs (step 63; feature `gangs`). */
  squad(): Promise<SquadResponse>;
  createSquad(name: string): Promise<SquadResponse>;
  squadInvite(friendId: string): Promise<SquadResponse>;
  answerSquadInvite(id: string, accept: boolean): Promise<SquadResponse>;
  leaveSquad(): Promise<SquadResponse>;
  squadLeader(playerId: string): Promise<SquadResponse>;
  squadChat(after?: string): Promise<ChatResponse>;
  postSquadChat(text: string): Promise<ChatView>;
  squadRequests(): Promise<RequestsResponse>;
  squadRequestTroops(capacity: number): Promise<RequestView>;
  squadDonate(requestId: string, req: DonateRequest): Promise<DonateResponse>;
  /** Gang Wars (steps 65-66; feature `gang-wars`). */
  gangWar(): Promise<GangWarResponse>;
  gangWarQueue(): Promise<GangWarResponse>;
  gangWarCancel(): Promise<GangWarResponse>;
  gangWarBase(): Promise<GangWarResponse>;
  gangWarTicket(req: GangWarTicketRequest): Promise<GangWarTicketResponse>;
  gangWarAttack(sub: BattleSubmission): Promise<GangWarAttackResponse>;
  gangWarClaim(warId: string): Promise<GangWarClaimResponse>;
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
export interface ServerPort extends IdentityPort, PvpPort, GrovePort, GroveRaidPort, ModerationPort, VillagePort, PurchasePort, PushPort {
  /** Human-readable, e.g. the server URL. */
  readonly label: string;
  /** Credentials for this device's player, if registered. */
  hasIdentity(): boolean;
}
