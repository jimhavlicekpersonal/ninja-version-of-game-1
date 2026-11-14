/**
 * HTTP adapter for the ServerPort: talks to any server that speaks the
 * protocol in protocol.ts (ours in server/, or a future one). Handles the
 * bearer token, timeouts, retries for safe reads, and protocol errors.
 */
import { SIM_RULES } from '../../gameplay/sim/battle/battle';
import { defaultData } from '../../gameplay/sim/data';
import { dataVersionOf } from './dataVersion';
import { messageParts } from '../../../locales/runtime';
import { ServerError, type ServerPort } from './ports';
import {
  type AgeRequest,
  type AgeResponse,
  type RulesRequest,
  type RulesResponse,
  type DeletionCodeResponse,
  type NoticesResponse,
  type RevokeOthersResponse,
  type AuthNonceResponse,
  ClientHeaders,
  PROTOCOL_VERSION,
  Routes,
  type AttackResponse,
  type BattleSubmission,
  type BlocksResponse,
  type CommandBatch,
  type CommandBatchResponse,
  type LedgerResponse,
  type PurchaseHistoryResponse,
  type IntentReleaseRequest,
  type IntentReleaseResponse,
  type PurchaseIntentRequest,
  type PurchaseIntentResponse,
  type PushTokenRequest,
  type RedeemRequest,
  type RedeemResponse,
  type LinkCredential,
  type LinkProvider,
  type LinksResponse,
  type VillageResponse,
  type ChatResponse,
  type ChatView,
  type DefensesResponse,
  type DonateRequest,
  type DonateResponse,
  type ErrorBody,
  type GroveView,
  type GrovesResponse,
  type BalanceResponse,
  type ChallengesResponse,
  type ChallengeView,
  type DuelLayoutRequest,
  type DuelReportResponse,
  type DuelsResponse,
  type DuelTicketRequest,
  type DuelTicketResponse,
  type SquadResponse,
  type GangWarAttackResponse,
  type GangWarClaimResponse,
  type GangWarResponse,
  type GangWarTicketRequest,
  type GangWarTicketResponse,
  type FriendRequestBody,
  type FriendRequestResult,
  type FriendsResponse,
  type PlayerCard,
  type PlatformFriendsRequest,
  type PlatformFriendsResponse,
  type PrivacyRequest,
  type HelloResponse,
  type InboxResponse,
  type LeaderboardResponse,
  type MatchResponse,
  type MyGroveResponse,
  type PlayerView,
  type PowerLeaderboardResponse,
  type RaidAttackResponse,
  type RaidClaimResponse,
  type RaidTicketResponse,
  type RaidView,
  type RegisterResponse,
  type ReportRequest,
  type ReportResponse,
  type RequestView,
  type RequestsResponse,
  type UploadBaseRequest,
  type AttackStartResponse,
} from './protocol';

/** Where this device keeps its player token for a server. */
interface TokenStore {
  get(): string | null;
  set(token: string | null): void;
}

/** localStorage, one token per server address (a token is never sent to a different server). */
function localTokenStore(serverUrl: string, prefix = 'tk.net.token:'): TokenStore {
  const key = `${prefix}${serverUrl}`;
  return {
    get() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        if (token) localStorage.setItem(key, token);
        else localStorage.removeItem(key);
      } catch {
        /* private mode: the token lasts for this session only */
      }
    },
  };
}

export function memoryTokenStore(initial: string | null = null): TokenStore {
  let t = initial;
  return { get: () => t, set: (v) => (t = v) };
}

interface HttpAdapterOptions {
  tokens?: TokenStore;
  /**
   * A rotated token whose first use was not confirmed yet (backend A16). Kept apart from `tokens` (and under
   * its own localStorage prefix, so `Connection.storedAccounts` never lists it) until a request succeeds with it.
   */
  nextTokens?: TokenStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Extra attempts for GET requests that fail with a network or server error. */
  retries?: number;
  /** Wait between retries (tests set 0). */
  retryDelayMs?: number;
  /** The game's version and platform for X-Client-Build, e.g. "0.1.0+ios". */
  build?: string;
  /**
   * The data version for X-Data-Version (protocol 8): the balance data this
   * game runs with, including a balance bundle applied at start (step 76).
   * Defaults to the built-in data.
   */
  dataVersion?: () => string;
}

const TOO_SLOW = 'The server took too long to answer.';

/** A fresh id for an Idempotency-Key. */
function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Normalise a server address typed by a player: adds https://, drops a trailing slash. */
export function normalizeServerUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `${/^(localhost|127\.|192\.168\.|10\.)/.test(s) ? 'http' : 'https'}://${s}`;
  return s.replace(/\/+$/, '');
}

export class HttpServerAdapter implements ServerPort {
  readonly label: string;
  private readonly tokens: TokenStore;
  private readonly nextTokens: TokenStore;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly build: string;
  private readonly dataVersion: () => string;

  constructor(
    readonly baseUrl: string,
    opts: HttpAdapterOptions = {},
  ) {
    this.baseUrl = normalizeServerUrl(baseUrl);
    this.label = this.baseUrl;
    this.tokens = opts.tokens ?? localTokenStore(this.baseUrl);
    this.nextTokens = opts.nextTokens ?? (opts.tokens ? memoryTokenStore() : localTokenStore(this.baseUrl, 'tk.net.tokenNext:'));
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 600;
    this.build = opts.build ?? 'unknown';
    this.dataVersion = opts.dataVersion ?? (() => dataVersionOf(defaultData));
  }

  hasIdentity(): boolean {
    return Boolean(this.tokens.get());
  }

  /** Forget this device's player on this server (a new one is made on the next register). */
  forgetIdentity(): void {
    this.setToken(null);
  }

  /** A new identity on this device: any rotated token waiting for confirmation belongs to the old one. */
  private setToken(token: string | null): void {
    this.tokens.set(token);
    this.nextTokens.set(null);
  }

  /**
   * One HTTP exchange. The deadline covers the whole answer: headers, body
   * and JSON parsing (worldwide audit GLOBAL-012). A stalled body is aborted
   * and rejects with the same retryable `network` error as slow headers; a
   * cut-off or unreadable successful answer is a retryable `network` error
   * too (its outcome is unknown, exactly like a timeout). Retries keep the
   * rules in `req`: only reads are retried here, writes stay with their
   * tickets and the outbox, and each attempt carries its own Idempotency-Key.
   */
  private async once<T>(method: string, path: string, body?: unknown, token = this.tokens.get()): Promise<T> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Rejects at the deadline even if a fetch or body stream ignores the abort signal.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl?.abort();
        reject(new ServerError(0, 'network', TOO_SLOW));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.exchange<T>(method, path, body, ctrl, token), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async exchange<T>(method: string, path: string, body: unknown, ctrl: AbortController | null, token: string | null): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          [ClientHeaders.protocol]: String(PROTOCOL_VERSION),
          [ClientHeaders.simRules]: String(SIM_RULES),
          [ClientHeaders.dataVersion]: this.dataVersion(),
          [ClientHeaders.clientBuild]: this.build,
          ...(method !== 'GET' ? { [ClientHeaders.idempotencyKey]: newKey() } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } catch (e) {
      throw new ServerError(0, 'network', ctrl?.signal.aborted ? TOO_SLOW : `Could not reach the server (${(e as Error)?.message ?? e}).`);
    }
    if (res.status === 204) return undefined as T;
    let text: string;
    try {
      text = await res.text();
    } catch {
      if (ctrl?.signal.aborted) throw new ServerError(0, 'network', TOO_SLOW);
      if (!res.ok) text = '';
      else throw new ServerError(0, 'network', 'The connection dropped while the server was answering.');
    }
    let json: unknown = null;
    let unreadable = false;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      unreadable = true;
    }
    if (!res.ok) {
      const err = (json ?? {}) as Partial<ErrorBody>;
      throw new ServerError(res.status, err.error ?? (res.status >= 500 ? 'network' : 'bad_request'), err.message ?? `Server answered ${res.status}.`, err.key ? messageParts([{ key: err.key, params: err.params }, ...(Array.isArray(err.more) ? err.more : [])]) : undefined);
    }
    // A successful answer that does not parse was cut off or mangled on the way: never hand it on as "no data".
    if (unreadable) throw new ServerError(0, 'network', 'The server\'s answer was cut off. Check your connection and try again.');
    return json as T;
  }

  private async req<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    let attempt = 0;
    for (;;) {
      const used = this.tokens.get();
      try {
        return await this.once<T>(method, path, body);
      } catch (e) {
        // Second verification 2026-11-14: sent with the old token while a rotation was adopted (`setToken` already
        // cleared the waiting token): the refusal is about the old key only. Send it once more with today's key.
        const current = this.tokens.get();
        if (e instanceof ServerError && e.status === 401 && current && current !== used) return this.once<T>(method, path, body, current);
        // Backend A16: the old token was refused while a rotated one waits. The server saw the new token's first
        // use (its answer was lost), so the new one is the key now. A refused request changed nothing: send it again.
        const next = this.nextTokens.get();
        if (e instanceof ServerError && e.status === 401 && next && next !== this.tokens.get()) {
          try {
            const v = await this.once<T>(method, path, body, next);
            this.setToken(next);
            return v;
          } catch (e2) {
            if (e2 instanceof ServerError && e2.status === 401) this.nextTokens.set(null);
            throw e2;
          }
        }
        // Only reads are retried here; writes are made safe by tickets and the outbox.
        // A rate limit is not retried at once: the caller tries again on its next round.
        if (method !== 'GET' || !(e instanceof ServerError) || !e.retryable || e.code === 'rate_limited' || attempt >= this.retries) throw e;
        attempt++;
        if (this.retryDelayMs) await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
      }
    }
  }

  private async orNull<T>(p: Promise<T>, code: string): Promise<T | null> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ServerError && e.code === code) return null;
      throw e;
    }
  }

  // ---------------------------------------------------------------- identity

  /** The server's description; throws version_mismatch when this game and the server cannot talk. */
  friends(): Promise<FriendsResponse> {
    return this.req('GET', Routes.friends);
  }

  lookupPlayer(name: string): Promise<PlayerCard> {
    return this.req('GET', `${Routes.playerLookup}?name=${encodeURIComponent(name)}`);
  }

  playerByCode(code: string): Promise<PlayerCard> {
    return this.req('GET', Routes.playerByCode(code));
  }

  sendFriendRequest(req: FriendRequestBody): Promise<FriendRequestResult> {
    return this.req('POST', Routes.friendRequests, req);
  }

  async answerFriendRequest(id: string, accept: boolean): Promise<void> {
    await this.req('POST', Routes.friendRequest(id), { accept });
  }

  async cancelFriendRequest(id: string): Promise<void> {
    await this.req('DELETE', Routes.friendRequest(id));
  }

  async unfriend(playerId: string): Promise<void> {
    await this.req('DELETE', Routes.friend(playerId));
  }

  platformFriends(req: PlatformFriendsRequest): Promise<PlatformFriendsResponse> {
    return this.req('POST', Routes.platformFriends, req);
  }

  setPrivacy(req: PrivacyRequest): Promise<FriendsResponse> {
    return this.req('PUT', Routes.privacy, req);
  }

  duelTicket(req: DuelTicketRequest): Promise<DuelTicketResponse> {
    return this.req('POST', Routes.duelTicket, req);
  }
  reportDuel(sub: BattleSubmission): Promise<DuelReportResponse> {
    return this.req('POST', Routes.duels, { rules: SIM_RULES, dataVersion: this.dataVersion(), ...sub });
  }
  duels(since = 0): Promise<DuelsResponse> {
    return this.req('GET', `${Routes.duels}?since=${since}`);
  }
  async setDuelLayout(req: DuelLayoutRequest): Promise<void> {
    await this.req('PUT', Routes.duelLayout, req);
  }
  challenge(friendId: string): Promise<ChallengeView> {
    return this.req('POST', Routes.duelChallenges, { friendId });
  }
  challenges(): Promise<ChallengesResponse> {
    return this.req('GET', Routes.duelChallenges);
  }
  squad(): Promise<SquadResponse> {
    return this.req('GET', Routes.squad);
  }
  createSquad(name: string): Promise<SquadResponse> {
    return this.req('POST', Routes.squad, { name });
  }
  squadInvite(friendId: string): Promise<SquadResponse> {
    return this.req('POST', Routes.squadInvites, { friendId });
  }
  answerSquadInvite(id: string, accept: boolean): Promise<SquadResponse> {
    return this.req('POST', Routes.squadInvite(id), { accept });
  }
  leaveSquad(): Promise<SquadResponse> {
    return this.req('POST', Routes.squadLeave, {});
  }
  squadLeader(playerId: string): Promise<SquadResponse> {
    return this.req('POST', Routes.squadLeader, { playerId });
  }
  squadChat(after?: string): Promise<ChatResponse> {
    return this.req('GET', `${Routes.squadChat}${after ? `?after=${encodeURIComponent(after)}` : ''}`);
  }
  postSquadChat(text: string): Promise<ChatView> {
    return this.req('POST', Routes.squadChat, { text });
  }
  squadRequests(): Promise<RequestsResponse> {
    return this.req('GET', Routes.squadRequests);
  }
  squadRequestTroops(capacity: number): Promise<RequestView> {
    return this.req('POST', Routes.squadRequests, { capacity });
  }
  squadDonate(requestId: string, req: DonateRequest): Promise<DonateResponse> {
    return this.req('POST', Routes.squadDonate(requestId), req);
  }

  gangWar(): Promise<GangWarResponse> {
    return this.req('GET', Routes.squadWar);
  }
  gangWarQueue(): Promise<GangWarResponse> {
    return this.req('POST', Routes.squadWarQueue, {});
  }
  gangWarCancel(): Promise<GangWarResponse> {
    return this.req('DELETE', Routes.squadWarQueue);
  }
  gangWarBase(): Promise<GangWarResponse> {
    return this.req('POST', Routes.squadWarBase, {});
  }
  gangWarTicket(req: GangWarTicketRequest): Promise<GangWarTicketResponse> {
    return this.req('POST', Routes.squadWarTicket, req);
  }
  gangWarAttack(sub: BattleSubmission): Promise<GangWarAttackResponse> {
    return this.req('POST', Routes.squadWarAttacks, { rules: SIM_RULES, dataVersion: this.dataVersion(), ...sub });
  }
  gangWarClaim(warId: string): Promise<GangWarClaimResponse> {
    return this.req('POST', Routes.squadWarClaim, { warId });
  }

  balance(): Promise<BalanceResponse> {
    return this.req('GET', Routes.balance);
  }

  /** Growth batch 2026-11-14: a call by route (`growth.ts` `GrowthRoutes`), used by `growthClient.ts`. */
  call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    return this.req<T>(method, path, body);
  }

  async hello(): Promise<HelloResponse> {
    const h = await this.req<HelloResponse>('GET', Routes.hello);
    if (!h || h.name !== 'toadstool-kingdoms') throw new ServerError(0, 'version_mismatch', 'That address is not a Kagemura: Ninja Clans server.');
    if (h.minProtocol > PROTOCOL_VERSION) throw new ServerError(0, 'version_mismatch', 'This server needs a newer version of the game. Update the game.');
    if (h.protocol < PROTOCOL_VERSION) throw new ServerError(0, 'version_mismatch', 'This server is older than the game and cannot be used yet.');
    return h;
  }

  async register(name: string): Promise<RegisterResponse> {
    const r = await this.req<RegisterResponse>('POST', Routes.players, { name });
    this.setToken(r.token);
    return r;
  }

  me(): Promise<PlayerView> {
    return this.req('GET', Routes.me);
  }

  rename(name: string): Promise<PlayerView> {
    return this.req('PUT', Routes.me, { name });
  }

  links(): Promise<LinksResponse> {
    return this.req('GET', Routes.links);
  }

  link(provider: LinkProvider, credential: LinkCredential): Promise<LinksResponse> {
    return this.req('POST', Routes.links, { provider, credential });
  }

  unlink(provider: LinkProvider): Promise<LinksResponse> {
    return this.req('DELETE', Routes.link(provider));
  }

  async signIn(provider: LinkProvider, credential: LinkCredential, device?: string): Promise<RegisterResponse> {
    const r = await this.req<RegisterResponse>('POST', Routes.sessions, { provider, credential, device });
    this.setToken(r.token);
    return r;
  }

  async deleteAccount(): Promise<void> {
    await this.req<void>('DELETE', Routes.me);
    this.setToken(null);
  }

  // ---------------------------------------------------------------- account protections (re-audit)

  stateAge(req: AgeRequest): Promise<AgeResponse> {
    return this.req('PUT', Routes.meAge, req);
  }
  acceptRules(req: RulesRequest): Promise<RulesResponse> {
    return this.req('PUT', Routes.meRules, req);
  }
  deletionCode(): Promise<DeletionCodeResponse> {
    return this.req('POST', Routes.deletionCode, {});
  }
  notices(): Promise<NoticesResponse> {
    return this.req('GET', Routes.notices);
  }
  async markNoticesRead(ids: string[]): Promise<void> {
    await this.req('POST', Routes.noticesRead, { ids });
  }
  revokeOtherSessions(): Promise<RevokeOthersResponse> {
    return this.req('POST', Routes.sessionsRevokeOthers, {});
  }

  // ---------------------------------------------------------------- sign-in nonces and this device's token (A15, A16)

  authNonce(): Promise<AuthNonceResponse> {
    return this.req('POST', Routes.authNonce, {});
  }

  /** Sign out this device: the token is forgotten only after the server answered (a 409 keeps it). */
  async signOutDevice(): Promise<void> {
    await this.req<void>('DELETE', Routes.sessionsCurrent);
    this.setToken(null);
  }

  /**
   * Store and confirm (backend A16): the new token is kept aside, used at once for one request, and becomes
   * this device's key only when that request was answered. Servers since 2026-11-14 swap on that first use,
   * older ones at the rotation itself; either way the old token lapses. A confirmation lost on the network
   * leaves the old token in use and the new one aside: if the server did swap, the next 401 switches to it
   * (`req`); if not, the rotation lapses on the server and the old token keeps working.
   */
  async rotateToken(): Promise<boolean> {
    const r = await this.req<RegisterResponse>('POST', Routes.sessionsRotate, {});
    if (!r?.token) return false;
    this.nextTokens.set(r.token);
    try {
      await this.once<PlayerView>('GET', Routes.me, undefined, r.token);
    } catch (e) {
      // A refused new token is useless: forget it. Anything else (network) keeps it aside for a later 401.
      if (e instanceof ServerError && e.status === 401) this.nextTokens.set(null);
      return false;
    }
    this.setToken(r.token);
    return true;
  }

  // ---------------------------------------------------------------- PvP

  uploadBase(req: UploadBaseRequest): Promise<void> {
    return this.req('PUT', Routes.base, req);
  }

  match(): Promise<MatchResponse | null> {
    return this.orNull(this.req<MatchResponse>('GET', Routes.match), 'no_opponents');
  }

  startAttack(ticket: string, stake?: number): Promise<AttackStartResponse> {
    return this.req('POST', Routes.attackStart, { ticket, ...(stake !== undefined ? { stake } : {}) });
  }

  voidAttack(ticket: string): Promise<{ voided: boolean }> {
    return this.req('POST', Routes.attackVoid, { ticket });
  }

  submitAttack(sub: BattleSubmission): Promise<AttackResponse> {
    return this.req('POST', Routes.attacks, { rules: SIM_RULES, dataVersion: this.dataVersion(), ...sub });
  }

  defenses(since: number): Promise<DefensesResponse> {
    return this.req('GET', `${Routes.defenses}?since=${Math.floor(since)}`);
  }

  powerLeaderboard(limit = 50): Promise<PowerLeaderboardResponse> {
    return this.req('GET', `${Routes.powerLeaderboard}?limit=${limit}`);
  }

  leaderboard(limit = 50): Promise<LeaderboardResponse> {
    return this.req('GET', `${Routes.leaderboard}?limit=${limit}`);
  }

  // ---------------------------------------------------------------- Groves

  listGroves(query = ''): Promise<GrovesResponse> {
    return this.req('GET', query ? `${Routes.groves}?q=${encodeURIComponent(query)}` : Routes.groves);
  }

  createGrove(name: string): Promise<GroveView> {
    return this.req('POST', Routes.groves, { name });
  }

  joinGrove(id: string): Promise<GroveView> {
    return this.req('POST', Routes.groveJoin(id), {});
  }

  leaveGrove(): Promise<void> {
    return this.req('POST', Routes.groveLeave, {});
  }

  async myGrove(): Promise<GroveView | null> {
    return (await this.req<MyGroveResponse>('GET', Routes.grove)).grove;
  }

  chat(after?: string): Promise<ChatResponse> {
    return this.req('GET', after ? `${Routes.groveChat}?after=${encodeURIComponent(after)}` : Routes.groveChat);
  }

  postChat(text: string): Promise<ChatView> {
    return this.req('POST', Routes.groveChat, { text });
  }

  requests(): Promise<RequestsResponse> {
    return this.req('GET', Routes.groveRequests);
  }

  requestTroops(capacity: number): Promise<RequestView> {
    return this.req('POST', Routes.groveRequests, { capacity });
  }

  donate(requestId: string, req: DonateRequest): Promise<DonateResponse> {
    return this.req('POST', Routes.groveDonate(requestId), req);
  }

  inbox(): Promise<InboxResponse> {
    return this.req('GET', Routes.groveInbox);
  }

  ackInbox(ids: string[]): Promise<void> {
    return this.req('POST', Routes.groveInboxAck, { ids });
  }

  // ---------------------------------------------------------------- server-owned village

  getVillage(): Promise<VillageResponse | null> {
    return this.orNull(this.req<VillageResponse>('GET', Routes.village), 'no_village');
  }

  startVillage(): Promise<VillageResponse> {
    return this.req('POST', Routes.village, {});
  }

  importVillage(file: unknown): Promise<VillageResponse> {
    return this.req('POST', Routes.villageImport, { file });
  }

  sendCommands(batch: CommandBatch): Promise<CommandBatchResponse> {
    return this.req('POST', Routes.villageCommands, batch);
  }

  ledger(limit = 50): Promise<LedgerResponse> {
    return this.req('GET', `${Routes.villageLedger}?limit=${limit}`);
  }

  // ---------------------------------------------------------------- purchases and push

  releaseIntent(req: IntentReleaseRequest): Promise<IntentReleaseResponse> {
    return this.req('POST', Routes.purchaseIntentRelease, req);
  }

  purchaseIntent(req: PurchaseIntentRequest): Promise<PurchaseIntentResponse> {
    return this.req('POST', Routes.purchaseIntent, req);
  }

  redeem(req: RedeemRequest): Promise<RedeemResponse> {
    return this.req('POST', Routes.purchases, req);
  }

  purchaseHistory(): Promise<PurchaseHistoryResponse> {
    return this.req('GET', Routes.purchases);
  }

  async putPushToken(req: PushTokenRequest): Promise<void> {
    await this.req('PUT', Routes.pushTokens, req);
  }

  async deletePushToken(token: string): Promise<void> {
    await this.req('DELETE', `${Routes.pushTokens}?token=${encodeURIComponent(token)}`);
  }

  // ---------------------------------------------------------------- reports and blocks

  report(req: ReportRequest): Promise<ReportResponse> {
    return this.req('POST', Routes.reports, req);
  }

  block(playerId: string): Promise<void> {
    return this.req('POST', Routes.blocks, { playerId });
  }

  unblock(playerId: string): Promise<void> {
    return this.req('DELETE', Routes.block(playerId));
  }

  blocks(): Promise<BlocksResponse> {
    return this.req('GET', Routes.blocks);
  }

  // ---------------------------------------------------------------- Grove Raid

  raid(): Promise<RaidView> {
    return this.req('GET', Routes.groveRaid);
  }

  raidTicket(target: number): Promise<RaidTicketResponse> {
    return this.req('POST', Routes.groveRaidTicket, { target });
  }

  submitRaidAttack(sub: BattleSubmission): Promise<RaidAttackResponse> {
    return this.req('POST', Routes.groveRaidAttacks, { rules: SIM_RULES, dataVersion: this.dataVersion(), ...sub });
  }

  claimRaid(week: number): Promise<RaidClaimResponse> {
    return this.req('POST', Routes.groveRaidClaim, { week });
  }
}
