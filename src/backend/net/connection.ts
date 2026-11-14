import { deviceLocale } from '../../../locales/runtime';
/**
 * Online play: picks the server, keeps this device's player registered,
 * and brings server results into the village (real raids, donated troops,
 * Grove Raid chests) through idempotent commands. Battle reports go through a
 * persisted outbox, so a dropped connection never loses an attack.
 *
 * The game talks to the server only through a ServerPort, so any server that
 * speaks the protocol works, and tests can plug in the in-process adapter.
 */
import type { BattleRecord } from '../../gameplay/sim/battle/types';
import { villageToBase } from '../../gameplay/sim/defense';
import type { Command, CommandResult } from '../../gameplay/sim/village';
import type { GameData, VillageState } from '../../gameplay/sim/types';
import { HttpServerAdapter, normalizeServerUrl } from './httpAdapter';
import { ServerError, type ServerPort } from './ports';
import type { BattleSubmission, GangWarResponse, ChallengesResponse, ChallengeView, ChatResponse, ChatView, DuelReportResponse, DuelsResponse, DuelTicketRequest, DuelTicketResponse, RequestsResponse, RequestView, SquadResponse, FriendRequestBody, FriendRequestResult, FriendsResponse, HelloResponse, LinkCredential, LinkProvider, PlayerCard, PlayerView, PrivacyRequest, PurchaseStore, ReportReason } from './protocol';
import { normalizeFriendCode } from './names';
import { troopLevels } from '../../gameplay/sim/research';
import { reinforcementCapacity, reinforcementHousing } from '../../gameplay/sim/social/grove';
import { battleLoadout } from '../../gameplay/sim/village';
import type { BattleSetup } from '../../gameplay/sim/battle/types';
import type { RaidBattle } from '../social/raidBattle';
// Name rules for instant hints in the UI (the server decides; step 59).
export { NAME_MAX, NAME_MIN, nameShapeProblem, normalizeFriendCode } from './names';
export type { RefusedAction } from './villageSync';
import type { PurchaseVerifier } from '../payments/provider';
import { VillageSync, type RefusedAction, type SyncGame } from './villageSync';
import { SIM_RULES } from '../../gameplay/sim/battle/battle';
import { NEWER_VILLAGE_MESSAGE, updateNeeded } from './versionCheck';
import { NewerSaveError } from '../../gameplay/sim/save';
import { bandFromProfile, type AgeBand } from '../../gameplay/sim/age';
import type { DeletionCodeResponse, NoticeView } from './protocol';

/** What the connection needs from the game. GameController provides it. */
export interface GameLink {
  readonly data: GameData;
  readonly state: VillageState;
  now(): number;
  dispatch(cmd: Command): CommandResult;
  /** For a village kept on the server (roadmap step 21); without them the village always stays on the device. */
  onCommand?: SyncGame['onCommand'];
  adoptEconomy?: SyncGame['adoptEconomy'];
  adoptVillage?: SyncGame['adoptVillage'];
}

/** Small key-value storage (localStorage in the browser). */
export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  /** Like `set`, but false when the write failed (storage full or blocked): GLOBAL-010. */
  trySet?(key: string, value: string | null): boolean;
}

export const browserKeyValue: KeyValue = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    browserKeyValue.trySet!(key, value);
  },
  trySet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export type ConnectionStatus =
  /** No server configured: everything is local (generated opponents, bot raids, bot Grove). */
  | 'off'
  | 'connecting'
  | 'online'
  /** Server configured but not reachable right now; retrying. */
  | 'offline'
  /**
   * The server and this game cannot talk: protocol versions, or the server no
   * longer checks this game's battle rules or build (`updateUrl`, step 75).
   */
  | 'incompatible'
  /** Staff suspended this account from online play (`lastError` says why and until when); tried again on the next start. */
  | 'suspended';

export interface OutboxItem {
  id: string;
  kind: 'attack' | 'raid' | 'gangwar';
  sub: BattleSubmission;
  at: number;
}

const SERVER_KEY = 'tk.net.server';
const NAME_KEY = 'tk.net.name';
/** Backend A16: how often this device swaps its token for a new one (feature `session-control`). */
export const ROTATE_EVERY_MS = 30 * 86_400_000;

/**
 * The server address: the one chosen in Settings, else the one built into
 * this version (VITE_SERVER_URL). 'off' in Settings turns online play off.
 */
export function resolveServerUrl(kv: KeyValue, builtIn: string | undefined): string {
  const chosen = kv.get(SERVER_KEY);
  if (chosen === 'off') return '';
  return normalizeServerUrl(chosen || builtIn || '');
}

export interface ConnectionOptions {
  game: GameLink;
  builtInUrl?: string;
  kv?: KeyValue;
  /** Makes the adapter for a server address (tests pass an in-process one). */
  makePort?: (url: string) => ServerPort;
  /** Force online play off (the testing sandbox: its clock and test purchases must never reach a server). */
  offline?: boolean;
  /** The game's version and platform, sent as X-Client-Build. */
  build?: string;
  /**
   * Protocol 7: move this village to the server as soon as the server can
   * take it (the real game sets this; tests leave it off to stay on the device).
   */
  keepVillageOnServer?: boolean;
  /** The balance data version this game runs with (step 76 bundles change it); sent as X-Data-Version. */
  dataVersion?: () => string;
  /** Balance bundles (step 76): what the server offers is checked and kept for the next start. */
  /** The community rules version accepted on this device (0: none); sent to the server (report section 5 step 7). */
  rulesAccepted?: () => number;
  balance?: { offer(b: import('./balanceBundle').BalanceBundle | null, arms?: import('./balanceBundle').BalanceBundle[]): Promise<string> };
  /** Where "Update Kagemura" sends the player (the App Store / Play listing); the web build reloads instead. */
  updateUrl?: string;
  log?: (msg: string, err?: unknown) => void;
}

export class Connection {
  status: ConnectionStatus = 'off';
  /** Why the last attempt failed, for Settings. */
  lastError = '';
  server: HelloResponse | null = null;
  player: PlayerView | null = null;
  port: ServerPort | null = null;
  readonly url: string;
  /** Where the player gets the new version (step 75); empty on the web, where a reload updates. */
  get updateUrl(): string {
    return this.o.updateUrl ?? '';
  }
  /** The server-owned village queue (roadmap step 21); null when the game cannot keep one on a server. */
  readonly village: VillageSync | null = null;

  private readonly kv: KeyValue;
  private readonly listeners = new Set<() => void>();
  private syncing: Promise<void> | null = null;
  private triedWeeks = new Set<number>();
  private triedGangWars = new Set<string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 15_000;

  /**
   * Re-audit (minors online): asked once before this device first goes online
   * while the village has no age band. The HUD sets it (the store's age signal,
   * else the neutral age screen); null when the player chose not to answer, so
   * online play waits (Settings → Connect now asks again). Without a gate (tests,
   * tools) connecting does not wait for an age.
   */
  ageGate: (() => Promise<AgeBand | null>) | null = null;
  private ageDeclined = false;
  /** Moderation notices from the server (feature `notices`), newest first; read on connecting and from Settings. */
  notices: NoticeView[] = [];

  constructor(private readonly o: ConnectionOptions) {
    this.kv = o.kv ?? browserKeyValue;
    this.url = o.offline ? '' : resolveServerUrl(this.kv, o.builtInUrl);
    if (this.url) {
      this.port = (o.makePort ?? ((u) => new HttpServerAdapter(u, { build: o.build, dataVersion: o.dataVersion })))(this.url);
      this.status = 'connecting';
      const g = o.game;
      if (g.onCommand && g.adoptEconomy && g.adoptVillage) {
        this.village = new VillageSync(g as GameLink & SyncGame, () => this.port, this.kv, `tk.net.village:${this.url}`);
        this.village.onChange = () => this.emit();
      }
    }
  }

  /** Actions the server refused since this start, newest last (GLOBAL-009: News names them with their reasons). */
  get refusedActions(): readonly RefusedAction[] {
    return this.village?.refusedLog ?? [];
  }

  /** Why the server would not take this village (protocol 7 auto-move), if it refused. */
  get villageMoveRefused(): string | null {
    // A refusal that only says "not yet" (ledger audit A2: the account is too new for this Keep) is
    // forgotten after a day, so the move is tried again.
    const retryAt = Number(this.kv.get(`tk.net.villageMoveRetryAt:${this.url}`) ?? 0);
    if (retryAt && this.o.game.now() >= retryAt) {
      this.kv.set(`tk.net.villageMoveRefused:${this.url}`, null);
      this.kv.set(`tk.net.villageMoveRetryAt:${this.url}`, null);
    }
    return this.kv.get(`tk.net.villageMoveRefused:${this.url}`);
  }

  /**
   * Protocol 7: the server owns the economy, so the village moves there the
   * first time it can. If the server refuses it (a village its Keep could not
   * hold), it stays on the device, and Settings says why.
   */
  private async autoMoveVillage(): Promise<void> {
    if (!this.o.keepVillageOnServer || !this.village || this.serverVillage || !this.server?.features.includes('village-import') || this.villageMoveRefused) return;
    try {
      await this.village.enable('move');
    } catch (e) {
      if (e instanceof ServerError && !e.retryable) {
        this.kv.set(`tk.net.villageMoveRefused:${this.url}`, e.message);
        if (e.code === 'cooldown') this.kv.set(`tk.net.villageMoveRetryAt:${this.url}`, String(this.o.game.now() + 24 * 3_600_000));
      } else throw e;
    }
  }

  /**
   * The server's side of purchases from `store` (roadmap Phase 4), or null to
   * trust the store on this device (no server, or a server that does not check
   * that store while the village lives on the device). A village kept on the
   * server buys only through a server that checks the store: otherwise the
   * purchase is refused before anything is charged.
   */
  purchaseVerifier(store: PurchaseStore): PurchaseVerifier | null {
    if (!this.port) return null;
    const checks = Boolean(this.server?.features.includes(`purchases-${store}`));
    if (!checks && !this.serverVillage) return null;
    const ready = async () => {
      if (!checks) throw new ServerError(403, 'purchase_refused', 'Purchases are not set up on this server yet. Nothing was charged.');
      if (!this.port || !this.online) throw new ServerError(0, 'network', 'Connect to the internet to buy.');
      // The server reads the age group from a village it keeps: send what is queued first.
      await this.village?.flush().catch(() => undefined);
      return this.port;
    };
    return {
      intent: async (s, productId, under18) => (await ready()).purchaseIntent({ store: s, productId, under18, ...(this.village?.device ? { device: this.village.device } : {}) }),
      redeem: async (r) => (await ready()).redeem({ store: r.store, storeProductId: r.storeProductId, receipt: r.receipt }),
      history: async () => (checks && this.port && this.online ? (await this.port.purchaseHistory()).purchases : []),
      release: async (accountToken, outcome) => {
        if (checks && this.port && this.online) await this.port.releaseIntent({ accountToken, outcome });
      },
    };
  }

  /** Notification types this device gets as server push (roadmap step 40); empty when none. */
  get pushTypes(): string[] {
    const saved = this.kv.get(`tk.net.push:${this.url}`);
    return saved && this.server?.features.includes('push') ? ((JSON.parse(saved) as { types?: string[] }).types ?? []) : [];
  }

  /**
   * Tell the server where to push and what (roadmap step 40), or stop when no
   * type is switched on. `device` asks the platform for a token (and the
   * permission) only when something is switched on.
   */
  async syncPush(types: string[], tzOffsetMinutes: number, device: () => Promise<{ token: string; platform: 'ios' | 'android' } | null>): Promise<void> {
    if (!this.port || !this.online || !this.server?.features.includes('push')) return;
    const key = `tk.net.push:${this.url}`;
    const saved = this.kv.get(key);
    const prev = saved ? (JSON.parse(saved) as { token: string; sig: string; types: string[] }) : null;
    if (!types.length) {
      if (prev) {
        await this.port.deletePushToken(prev.token).catch(() => undefined);
        this.kv.set(key, null);
      }
      return;
    }
    const d = await device();
    if (!d) return;
    const sig = JSON.stringify([d.platform, [...types].sort(), tzOffsetMinutes, deviceLocale()]);
    if (prev?.token === d.token && prev.sig === sig) return;
    await this.port.putPushToken({ token: d.token, platform: d.platform, types, tzOffsetMinutes, locale: deviceLocale() });
    this.kv.set(key, JSON.stringify({ token: d.token, sig, types }));
  }

  /** The server keeps this player's village (its economy is the truth). */
  get serverVillage(): boolean {
    return Boolean(this.village?.active);
  }

  /** The server offers keeping villages (feature `server-economy`). */
  get canKeepVillage(): boolean {
    return Boolean(this.village && this.online && this.server?.features.includes('server-economy'));
  }

  /** A server is configured (real raids replace bot raids, the real Grove replaces the bot Grove). */
  get enabled(): boolean {
    return Boolean(this.port);
  }

  get online(): boolean {
    return this.status === 'online';
  }

  // ------------------------------------------------------------ friends (roadmap steps 59-60)

  /** The server has friends (and this game is online with it). */
  get canFriends(): boolean {
    return this.online && Boolean(this.server?.features.includes('friends'));
  }

  private port_(): ServerPort {
    if (!this.port || !this.online) throw new Error('Friends need online play. Check your connection.');
    return this.port;
  }

  friends(): Promise<FriendsResponse> {
    return this.port_().friends();
  }
  /**
   * One player by exact name or by friend code: text starting with "KAGE" is a
   * code; otherwise the name is tried first, then the text as a code (codes may
   * be typed without the prefix).
   */
  async findPlayer(text: string): Promise<PlayerCard> {
    const code = normalizeFriendCode(text);
    if (code && /^\s*kage/i.test(text)) return this.port_().playerByCode(code);
    try {
      return await this.port_().lookupPlayer(text);
    } catch (e) {
      if (code && e instanceof ServerError && e.code === 'not_found') return this.port_().playerByCode(code);
      throw e;
    }
  }
  addFriend(req: FriendRequestBody): Promise<FriendRequestResult> {
    return this.port_().sendFriendRequest(req);
  }
  answerFriendRequest(id: string, accept: boolean): Promise<void> {
    return this.port_().answerFriendRequest(id, accept);
  }
  cancelFriendRequest(id: string): Promise<void> {
    return this.port_().cancelFriendRequest(id);
  }
  unfriend(playerId: string): Promise<void> {
    return this.port_().unfriend(playerId);
  }
  setPrivacy(req: PrivacyRequest): Promise<FriendsResponse> {
    return this.port_().setPrivacy(req);
  }
  /** The sign-ins linked to this account (to offer importing that platform's friends). */
  async linkedProviders(): Promise<LinkProvider[]> {
    return (await this.port_().links()).links.map((l) => l.provider);
  }
  /** Step 61: which of these platform friends play Kagemura (ids read on the device, with the player's permission). */
  async platformFriends(provider: 'gamecenter' | 'playgames', ids: string[]): Promise<PlayerCard[]> {
    return (await this.port_().platformFriends({ provider, ids })).players;
  }
  // ------------------------------------------------------------ duels and Gangs (roadmap steps 62-63)

  /** Declared stakes (protocol 11): the server fixes a stake at the raid's start and settles with it. */
  get canStakes(): boolean {
    return this.online && Boolean(this.server?.features.includes('stakes'));
  }
  get canDuels(): boolean {
    return this.online && Boolean(this.server?.features.includes('duels'));
  }
  get canGangs(): boolean {
    return this.online && Boolean(this.server?.features.includes('gangs'));
  }
  duelTicket(req: DuelTicketRequest): Promise<DuelTicketResponse> {
    return this.port_().duelTicket(req);
  }
  /**
   * Report a duel. Duels change nothing in the village, so no outbox: a few
   * quick retries, then the error (the duel is simply not counted).
   */
  async reportDuel(sub: BattleSubmission): Promise<DuelReportResponse> {
    for (let i = 0; ; i++) {
      try {
        return await this.port_().reportDuel(sub);
      } catch (e) {
        if (i >= 2 || !(e instanceof ServerError) || !e.retryable) throw e;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
  }
  duels(): Promise<DuelsResponse> {
    return this.port_().duels(0);
  }
  /** Friends duel against this village's current layout from now on (a snapshot; null: the live village again). */
  setDuelLayoutFromVillage(use: boolean): Promise<void> {
    const g = this.o.game;
    return this.port_().setDuelLayout({ base: use ? villageToBase(g.state, g.now(), g.data, this.player?.name) : null });
  }
  challenge(friendId: string): Promise<ChallengeView> {
    return this.port_().challenge(friendId);
  }
  challenges(): Promise<ChallengesResponse> {
    return this.port_().challenges();
  }
  squad(): Promise<SquadResponse> {
    return this.port_().squad();
  }
  createSquad(name: string): Promise<SquadResponse> {
    return this.port_().createSquad(name);
  }
  squadInvite(friendId: string): Promise<SquadResponse> {
    return this.port_().squadInvite(friendId);
  }
  answerSquadInvite(id: string, accept: boolean): Promise<SquadResponse> {
    return this.port_().answerSquadInvite(id, accept);
  }
  leaveSquad(): Promise<SquadResponse> {
    return this.port_().leaveSquad();
  }
  squadLeader(playerId: string): Promise<SquadResponse> {
    return this.port_().squadLeader(playerId);
  }
  squadChat(after?: string): Promise<ChatResponse> {
    return this.port_().squadChat(after);
  }
  postSquadChat(text: string): Promise<ChatView> {
    return this.port_().postSquadChat(text);
  }
  squadRequests(): Promise<RequestsResponse> {
    return this.port_().squadRequests();
  }
  /** Ask the Gang for warriors to fill the Lodge's free space. */
  squadAsk(): Promise<RequestView> {
    const g = this.o.game;
    const free = reinforcementCapacity(g.state, g.data) - reinforcementHousing(g.state, g.data);
    if (free <= 0) return Promise.reject(new Error('Your Alliance Lodge is full (or not built yet).'));
    return this.port_().squadRequestTroops(free);
  }
  /** Give one warrior to a Gang mate's request; it leaves this army once the server accepts. */
  async squadDonate(requestId: string, troop: string): Promise<void> {
    const g = this.o.game;
    if ((g.state.army[troop] ?? 0) < 1) throw new Error('Not enough of that warrior.');
    const level = troopLevels(g.state, g.data)[troop] ?? 1;
    await this.port_().squadDonate(requestId, { troop, count: 1, level });
    g.dispatch({ type: 'spendDonation', troop, count: 1, xp: 0 });
  }
  get canGangWars(): boolean {
    return this.online && Boolean(this.server?.features.includes('gang-wars'));
  }
  gangWar(): Promise<GangWarResponse> {
    return this.port_().gangWar();
  }
  gangWarQueue(): Promise<GangWarResponse> {
    return this.port_().gangWarQueue();
  }
  gangWarCancel(): Promise<GangWarResponse> {
    return this.port_().gangWarCancel();
  }
  gangWarBase(): Promise<GangWarResponse> {
    return this.port_().gangWarBase();
  }
  /**
   * A Gang War strike (step 67): the ticket, and the battle to play. Finishing
   * spends the warriors and keeps the replay (as in an Alliance War); the
   * report goes through the outbox, so it survives a lost connection.
   */
  async gangWarBattle(target: number, relay: boolean, enemyName: string, bot: boolean): Promise<RaidBattle> {
    const g = this.o.game;
    const t = await this.port_().gangWarTicket({ target, relay });
    const base = structuredClone(t.base);
    if (bot) base.practice = 'Generated Gang (no Gang fitted yours)';
    const setup: BattleSetup = { seed: t.seed >>> 0, base, ...battleLoadout(g.state, g.data), infiltration: true, ...(t.startDamage ? { startDamage: t.startDamage } : {}) };
    const at = g.now();
    return {
      setup,
      enemyName,
      target,
      ticket: t.ticket,
      channel: 'gangwar',
      finish: (deployments, endTick) => {
        const r = g.dispatch({ type: 'remoteGroveBattleEnd', target, record: { at, opponentName: base.name, setup, deployments, endTick } });
        if (!r.ok) return null;
        const e = r.events.find((x) => x.kind === 'grove_attack');
        if (!e || e.kind !== 'grove_attack') return null;
        void this.report('gangwar', { ticket: t.ticket, seed: setup.seed, army: setup.army, levels: setup.levels, reinforcements: setup.reinforcements, ...(setup.hero ? { hero: setup.hero } : {}), deployments, endTick, clientHash: e.record.result.hash, rules: SIM_RULES });
        return { stars: e.stars, destruction: e.destruction, record: e.record };
      },
    };
  }

  reportChat(messageId: string, reason: ReportReason, note: string, block: boolean): Promise<unknown> {
    return this.port_().report({ kind: 'chat', messageId, reason, note, block });
  }

  blockPlayer(playerId: string): Promise<void> {
    return this.port_().block(playerId);
  }
  reportPlayer(playerId: string, reason: ReportReason, note: string, block: boolean): Promise<unknown> {
    return this.port_().report({ kind: 'player', playerId, reason, note, block });
  }

  /** Save a server address chosen in Settings: a URL, '' for the built-in one, or 'off'. Takes effect on reload. */
  static choose(value: string, kv: KeyValue = browserKeyValue): void {
    const v = value.trim();
    kv.set(SERVER_KEY, v === 'off' ? 'off' : v ? normalizeServerUrl(v) : null);
  }

  static chosen(kv: KeyValue = browserKeyValue): string | null {
    return kv.get(SERVER_KEY);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private setStatus(s: ConnectionStatus, err = ''): void {
    this.status = s;
    this.lastError = err;
    this.emit();
  }

  private log(msg: string, err?: unknown): void {
    (this.o.log ?? ((m, e) => console.warn(m, e ?? '')))(msg, err);
  }

  /** The name other players see. */
  get name(): string {
    let n = this.kv.get(NAME_KEY) ?? this.kv.get('tk.online.name') ?? '';
    if (!n) {
      const d = this.o.game.data.names;
      n = `${d.playerFirst[Math.floor(Math.random() * d.playerFirst.length)]} ${d.playerSecond[Math.floor(Math.random() * d.playerSecond.length)]}`;
      this.kv.set(NAME_KEY, n);
    }
    return n;
  }

  async rename(name: string): Promise<void> {
    if (!this.port) return;
    this.player = await this.port.rename(name);
    this.kv.set(NAME_KEY, this.player.name);
    void this.uploadBase();
    this.emit();
  }

  /**
   * Delete this player's online account (Settings; Apple 5.1.1(v)). Online
   * attacks the server has not confirmed yet become practice results (no
   * loot or honor), as a refused report would. Online play is
   * then switched off on this device, so the next start does not quietly make
   * a new account; choosing a server again in Settings does. The village on
   * this device is not touched. Call reload afterwards for a clean start.
   */
  async deleteAccount(): Promise<void> {
    if (!this.port) return;
    await this.port.deleteAccount();
    this.stop();
    this.village?.reset();
    this.village?.stop();
    const g = this.o.game;
    for (const r of g.state.battleLog) if (r.settlement === 'pending' && r.ticket) g.dispatch({ type: 'settleOnlineAttack', ticket: r.ticket, rejected: 'account_deleted' });
    this.saveOutbox([]);
    this.kv.set(NAME_KEY, null);
    Connection.choose('off', this.kv);
    this.player = null;
    this.setStatus('off');
  }

  // ---------------------------------------------------------------- account protections (re-audit)

  /** The age band of this village (null: not asked yet). */
  get ageBand(): AgeBand | null {
    return bandFromProfile(this.o.game.state.profile);
  }

  /** Ask the age question again (it was dismissed); the next sync shows it. */
  askAgeAgain(): void {
    this.ageDeclined = false;
  }

  /** Make the band stricter on the device (the game refuses anything else). */
  private applyBand(band: AgeBand): void {
    const r = this.o.game.dispatch({ type: 'setProfile', under18: band !== 'adult', ageBand: band });
    if (r.ok) this.emit();
  }

  private async ensureAge(): Promise<boolean> {
    if (this.ageBand || !this.ageGate) return true;
    if (this.ageDeclined) return false;
    const band = await this.ageGate().catch(() => null);
    if (!band) {
      this.ageDeclined = true;
      return false;
    }
    this.applyBand(band);
    // A village that already said "under 18" never becomes adult: it keeps the older answer's band.
    if (!this.ageBand && this.o.game.state.profile.under18 === true) this.applyBand('13to17');
    return Boolean(this.ageBand);
  }

  /** Tell the server the band (it keeps the strictest); a stricter one from the server (another device) is adopted. */
  private async syncAge(port: ServerPort): Promise<void> {
    if (!this.server?.features.includes('age-bands') || !port.stateAge) return;
    try {
      const r = await port.stateAge({ band: this.ageBand });
      if (r.band && r.band !== this.ageBand) this.applyBand(r.band);
    } catch (e) {
      this.log('Online play: could not send the age group', e);
    }
  }

  /**
   * Report section 5 step 7 (compliance C14): the server keeps which community rules this account accepted
   * (chat and names need them). The HUD calls this when the player agrees; every sync catches up a device that
   * agreed before this build or while offline (`o.rulesAccepted`, the version accepted on this device).
   */
  async acceptRules(): Promise<void> {
    const port = this.port;
    if (port && this.online) await this.syncRules(port);
  }

  private async syncRules(port: ServerPort): Promise<void> {
    const accepted = this.o.rulesAccepted?.() ?? 0;
    if (!accepted || !this.server?.features.includes('rules-acceptance') || !port.acceptRules) return;
    const key = `tk.rules.sent.${this.player?.id ?? ''}`;
    if (Number(this.kv.get(key)) >= accepted) return;
    try {
      const r = await port.acceptRules({ version: accepted });
      this.kv.set(key, String(r.version));
    } catch (e) {
      this.log('Online play: could not send the community rules acceptance', e);
    }
  }

  /** The server lists moderation notices (feature `notices`). */
  get canNotices(): boolean {
    return this.online && Boolean(this.server?.features.includes('notices') && this.port?.notices);
  }

  /** Read moderation notices (report outcomes, decisions with reasons and appeals). */
  async refreshNotices(): Promise<NoticeView[]> {
    if (!this.canNotices) return this.notices;
    try {
      this.notices = (await this.port!.notices!()).notices;
      this.emit();
    } catch (e) {
      this.log('Online play: could not read notices', e);
    }
    return this.notices;
  }

  async markNoticesRead(ids: string[]): Promise<void> {
    if (!ids.length || !this.canNotices) return;
    await this.port!.markNoticesRead!(ids);
    for (const n of this.notices) if (ids.includes(n.id)) n.read = true;
    this.emit();
  }

  /** A one-time code for the web deletion page (feature `deletion-codes`). */
  async deletionCode(): Promise<DeletionCodeResponse> {
    const port = this.port_();
    if (!this.server?.features.includes('deletion-codes') || !port.deletionCode) throw new Error('This server does not give deletion codes yet. Delete the account here instead.');
    return port.deletionCode();
  }

  /** Sign out every other device of this account (feature `sessions`); how many were signed out. */
  async revokeOtherSessions(): Promise<number> {
    const port = this.port_();
    if (!this.server?.features.includes('sessions') || !port.revokeOtherSessions) throw new Error('This server cannot sign out other devices yet.');
    return (await port.revokeOtherSessions()).revoked;
  }

  /**
   * Backend A15: a one-time nonce for the next Apple/Google sign-in, or undefined when this server does not
   * issue them (older servers; the sign-in then goes without one, as before) or could not be reached for one.
   * A nonce fetched ahead (`prefetchSignInNonce`, when the Account section opens) is used first, so the
   * provider's popup opens straight from the tap (Safari blocks a popup that waited for the network).
   */
  async signInNonce(provider: LinkProvider): Promise<string | undefined> {
    if (provider !== 'apple' && provider !== 'google') return undefined;
    const ready = this.nonceAhead;
    this.nonceAhead = null;
    if (ready && ready.expiresAt - 60_000 > Date.now()) return ready.nonce;
    return (await this.fetchNonce())?.nonce;
  }

  /** Fetch a sign-in nonce ahead of the tap that needs it (see `signInNonce`). */
  prefetchSignInNonce(): void {
    if (this.nonceAhead && this.nonceAhead.expiresAt - 60_000 > Date.now()) return;
    void this.fetchNonce().then((n) => {
      // The device's own clock (the server's `expiresAt` is on the server's clock): a nonce lives 10 minutes there.
      if (n) this.nonceAhead = { nonce: n.nonce, expiresAt: Date.now() + 9 * 60_000 };
    });
  }

  private nonceAhead: { nonce: string; expiresAt: number } | null = null;

  private async fetchNonce(): Promise<{ nonce: string; expiresAt: number } | null> {
    const port = this.port;
    if (!port?.authNonce || !this.server?.features.includes('signin-nonce')) return null;
    try {
      const r = await port.authNonce();
      return r.nonce ? r : null;
    } catch (e) {
      this.log('Online play: no sign-in nonce from the server', e);
      return null;
    }
  }

  /** Whether this server can sign out just this device (feature `session-control`). */
  get canSignOutDevice(): boolean {
    return this.online && Boolean(this.server?.features.includes('session-control') && this.port?.signOutDevice);
  }

  /**
   * Backend A16: sign out this device. The server refuses (`409 conflict`, thrown as a `ServerError`) when
   * this device holds the account's last key; nothing changes then. Otherwise online play switches off
   * here (as after deleting the account, so it does not quietly register a new player); the account stays
   * on the server and can come back through a linked sign-in.
   */
  async signOutDevice(): Promise<void> {
    const port = this.port_();
    if (!this.server?.features.includes('session-control') || !port.signOutDevice) throw new Error('This server cannot sign out this device yet.');
    // Reports and actions waiting here belong to this account: send them while the token still works.
    await this.flush().catch(() => undefined);
    await port.signOutDevice();
    this.stop();
    this.village?.reset();
    this.village?.stop();
    const g = this.o.game;
    for (const r of g.state.battleLog) if (r.settlement === 'pending' && r.ticket) g.dispatch({ type: 'settleOnlineAttack', ticket: r.ticket, rejected: 'signed_out' });
    this.saveOutbox([]);
    this.kv.set(`tk.net.rotatedAt:${this.url}`, null);
    Connection.choose('off', this.kv);
    this.player = null;
    this.setStatus('off');
  }

  /**
   * Backend A16: rotate this device's token every `ROTATE_EVERY_MS` (feature `session-control`), so a token
   * copied from the device stops being useful. The clock starts the first time this server offers it; a
   * failed rotation is tried again a day later. Never breaks a sync.
   */
  private async maybeRotate(port: ServerPort): Promise<void> {
    if (!port.rotateToken || !this.server?.features.includes('session-control')) return;
    const key = `tk.net.rotatedAt:${this.url}`;
    const now = Date.now();
    const last = Number(this.kv.get(key) ?? 0);
    if (!last || last > now) {
      this.kv.set(key, String(now));
      return;
    }
    if (now - last < ROTATE_EVERY_MS) return;
    try {
      const switched = await port.rotateToken();
      this.kv.set(key, String(switched ? now : now - ROTATE_EVERY_MS + 86_400_000));
    } catch (e) {
      this.kv.set(key, String(now - ROTATE_EVERY_MS + 86_400_000));
      this.log('Online play: could not rotate this device\'s token', e);
    }
  }

  /**
   * Servers this device still holds an online account token for, although
   * online play with them is off here (Settings → Play offline). The account
   * still exists on the server, so Settings offers to delete it (re-audit).
   */
  storedAccounts(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('tk.net.token:') && localStorage.getItem(k)) out.push(k.slice('tk.net.token:'.length));
      }
    } catch {
      /* storage blocked: nothing to list */
    }
    return out.filter((u) => u && u !== this.url);
  }

  /**
   * Delete the online account this device holds a token for on `url`,
   * connecting just for that (online play stays off). Raids still waiting for
   * that server become practice results, as with `deleteAccount`.
   */
  async deleteStoredAccount(url: string): Promise<void> {
    const port = (this.o.makePort ?? ((u) => new HttpServerAdapter(u, { build: this.o.build, dataVersion: this.o.dataVersion })))(url);
    if (!port.hasIdentity()) return;
    await port.deleteAccount();
    const g = this.o.game;
    for (const r of g.state.battleLog) if (r.settlement === 'pending' && r.ticket) g.dispatch({ type: 'settleOnlineAttack', ticket: r.ticket, rejected: 'account_deleted' });
    for (const k of [`tk.net.outbox:${url}`, `tk.net.village:${url}`, `tk.net.push:${url}`, `tk.net.villageMoveRefused:${url}`, `tk.net.villageMoveRetryAt:${url}`]) this.kv.set(k, null);
    this.kv.set(NAME_KEY, null);
    this.emit();
  }

  /** A deletion code for an account this device holds a token for while online play is off. */
  async storedDeletionCode(url: string): Promise<DeletionCodeResponse> {
    const port = (this.o.makePort ?? ((u) => new HttpServerAdapter(u, { build: this.o.build, dataVersion: this.o.dataVersion })))(url);
    if (!port.hasIdentity() || !port.deletionCode) throw new Error('No online account on this device for that server.');
    return port.deletionCode();
  }

  /** Link a sign-in (Apple, Google, Game Center, Play Games) to this player, so it can be restored on other devices. */
  async link(provider: LinkProvider, credential: LinkCredential): Promise<void> {
    if (!this.port) throw new Error('No server configured.');
    await this.port.link(provider, credential);
    this.emit();
  }

  /**
   * Sign in on this device as the player linked to this sign-in (cloud save,
   * roadmap step 24). Battle reports waiting here belong to the current
   * player, so they are sent first. Afterwards the connection syncs as that
   * player; a village the server keeps for them replaces the one here (which
   * becomes a backup).
   */
  async signIn(provider: LinkProvider, credential: LinkCredential): Promise<void> {
    if (!this.port) throw new Error('No server configured.');
    await this.flush();
    await this.port.signIn(provider, credential, 'game');
    this.village?.reset();
    this.player = null;
    this.status = 'connecting';
    this.server = null;
    await this.sync();
  }

  /** Begin connecting, and keep in touch: light sync every minute, base upload every 2 minutes. */
  start(): void {
    if (!this.port) return;
    void this.sync();
    this.timers.push(setInterval(() => void this.sync(), 60_000));
    this.timers.push(setInterval(() => void this.uploadBase(), 120_000));
    // A server-held village: send waiting actions every 15 s.
    this.timers.push(setInterval(() => void this.village?.flush().catch((e) => this.handleError(e)), 15_000));
    // Client re-audit item 13: follow the device's network and the app coming back, instead of
    // saying "Online" for a minute after the network went away or "Connecting…" after it returned.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onOffline = () => {
        if (this.status === 'online' || this.status === 'connecting') this.setStatus('offline', 'No internet connection.');
      };
      const onOnline = () => this.syncSoon();
      const onVisible = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.syncSoon();
      };
      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisible);
      this.unlisten = () => {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
  }

  private unlisten: (() => void) | null = null;
  private lastNudge = 0;

  /** Sync now (the network came back, the app came to the front), at most every 5 s, skipping any retry wait. */
  private syncSoon(): void {
    const now = Date.now();
    if (now - this.lastNudge < 5000) return;
    this.lastNudge = now;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryDelay = 15_000;
    void this.sync();
  }

  stop(): void {
    this.unlisten?.();
    this.unlisten = null;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Connect if needed, then bring everything in. Concurrent calls share one run. */
  sync(): Promise<void> {
    if (!this.port || this.status === 'incompatible' || this.status === 'suspended') return Promise.resolve();
    if (!this.syncing) {
      this.syncing = this.runSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async runSync(): Promise<void> {
    const port = this.port!;
    const g = this.o.game;
    try {
      if (!this.online) {
        if (this.status !== 'connecting') this.setStatus('connecting');
        this.server = await port.hello();
        // Step 75: a game the server can no longer check pauses online play (the village keeps working offline).
        const update = updateNeeded(this.server, SIM_RULES, this.o.build);
        if (update) {
          this.setStatus('incompatible', update);
          return;
        }
        // Step 76: the operators' number changes, kept for the next start (never applied mid-session).
        if (this.o.balance) {
          const offered = this.server.features.includes('balance-bundles') && port.balance ? await port.balance() : null;
          const what = await this.o.balance.offer(offered?.bundle ?? null, offered?.cohorts ?? []);
          if (what === 'refused') this.log('Online play: the server offered a balance bundle this game refused');
        }
        // Re-audit: the age band is known before this device registers or goes online.
        if (!(await this.ensureAge())) {
          this.setStatus('offline', 'Online play starts once you tell us your age: Settings → Online play → Connect now.');
          return;
        }
        await this.ensurePlayer(port);
        await this.syncAge(port);
        await this.syncRules(port);
        g.dispatch({ type: 'netBind', playerId: this.player!.id });
        // The real Grove replaces the bot Grove while playing online.
        if (g.state.grove.joined) g.dispatch({ type: 'leaveLocalGrove' });
        await this.uploadBase();
        // Learn whether the server keeps this village, and reconcile with it.
        if (this.server.features.includes('server-economy')) await this.village?.connect();
        await this.autoMoveVillage();
        this.retryDelay = 15_000;
        this.setStatus('online');
        void this.refreshNotices();
      } else {
        this.player = await port.me(); // Grove membership may have changed
        // A move refused with "not yet" (ledger audit A2) is due again after a day, even in a long session.
        await this.autoMoveVillage();
      }
      await this.pullDefenses(port);
      await this.pullDonations(port);
      await this.claimChests(port);
      await this.claimGangChests(port);
      await this.flush();
      this.player = await port.me();
      g.dispatch({ type: 'syncRank', trophies: this.player.trophies, shieldUntil: this.player.shieldUntil });
      await this.maybeRotate(port);
      this.emit();
    } catch (e) {
      this.handleError(e);
    }
  }

  private handleError(e: unknown): void {
    if (e instanceof ServerError && e.code === 'version_mismatch') {
      this.setStatus('incompatible', e.message);
      return;
    }
    // Rolling deploy (2026-11-14): the server's village was saved by a newer build (another device updated
    // first). This build cannot read it, so online play pauses with "Update Kagemura"; nothing is adopted
    // and the village on this device keeps working offline. (Was: an "offline" status retried forever.)
    if (e instanceof NewerSaveError) {
      this.log('Online play: the village on the server is from a newer version of Kagemura', e);
      this.setStatus('incompatible', NEWER_VILLAGE_MESSAGE);
      return;
    }
    if (e instanceof ServerError && e.code === 'banned') {
      this.setStatus('suspended', e.message);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    this.log('Online play: sync failed', e);
    if (e instanceof ServerError && (!e.retryable || e.code === 'rate_limited') && this.online) {
      // A rule said no to one call (or asked us to slow down); the connection itself is
      // fine. Queued battle reports stay in the outbox for the next sync.
      this.lastError = msg;
      this.emit();
      return;
    }
    this.setStatus('offline', msg);
    if (!this.retryTimer && this.timers.length) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.sync();
      }, this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 5 * 60_000);
    }
  }

  private async ensurePlayer(port: ServerPort): Promise<void> {
    if (port.hasIdentity()) {
      try {
        this.player = await port.me();
        return;
      } catch (e) {
        if (!(e instanceof ServerError) || e.code !== 'unauthorized') throw e;
        // The server forgot us (new database): start a new player there.
      }
    }
    await port.register(this.name);
    this.player = await port.me();
    this.kv.set(NAME_KEY, this.player.name);
  }

  /** Share the village layout so other players can attack it. */
  async uploadBase(): Promise<void> {
    // A village the server keeps is its own base there.
    if (!this.port || !this.player || this.serverVillage) return;
    const g = this.o.game;
    try {
      await this.port.uploadBase({ base: villageToBase(g.state, g.now(), g.data, this.player.name), name: this.player.name });
    } catch (e) {
      this.log('Online play: base upload failed', e);
    }
  }

  /**
   * Upload the base first if the Keep level the server knows is out of date:
   * the server checks attacks against that Keep (troop unlocks, camp and Lodge
   * sizes), so a fresh Keep upgrade must reach it before the next attack.
   */
  async ensureFreshBase(): Promise<void> {
    if (!this.port || !this.player) return;
    // A server-held village: the server needs our latest actions (the troops we will attack with, a new Keep).
    if (this.serverVillage) {
      await this.village!.flush();
      return;
    }
    const g = this.o.game;
    const hall = villageToBase(g.state, g.now(), g.data).hallLevel;
    if (hall === this.player.hallLevel) return;
    await this.uploadBase();
    try {
      this.player = await this.port.me();
    } catch (e) {
      this.log('Online play: could not refresh the player', e);
    }
  }

  /** Real raids against this village since the last check. */
  private async pullDefenses(port: ServerPort): Promise<void> {
    const g = this.o.game;
    const { defenses } = await port.defenses(g.state.net.defensesSince);
    if (!defenses.length) return;
    const me = await port.me();
    const known = new Set(g.state.defenseLog.map((x) => x.id));
    let added = 0;
    for (const d of defenses) {
      const record: BattleRecord = { id: d.id, at: d.at, kind: 'defense', opponentName: d.attackerName, setup: { seed: d.seed, base: d.base, army: d.army, levels: d.levels, ...(d.infiltration ? { infiltration: true } : {}), ...(d.reinforcements ? { reinforcements: d.reinforcements } : {}), ...(d.hero ? { hero: d.hero } : {}) }, deployments: d.deployments, endTick: d.endTick, result: d.result, trophies: d.trophies };
      g.dispatch({ type: 'applyDefense', record, lost: d.result.loot, trophies: me.trophies, shieldUntil: me.shieldUntil });
      if (!known.has(d.id)) added++;
    }
    if (added) this.newDefenses += added;
  }

  /** Raids that arrived since the HUD last asked (for a toast). */
  newDefenses = 0;

  /** Troops friends sent: into the Grove Lodge, then acknowledged. */
  private async pullDonations(port: ServerPort): Promise<void> {
    const { donations } = await port.inbox();
    if (!donations.length) return;
    this.o.game.dispatch({ type: 'receiveDonations', items: donations });
    await port.ackInbox(donations.map((d) => d.id));
  }

  /** Gang War chests (step 65) the server lists for this player that this village has not received yet. */
  private async claimGangChests(port: ServerPort): Promise<void> {
    if (!this.server?.features.includes('gang-wars')) return;
    const g = this.o.game;
    let view: GangWarResponse;
    try {
      view = await port.gangWar();
    } catch (e) {
      if (e instanceof ServerError && e.code === 'not_found') return; // not in a Gang
      throw e;
    }
    for (const w of view.recent) {
      if ((g.state.net.gangWars ?? []).includes(w.id) || this.triedGangWars.has(w.id)) continue;
      this.triedGangWars.add(w.id);
      try {
        const c = await port.gangWarClaim(w.id);
        g.dispatch({ type: 'claimGangChest', warId: c.warId, outcome: c.outcome, ...(c.generated ? { generated: true } : {}) });
      } catch (e) {
        if (!(e instanceof ServerError) || e.retryable) {
          this.triedGangWars.delete(w.id);
          throw e;
        }
      }
    }
  }

  /** Grove Raid chests the server lists for this player that this village has not received yet. */
  private async claimChests(port: ServerPort): Promise<void> {
    const g = this.o.game;
    if (!this.player?.groveId) return;
    const view = await port.raid();
    for (const { week } of view.chests) {
      if (g.state.net.raidWeeks.includes(week) || this.triedWeeks.has(week)) continue;
      this.triedWeeks.add(week);
      try {
        const c = await port.claimRaid(week);
        g.dispatch({ type: 'claimRaidChest', week, outcome: c.outcome, ours: c.ours, theirs: c.theirs });
      } catch (e) {
        if (!(e instanceof ServerError) || e.retryable) {
          this.triedWeeks.delete(week);
          throw e;
        }
        // not_found: the Grove did not take part, or the player joined later.
      }
    }
  }

  // ---------------------------------------------------------------- outbox

  private get outboxKey(): string {
    return `tk.net.outbox:${this.url}`;
  }

  outbox(): OutboxItem[] {
    try {
      const v = JSON.parse(this.kv.get(this.outboxKey) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  /**
   * The outbox could not be written (storage full or blocked): battles waiting
   * for the server live only in memory until they are sent (GLOBAL-010).
   */
  outboxStorageProblem = false;

  /** A queue on this device could not be stored: the player is told, and it is sent as soon as possible. */
  get storageProblem(): boolean {
    return this.outboxStorageProblem || Boolean(this.village?.storageProblem);
  }

  private saveOutbox(items: OutboxItem[]): void {
    const value = items.length ? JSON.stringify(items) : null;
    let ok = true;
    if (this.kv.trySet) ok = this.kv.trySet(this.outboxKey, value);
    else this.kv.set(this.outboxKey, value);
    if (ok !== !this.outboxStorageProblem) {
      this.outboxStorageProblem = !ok;
      this.emit();
    }
  }

  /**
   * The player tapped Attack on an online raid (re-audit): tell the server the battle counts now, and
   * get the battle seed it holds back until then (protocol 10, ledger audit A1). Resolves with the seed,
   * or undefined from a server that sent it with the match. Rejects when the raid could not start (no
   * connection, the scout expired): the battle must not begin, it would be played with the wrong seed.
   */
  async startAttack(ticket: string, stake?: number): Promise<number | undefined> {
    const port = this.port;
    if (!port?.startAttack || !this.server?.features.includes('attack-commit')) return undefined;
    if (!this.online) throw new Error('No connection: the raid could not start. Try again when you are back online.');
    try {
      // Declared stakes (protocol 11): sent only to a server that settles them.
      const r = await port.startAttack(ticket, stake !== undefined && this.server.features.includes('stakes') ? stake : undefined);
      return typeof r.seed === 'number' ? r.seed >>> 0 : undefined;
    } catch (e) {
      this.log('Online play: could not start the raid', e);
      throw new Error(e instanceof ServerError && !e.retryable ? e.message : 'Could not reach the server to start the raid. Try again in a moment.', { cause: e });
    }
  }

  /**
   * Before asking for an opponent: send the battle reports still waiting (ledger audit A1). The server
   * settles a started raid that has no report a few minutes after Attack as a loss when the next match
   * is asked for, so a won raid must reach it first. Bounded, so a slow connection never blocks scouting.
   */
  async sendReportsBeforeMatch(timeoutMs = 8_000): Promise<void> {
    if (!this.port || !this.online || this.outbox().length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.flush().catch((e) => this.handleError(e)), new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
    if (timer !== undefined) clearTimeout(timer);
  }

  /** Queue a finished battle for the server and try to send it now. */
  report(kind: OutboxItem['kind'], sub: BattleSubmission): Promise<void> {
    const items = this.outbox();
    if (!items.some((i) => i.sub.ticket === sub.ticket)) items.push({ id: sub.ticket, kind, sub, at: this.o.game.now() });
    this.saveOutbox(items);
    return this.flush().catch((e) => this.handleError(e));
  }

  private flushing: Promise<void> | null = null;

  /** Send queued battles in order. Rule rejections are dropped; network trouble stops and retries later. */
  flush(): Promise<void> {
    if (!this.port) return Promise.resolve();
    if (!this.flushing) {
      this.flushing = this.runFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async runFlush(): Promise<void> {
    const port = this.port!;
    const g = this.o.game;
    // Actions first: an attack's troops must be on the server before its report.
    await this.village?.flush();
    this.requeuePending();
    for (const item of this.outbox()) {
      try {
        if (item.kind === 'attack') {
          // The server's answer settles the attack: its loot and honor are banked only now.
          const r = await port.submitAttack(item.sub);
          g.dispatch({ type: 'settleOnlineAttack', ticket: item.sub.ticket, result: r.result, trophies: r.trophies, playerTrophies: r.playerTrophies, ...(r.stake !== undefined ? { stake: r.stake } : {}) });
          g.dispatch({ type: 'syncRank', trophies: r.playerTrophies });
        } else if (item.kind === 'gangwar') {
          await port.gangWarAttack(item.sub);
        } else {
          await port.submitRaidAttack(item.sub);
        }
      } catch (e) {
        if (!(e instanceof ServerError) || e.retryable) throw e;
        this.log(`Online play: the server refused a ${item.kind} report (${e.code})`, e);
        // Refused for good (expired ticket, rule check): it becomes a practice result, with no loot or honor.
        if (item.kind === 'attack') g.dispatch({ type: 'settleOnlineAttack', ticket: item.sub.ticket, rejected: e.code });
      }
      this.saveOutbox(this.outbox().filter((i) => i.id !== item.id));
    }
    this.emit();
  }

  /**
   * Attacks still waiting for the server whose report is missing from the
   * outbox (cleared browser storage, another device's outbox): queue them
   * again from the battle record. The server answers a repeated report with
   * its first result, so this can never count an attack twice.
   */
  private requeuePending(): void {
    const items = this.outbox();
    const queued = new Set(items.map((i) => i.sub.ticket));
    let added = false;
    for (const r of this.o.game.state.battleLog) {
      if (r.settlement !== 'pending' || !r.ticket || queued.has(r.ticket)) continue;
      items.push({ id: r.ticket, kind: 'attack', at: r.at, sub: { ticket: r.ticket, seed: r.setup.seed, army: r.setup.army, levels: r.setup.levels, reinforcements: r.setup.reinforcements, ...(r.setup.hero ? { hero: r.setup.hero } : {}), deployments: r.deployments, endTick: r.endTick, clientHash: r.result.hash, ...(r.rules !== undefined ? { rules: r.rules } : {}) } });
      added = true;
    }
    if (added) this.saveOutbox(items);
  }
}
