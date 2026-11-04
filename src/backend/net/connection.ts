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
import type { BattleSubmission, FriendRequestBody, FriendRequestResult, FriendsResponse, HelloResponse, LinkCredential, LinkProvider, PlayerCard, PlayerView, PrivacyRequest, PurchaseStore, ReportReason } from './protocol';
import { normalizeFriendCode } from './names';
// Name rules for instant hints in the UI (the server decides; step 59).
export { NAME_MAX, NAME_MIN, nameShapeProblem, normalizeFriendCode } from './names';
import type { PurchaseVerifier } from '../payments/provider';
import { VillageSync, type SyncGame } from './villageSync';
import { SIM_RULES } from '../../gameplay/sim/battle/battle';
import { updateNeeded } from './versionCheck';

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
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* ignore */
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
  kind: 'attack' | 'raid';
  sub: BattleSubmission;
  at: number;
}

const SERVER_KEY = 'tk.net.server';
const NAME_KEY = 'tk.net.name';

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
  balance?: { offer(b: import('./balanceBundle').BalanceBundle | null): Promise<string> };
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
  private timers: ReturnType<typeof setInterval>[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 15_000;

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

  /** Why the server would not take this village (protocol 7 auto-move), if it refused. */
  get villageMoveRefused(): string | null {
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
      if (e instanceof ServerError && !e.retryable) this.kv.set(`tk.net.villageMoveRefused:${this.url}`, e.message);
      else throw e;
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
      intent: async (s, productId, under18) => (await ready()).purchaseIntent({ store: s, productId, under18 }),
      redeem: async (r) => (await ready()).redeem({ store: r.store, storeProductId: r.storeProductId, receipt: r.receipt }),
      history: async () => (checks && this.port && this.online ? (await this.port.purchaseHistory()).purchases : []),
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
    const sig = JSON.stringify([d.platform, [...types].sort(), tzOffsetMinutes]);
    if (prev?.token === d.token && prev.sig === sig) return;
    await this.port.putPushToken({ token: d.token, platform: d.platform, types, tzOffsetMinutes });
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
  }

  stop(): void {
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
          const offered = this.server.features.includes('balance-bundles') && port.balance ? (await port.balance()).bundle : null;
          const what = await this.o.balance.offer(offered);
          if (what === 'refused') this.log('Online play: the server offered a balance bundle this game refused');
        }
        await this.ensurePlayer(port);
        g.dispatch({ type: 'netBind', playerId: this.player!.id });
        // The real Grove replaces the bot Grove while playing online.
        if (g.state.grove.joined) g.dispatch({ type: 'leaveLocalGrove' });
        await this.uploadBase();
        // Learn whether the server keeps this village, and reconcile with it.
        if (this.server.features.includes('server-economy')) await this.village?.connect();
        await this.autoMoveVillage();
        this.retryDelay = 15_000;
        this.setStatus('online');
      } else {
        this.player = await port.me(); // Grove membership may have changed
      }
      await this.pullDefenses(port);
      await this.pullDonations(port);
      await this.claimChests(port);
      await this.flush();
      this.player = await port.me();
      g.dispatch({ type: 'syncRank', trophies: this.player.trophies, shieldUntil: this.player.shieldUntil });
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
      const record: BattleRecord = { id: d.id, at: d.at, kind: 'defense', opponentName: d.attackerName, setup: { seed: d.seed, base: d.base, army: d.army, levels: d.levels, ...(d.infiltration ? { infiltration: true } : {}) }, deployments: d.deployments, endTick: d.endTick, result: d.result, trophies: d.trophies };
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

  private saveOutbox(items: OutboxItem[]): void {
    this.kv.set(this.outboxKey, items.length ? JSON.stringify(items) : null);
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
          g.dispatch({ type: 'settleOnlineAttack', ticket: item.sub.ticket, result: r.result, trophies: r.trophies, playerTrophies: r.playerTrophies });
          g.dispatch({ type: 'syncRank', trophies: r.playerTrophies });
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
      items.push({ id: r.ticket, kind: 'attack', at: r.at, sub: { ticket: r.ticket, seed: r.setup.seed, army: r.setup.army, levels: r.setup.levels, reinforcements: r.setup.reinforcements, deployments: r.deployments, endTick: r.endTick, clientHash: r.result.hash, ...(r.rules !== undefined ? { rules: r.rules } : {}) } });
      added = true;
    }
    if (added) this.saveOutbox(items);
  }
}
