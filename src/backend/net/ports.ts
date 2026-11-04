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
  register(name: string): Promise<RegisterResponse>;
  me(): Promise<PlayerView>;
  rename(name: string): Promise<PlayerView>;
  /** Delete this player's online account on the server, then forget its credentials on this device. */
  deleteAccount(): Promise<void>;
}

export interface PvpPort {
  uploadBase(req: UploadBaseRequest): Promise<void>;
  /** Null when there is nobody to attack right now. */
  match(): Promise<MatchResponse | null>;
  submitAttack(sub: BattleSubmission): Promise<AttackResponse>;
  defenses(since: number): Promise<DefensesResponse>;
  leaderboard(limit?: number): Promise<LeaderboardResponse>;
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
  sendCommands(batch: CommandBatch): Promise<CommandBatchResponse>;
  ledger(limit?: number): Promise<LedgerResponse>;
}

/** Reports and blocks (Apple 1.2). */
export interface ModerationPort {
  report(req: ReportRequest): Promise<ReportResponse>;
  block(playerId: string): Promise<void>;
  unblock(playerId: string): Promise<void>;
  blocks(): Promise<BlocksResponse>;
}

/** Everything a multiplayer server provides. */
export interface ServerPort extends IdentityPort, PvpPort, GrovePort, GroveRaidPort, ModerationPort, VillagePort {
  /** Human-readable, e.g. the server URL. */
  readonly label: string;
  /** Credentials for this device's player, if registered. */
  hasIdentity(): boolean;
}
