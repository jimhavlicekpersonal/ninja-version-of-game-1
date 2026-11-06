import { localDayIndex } from '../sim/calendar';
import type { Analytics } from '../../backend/analytics/events';
import { SaveConflictError, type SaveStore } from '../../backend/persist/saveStore';
import type { Clock } from '../sim/clock';
import { computeOfflineProgress, type OfflineSummary } from '../sim/offline';
import { deserialize, NewerSaveError, serialize } from '../sim/save';
import type { GameData, VillageState, PendingBattle } from '../sim/types';
import type { BattleRecord, BattleSetup, Deployment } from '../sim/battle/types';
import type { Cost, OfferRule, OfferTrigger } from '../sim/types';
import { canPurchase, productForStoreId, productInfo, storeProductId } from '../sim/monetization';
import { raidPhase } from '../sim/social/groveRaid';
import { MockPaymentProvider, type PaymentProvider, type PurchaseVerifier, type StoreReceipt } from '../../backend/payments/provider';
import { advance, applyCommand, createNewVillage, hallLevel, type Command, type CommandResult, type FinishedUpgrade, type SimEvent } from '../sim/village';
import { passSeason } from '../sim/pass';
import { seasonOf } from '../sim/ranks';
import { trainingReady } from '../sim/army';
import { withEconomy, type Economy } from '../sim/serverEconomy';

export interface ControllerDeps {
  clock: Clock;
  store: SaveStore;
  analytics: Analytics;
  data: GameData;
  payments?: PaymentProvider;
  /** False when the online server provides real raids instead of bots. */
  botRaids?: boolean;
  /**
   * The testing sandbox (time skips, a free test store): every village played
   * here is marked, and a server refuses to take a marked village (GLOBAL-002).
   */
  sandbox?: boolean;
}

/**
 * `unsaved`: delivered into the village on screen, but this device could not
 * save it yet (storage full or blocked). The store transaction stays open, so
 * the purchase is delivered again on the next start if the save never lands
 * (GLOBAL-003); it is finished as soon as a save succeeds.
 */
export type PurchaseOutcome = { ok: true; grants: Cost; unsaved?: boolean } | { ok: false; code: string; message: string };

export interface StartResult {
  controller: GameController;
  /** Set when the player was away long enough to show a "welcome back" summary. */
  offline: OfflineSummary | null;
  isNew: boolean;
  /** Set when the old save could not be read and a fresh village was started. */
  loadError?: string;
}

/** An earlier village kept after a failed load, described so the player can recognise it. */
export interface VillageBackup {
  key: string;
  savedAt: number;
  keep: number;
  buildings: number;
  warriors: number;
  honor: number;
}

type Listener = (finished: FinishedUpgrade[]) => void;

/** The id a village records a store purchase under ("apple:…", "google:…"), the same on every path. */
const receiptId = (r: StoreReceipt) => `${r.store}:${r.storeTransactionId}`;

/**
 * Owns the live village state. Rendering reads `state` and sends commands
 * through `dispatch`. No Phaser here, so it can be tested in Node.
 */
export class GameController {
  private listeners = new Set<Listener>();
  private offerListeners = new Set<(rule: OfferRule) => void>();
  private eventListeners = new Set<(events: SimEvent[]) => void>();
  private commandListeners = new Set<(cmd: Command, at: number) => void>();
  private offersThisSession = 0;
  readonly payments: PaymentProvider;
  /**
   * The server that checks store receipts (roadmap Phase 4), or null to trust
   * the store on this device (no server, or one that does not check them for a
   * village kept on the device). Set by main.ts from the Connection.
   */
  purchaseVerifier: () => PurchaseVerifier | null = () => null;
  private saveChain: Promise<void> = Promise.resolve();
  /**
   * Store receipts delivered into the village but not yet in a save that
   * landed. They are finished only after one does (GLOBAL-003): a store
   * transaction finished before the grant is on disk could be lost for good.
   */
  private awaitingSave: StoreReceipt[] = [];
  private saveErrorListeners = new Set<(e: Error) => void>();
  /** Another tab or window took this village over: nothing here may be saved any more. */
  private takenOver = false;

  /** Hear about saves that failed (storage full, blocked, evicted), so the player can be warned. */
  onSaveError(fn: (e: Error) => void): () => void {
    this.saveErrorListeners.add(fn);
    return () => this.saveErrorListeners.delete(fn);
  }

  private constructor(
    private readonly deps: ControllerDeps,
    public state: VillageState,
  ) {
    this.payments = deps.payments ?? new MockPaymentProvider(() => deps.clock.now());
  }

  /** Mark a sandbox village (`flags.sandbox`), so its progress never reaches a server. */
  private static marked(state: VillageState, deps: ControllerDeps): VillageState {
    return deps.sandbox && !state.flags.sandbox ? { ...state, flags: { ...state.flags, sandbox: true } } : state;
  }

  static async start(deps: ControllerDeps): Promise<StartResult> {
    const now = deps.clock.now();
    let raw: unknown | null = null;
    let loadError: string | undefined;
    try {
      raw = await deps.store.load();
    } catch (e) {
      loadError = `Could not read your save: ${(e as Error).message}`;
    }
    let state: VillageState | null = null;
    if (raw) {
      try {
        state = deserialize(raw, deps.data);
      } catch (e) {
        // A newer game wrote this save. It is healthy: stop here rather than replace it with a new village.
        if (e instanceof NewerSaveError) throw e;
        loadError = (e as Error).message;
        await deps.store.backupDamaged(raw).catch(() => undefined);
      }
    }
    if (!state) {
      const controller = new GameController(deps, GameController.marked(createNewVillage(now, deps.data), deps));
      await controller.save();
      return { controller, offline: null, isNew: true, loadError };
    }
    const { state: caughtUp, summary } = computeOfflineProgress(state, now, deps.data, { botRaids: deps.botRaids });
    const controller = new GameController(deps, GameController.marked(caughtUp, deps));
    await controller.save();
    const show = summary.awayMs >= deps.data.economy.welcomeBackMinAwaySeconds * 1000;
    return { controller, offline: show ? summary : null, isNew: false, loadError };
  }

  get data(): GameData {
    return this.deps.data;
  }

  now(): number {
    return this.deps.clock.now();
  }

  dispatch(cmd: Command): CommandResult {
    const now = this.now();
    const result = applyCommand(this.state, cmd, now, this.deps.data);
    if (!result.ok) return result;
    this.state = result.state;
    for (const e of result.events) {
      if (e.kind === 'upgrade_start') {
        this.deps.analytics.log('upgrade_start', { building: e.buildingType, toLevel: e.toLevel, seconds: e.seconds, cost: e.cost });
      } else if (e.kind === 'research_start') {
        this.deps.analytics.log('research_start', { troop: e.troop, toLevel: e.toLevel, seconds: e.seconds, cost: e.cost });
      } else if (e.kind === 'upgrade_cancel') {
        this.deps.analytics.log('upgrade_cancel', { building: e.buildingType, toLevel: e.toLevel, refund: e.refund });
      } else if (e.kind === 'collect') {
        this.deps.analytics.log('collect', { building: e.buildingType, resource: e.resource, amount: e.amount });
      } else if (e.kind === 'skip_used') {
        this.deps.analytics.log('skip_used', { what: e.what, seconds: e.seconds, moonstones: e.moonstones });
      } else if (e.kind === 'moonstone_spend') {
        this.deps.analytics.log('moonstone_spend', { what: e.what, moonstones: e.moonstones });
      } else if (e.kind === 'reward') {
        this.deps.analytics.log('reward', { source: e.source, grants: e.grants });
      } else if (e.kind === 'donation') {
        this.deps.analytics.log('donation', { troop: e.troop, count: e.count, xp: e.xp });
      } else if (e.kind === 'raid_end') {
        const r = e.record.result;
        this.deps.analytics.log('raid_end', { kind: e.record.kind, stars: r.stars, destruction: r.destruction, loot: r.loot, used: r.used, ticks: r.ticks, endReason: r.endReason });
      }
    }
    this.emit([]);
    void this.save();
    // Right after the change, so a listener sees the village this command made (the server-economy queue hashes it).
    for (const fn of this.commandListeners) fn(cmd, now);
    for (const fn of this.eventListeners) fn(result.events);
    for (const e of result.events) if (e.kind === 'trigger') this.triggerOffer(e.trigger);
    return result;
  }

  /** Hear every successful command and the time it was applied at (the server-owned village queues them). */
  onCommand(fn: (cmd: Command, at: number) => void): () => void {
    this.commandListeners.add(fn);
    return () => this.commandListeners.delete(fn);
  }

  /**
   * The server's economy is the truth (roadmap step 21): put it in place, then
   * replay the commands still waiting for the server on top of it, at their
   * own times. Anything the replay refuses is simply dropped (the server will
   * refuse it too).
   */
  adoptEconomy(economy: Economy, replay: { command: Command; t: number }[]): void {
    let s = withEconomy(this.state, economy);
    for (const r of replay) {
      const x = applyCommand(s, r.command, r.t, this.deps.data);
      if (x.ok) s = x.state;
    }
    this.state = s;
    this.emit([]);
    void this.save();
  }

  /** Swap in a village from the server; the one here is kept as a backup (Settings lists it). */
  async adoptVillage(village: VillageState): Promise<void> {
    await this.deps.store.backupDamaged(serialize(this.state, this.now()));
    await this.replace(village);
  }

  /** Listen to the events of every successful command (sounds, effects). */
  onEvents(fn: (events: import('../sim/village').SimEvent[]) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  /** 24 hours before a Grove Raid, show the war-prep offer (once per raid). */
  private checkPrepOffer(now: number): void {
    const g = this.state.grove;
    if (!g.joined) return;
    const p = raidPhase(now, this.deps.data);
    if (p.phase === 'live') return;
    const week = p.phase === 'upcoming' ? p.week : p.week + 1;
    if (g.prepOfferWeek === week || p.nextStart - now > this.deps.data.social.groveRaid.prepOfferHours * 3_600_000) return;
    const r = applyCommand(this.state, { type: 'markPrepOffer', week }, now, this.deps.data);
    if (r.ok) this.state = r.state;
    this.triggerOffer('grove_raid_soon');
  }

  /** Bank an Alliance War attack (offline Alliance). `at` is when the attack began. */
  finishGroveBattle(target: number, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined, opponentName: string, at = this.now()): { stars: number; destruction: number; record: BattleRecord } | null {
    const r = this.dispatch({ type: 'groveBattleEnd', target, record: { at, opponentName, setup, deployments, endTick } });
    if (!r.ok) return null;
    const e = r.events.find((x) => x.kind === 'grove_attack');
    if (!e || e.kind !== 'grove_attack') return null;
    this.deps.analytics.log('grove_raid_end', { target, stars: e.stars, destruction: e.destruction });
    return { stars: e.stars, destruction: e.destruction, record: e.record };
  }

  /** Record an Alliance War attack the server scores (online Alliance): troops are spent, the fight is kept for replay. */
  finishRemoteGroveBattle(target: number, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined, opponentName: string, at = this.now()): { stars: number; destruction: number; record: BattleRecord } | null {
    const r = this.dispatch({ type: 'remoteGroveBattleEnd', target, record: { at, opponentName, setup, deployments, endTick } });
    if (!r.ok) return null;
    const e = r.events.find((x) => x.kind === 'grove_attack');
    return e && e.kind === 'grove_attack' ? { stars: e.stars, destruction: e.destruction, record: e.record } : null;
  }

  // ---------- Offers ----------

  onOffer(fn: (rule: OfferRule) => void): () => void {
    this.offerListeners.add(fn);
    return () => this.offerListeners.delete(fn);
  }

  /** Show an offer for this trigger, at most once per session. */
  triggerOffer(trigger: OfferTrigger): OfferRule | null {
    if (this.offersThisSession >= this.deps.data.offers.maxPerSession) return null;
    const r = applyCommand(this.state, { type: 'triggerOffer', trigger }, this.now(), this.deps.data);
    if (!r.ok) return null;
    this.state = r.state;
    const e = r.events.find((x) => x.kind === 'offer_shown');
    if (!e || e.kind !== 'offer_shown') return null;
    this.offersThisSession++;
    const rule = this.deps.data.offers.rules.find((o) => o.id === e.offerId)!;
    this.deps.analytics.log('offer_shown', { offerId: rule.id, trigger, usd: rule.usd, expiresAt: e.expiresAt });
    this.emit([]);
    void this.save();
    for (const fn of this.offerListeners) fn(rule);
    return rule;
  }

  // ---------- Real-money purchases ----------

  /**
   * Buy a product through the payment provider. The UI must confirm with the player first.
   * With a server that checks receipts: ask it first (age cap; nothing is
   * charged if it says no), pay, send the receipt, deliver what it confirmed,
   * then finish the store transaction. A paid purchase the server could not
   * be reached for stays unfinished in the store and is delivered later
   * (`deliverUnfinished`).
   */
  async purchase(productId: string): Promise<PurchaseOutcome> {
    const check = canPurchase(this.state, productId, this.now(), this.deps.data);
    if (!check.ok) return { ok: false, code: check.code, message: check.message };
    if (!this.payments.available()) return { ok: false, code: 'UNAVAILABLE', message: 'Purchases are not available on this device.' };
    const verifier = this.payments.store ? this.purchaseVerifier() : null;
    let ask = { accountToken: undefined as string | undefined, storeProductId: storeProductId(this.deps.data, productId) };
    if (verifier && this.payments.store) {
      try {
        ask = await verifier.intent(this.payments.store, productId, this.state.profile.under18);
      } catch (e) {
        return { ok: false, code: 'REFUSED', message: (e as Error).message };
      }
    }
    const pay = await this.payments.purchase({ productId, name: check.product.name, usd: check.product.usd, storeProductId: ask.storeProductId, accountToken: ask.accountToken });
    if (!pay.ok) {
      // GLOBAL-005: a cancelled purchase frees its share of the under-18 cap now; a pending one holds it until approved.
      if (verifier?.release && ask.accountToken && (pay.reason === 'cancelled' || pay.reason === 'pending')) {
        await verifier.release(ask.accountToken, pay.reason).catch(() => undefined);
      }
      return { ok: false, code: pay.reason, message: pay.reason === 'pending' ? 'The purchase is waiting for approval. It will be delivered once it is approved.' : pay.message };
    }
    if (verifier && pay.receipt) return this.deliverVerified(pay.receipt, verifier);
    // The same id the store's receipt gives later (deliverReceipt), so a re-delivery after a crash is recognised.
    const transactionId = pay.receipt ? receiptId(pay.receipt) : pay.transactionId;
    if (this.state.purchases.some((p) => p.id === transactionId)) {
      return pay.receipt ? this.settleReceipt(pay.receipt, check.product.grants) : { ok: true, grants: check.product.grants };
    }
    const r = this.dispatch({ type: 'grantPurchase', productId, transactionId });
    if (!r.ok) return { ok: false, code: r.code, message: r.message };
    this.deps.analytics.log('purchase', { productId, usd: check.product.usd, kind: check.product.kind, transactionId, provider: this.payments.name });
    if (!pay.receipt) return { ok: true, grants: check.product.grants, ...((await this.persist()) ? {} : { unsaved: true }) };
    return this.settleReceipt(pay.receipt, check.product.grants);
  }

  /**
   * The grant is in the village: finish the store transaction once a save
   * holding it has landed. If saving fails the transaction stays open (the
   * store gives it back at the next start; `purchases` recognises it, so it is
   * never delivered twice) and is finished after the next save that works.
   */
  private async settleReceipt(receipt: StoreReceipt, grants: Cost): Promise<PurchaseOutcome> {
    if (!this.awaitingSave.some((r) => receiptId(r) === receiptId(receipt))) this.awaitingSave.push(receipt);
    const saved = await this.persist();
    return { ok: true, grants, ...(saved ? {} : { unsaved: true }) };
  }

  /** Send a store receipt to the server, deliver what it confirmed, then finish the store transaction. */
  private async deliverVerified(receipt: StoreReceipt, verifier: PurchaseVerifier): Promise<PurchaseOutcome> {
    let r;
    try {
      r = await verifier.redeem(receipt);
    } catch (e) {
      const err = e as Error & { retryable?: boolean };
      // Paid, but not confirmed yet: the store keeps it unfinished and it is delivered later.
      if (err.retryable !== false) return { ok: false, code: 'PENDING', message: 'Your purchase went through. It will be delivered as soon as the server can be reached.' };
      return { ok: false, code: 'REFUSED', message: err.message };
    }
    const product = productInfo(this.deps.data, r.productId);
    if (!product) return { ok: false, code: 'UNKNOWN_PRODUCT', message: 'That item is not available.' };
    // A server-held village already has it; the game applies the same grant (not sent as a command).
    if (!this.state.purchases.some((p) => p.id === r.transactionId)) {
      const g = this.dispatch({ type: 'grantPurchase', productId: r.productId, transactionId: r.transactionId, verified: true });
      if (!g.ok) return { ok: false, code: g.code, message: g.message };
      this.deps.analytics.log('purchase', { productId: r.productId, usd: r.usd, kind: product.kind, transactionId: r.transactionId, provider: this.payments.name, verified: true });
    }
    if (r.heldOnServer) {
      // The server's village holds it (and gives it back to any device): safe to finish now.
      await this.save();
      await this.payments.finish?.(receipt).catch(() => undefined);
      return { ok: true, grants: product.grants };
    }
    // Delivered on this device only: finish once it is saved here (GLOBAL-003).
    return this.settleReceipt(receipt, product.grants);
  }

  /** Deliver one receipt the store gave outside a purchase call (Ask to Buy approved, a pending payment completed). */
  async deliverReceipt(receipt: StoreReceipt): Promise<PurchaseOutcome> {
    const verifier = this.purchaseVerifier();
    if (verifier) return this.deliverVerified(receipt, verifier);
    // No server checks receipts: trusted on this device, as before Phase 4.
    const product = productForStoreId(this.deps.data, receipt.storeProductId);
    if (!product) return { ok: false, code: 'UNKNOWN_PRODUCT', message: 'That item is not available.' };
    const id = receiptId(receipt);
    if (!this.state.purchases.some((p) => p.id === id)) {
      const g = this.dispatch({ type: 'grantPurchase', productId: product.id, transactionId: id, verified: true });
      if (!g.ok) return { ok: false, code: g.code, message: g.message };
    }
    return this.settleReceipt(receipt, product.grants);
  }

  /** Deliver purchases the store says are paid but not finished (call at start and from Restore purchases). Returns how many were delivered. */
  async deliverUnfinished(): Promise<number> {
    return (await this.deliverUnfinishedReport()).delivered;
  }

  /**
   * Like `deliverUnfinished`, and also says how many could not be delivered
   * yet (server unreachable, not saved): main.ts tries again on the next
   * reconnection with a bounded backoff (GLOBAL-013).
   */
  async deliverUnfinishedReport(): Promise<{ delivered: number; left: number }> {
    let delivered = 0;
    let left = 0;
    for (const receipt of (await this.payments.unfinished?.().catch(() => [])) ?? []) {
      const r = await this.deliverReceipt(receipt);
      if (r.ok && !r.unsaved) delivered++;
      else if (!r.ok && r.code === 'PENDING') left++;
      else if (r.ok) left++;
    }
    return { delivered, left };
  }

  /**
   * Restore purchases (App Store rule for anything not consumable): deliver
   * unfinished store purchases, and give this season's premium Season Scroll
   * back if the server says this player bought it (a new device, a new village).
   */
  async restorePurchases(): Promise<{ delivered: number; restored: number }> {
    const delivered = await this.deliverUnfinished();
    let restored = 0;
    const verifier = this.purchaseVerifier();
    if (verifier) {
      const season = passSeason(this.now(), this.deps.data);
      for (const p of await verifier.history()) {
        if (p.status !== 'credited' || p.productId !== this.deps.data.pass.productId || passSeason(p.at, this.deps.data) !== season) continue;
        if (this.state.pass.premium || this.state.purchases.some((x) => x.id === p.transactionId)) continue;
        if (this.dispatch({ type: 'grantPurchase', productId: p.productId, transactionId: p.transactionId, verified: true }).ok) restored++;
      }
      if (restored) await this.save();
    }
    return { delivered, restored };
  }

  /**
   * Finish any timers that have ended, and settle what the clock rolled over
   * (a new task day, a finished league season). Call this a few times a second.
   */
  tick(): FinishedUpgrade[] {
    const now = this.now();
    const data = this.deps.data;
    const s = this.state;
    const trainingDone = trainingReady(s, now, data);
    const researchDone = s.research.active.some((a) => a.endsAt <= now);
    const groveDue = s.grove.joined && now - s.grove.processedAt >= 30_000;
    const periodDue = localDayIndex(s, now, data) > s.tasks.day || passSeason(now, data) > s.pass.season;
    const seasonDue = seasonOf(now) > s.season;
    this.checkPrepOffer(now);
    if (!trainingDone && !researchDone && !groveDue && !periodDue && !seasonDue && !s.buildings.some((b) => b.upgrade && b.upgrade.endsAt <= now)) return [];
    const logged = this.state.seasonLog.length ? this.state.seasonLog[this.state.seasonLog.length - 1].season : -1;
    const { state, finished } = advance(this.state, now, data);
    this.state = state;
    this.emit(finished);
    void this.save();
    // Report section 5 step 6: a Keep level reached may bring the Keep Celebration offer (rules in offers.json).
    if (finished.some((f) => data.buildings[f.type]?.category === 'hall')) this.triggerOffer('keep_reached');
    // A league season that ended while the game was open: show its chest like any other reward.
    const seasonEvents: SimEvent[] = state.seasonLog
      .filter((sr) => sr.season > logged)
      .map((sr) => ({ kind: 'reward', source: `season:${sr.league}`, grants: sr.chest, ...(sr.overflow ? { overflow: sr.overflow } : {}) }));
    if (seasonEvents.length) for (const fn of this.eventListeners) fn(seasonEvents);
    return finished;
  }

  /** Pick an opponent; returns its seed. The first look is free. */
  scout(paid: boolean): { ok: true; seed: number } | { ok: false; message: string } {
    const r = this.dispatch({ type: 'scout', paid });
    if (!r.ok) return { ok: false, message: r.message };
    const e = r.events.find((x) => x.kind === 'scout');
    return { ok: true, seed: e && e.kind === 'scout' ? e.seed : 0 };
  }

  /**
   * Bank an attack's result (re-simulated from its seed and deployments). With a
   * server `ticket` the attack is recorded as pending: loot and honor arrive
   * when the server confirms it (settleOnlineAttack, from the Connection).
   */
  finishBattle(setup: BattleSetup, deployments: Deployment[], endTick: number | undefined, opponentName: string, ticket?: string, at = this.now()): { record: BattleRecord; banked: Cost } | null {
    const r = this.dispatch({ type: 'battleEnd', record: { at, opponentName, setup, deployments, endTick, ...(ticket ? { ticket } : {}) } });
    if (!r.ok) return null;
    const e = r.events.find((x) => x.kind === 'raid_end');
    if (!e || e.kind !== 'raid_end') return null;
    return { record: e.record, banked: e.record.banked ?? {} };
  }

  /** Remember an attack in progress (called on each deployment), or forget it. */
  trackBattle(pending: PendingBattle | null): void {
    this.dispatch({ type: 'battleProgress', pending });
  }

  /**
   * Resolve a raid the app closed in the middle of: it plays out to the end
   * from its recorded deployments (deployed troops keep fighting, the rest go
   * home), and loot, honor or the trial reward apply exactly once.
   */
  resolvePendingBattle(): { pending: PendingBattle; record: BattleRecord } | null {
    const p = this.state.pendingBattle;
    if (!p) return null;
    // Played out under today's rules: the player never saw it finish, so there is no
    // earlier result to contradict (the record carries the rules it was settled with).
    if (p.kind === 'trial' && p.tier !== undefined) {
      const t = this.finishTrial(p.tier, p.setup, p.deployments, undefined);
      if (t) return { pending: p, record: t.record };
    } else if (p.kind === 'bounty' || p.kind === 'rematch') {
      // Re-audit: a goal-event fortress or a settle-the-score rematch never banks raid loot or honor.
      const record = { at: p.at, opponentName: p.opponentName, setup: p.setup, deployments: p.deployments };
      const r =
        p.kind === 'bounty' && p.eventKey !== undefined
          ? this.dispatch({ type: 'bountyEnd', eventKey: p.eventKey, record })
          : p.kind === 'rematch' && p.defenseId !== undefined
            ? this.dispatch({ type: 'rematchEnd', defenseId: p.defenseId, record })
            : null;
      if (r?.ok) {
        const e = r.events.find((x) => x.kind === 'bounty_end' || x.kind === 'rematch_end');
        const rec = e && 'record' in e ? (e as { record: BattleRecord }).record : null;
        if (rec) return { pending: p, record: rec };
        if (this.state.pendingBattle) this.trackBattle(null);
        return null;
      }
    } else if (p.kind === 'war' && p.target !== undefined) {
      // Alliance War attacks are protected too: closing the app can't save the troops or the attempt.
      const w = p.ticket
        ? this.finishRemoteGroveBattle(p.target, p.setup, p.deployments, undefined, p.opponentName, p.at)
        : this.finishGroveBattle(p.target, p.setup, p.deployments, undefined, p.opponentName, p.at);
      if (w) return { pending: p, record: w.record };
    } else {
      const out = this.finishBattle(p.setup, p.deployments, undefined, p.opponentName, p.ticket, p.at);
      if (out) return { pending: p, record: out.record };
    }
    // Could not be banked (for example the war ended): the deployed troops are
    // still spent, so quitting never undoes an attack, but nothing is won.
    this.dispatch({ type: 'abandonBattle', record: { at: p.at, opponentName: p.opponentName, setup: p.setup, deployments: p.deployments } });
    if (this.state.pendingBattle) this.trackBattle(null);
    return null;
  }

  /** Bank a Shadow Trial attack (re-simulated against the tier's own base). */
  finishTrial(tier: number, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined): { record: BattleRecord; cleared: boolean; firstClear: boolean; reward: Cost } | null {
    const r = this.dispatch({ type: 'trialEnd', tier, record: { at: this.now(), opponentName: setup.base.name, setup, deployments, endTick } });
    if (!r.ok) return null;
    const e = r.events.find((x) => x.kind === 'trial_end');
    if (!e || e.kind !== 'trial_end') return null;
    return { record: e.record, cleared: e.cleared, firstClear: e.firstClear, reward: e.reward };
  }

  /** Earlier villages that can be restored, newest first. Ones that still can't be read stay kept but aren't offered. */
  async backups(): Promise<VillageBackup[]> {
    const data = this.deps.data;
    const out: VillageBackup[] = [];
    for (const { key, raw } of await this.deps.store.listBackups()) {
      try {
        const v = deserialize(raw, data);
        out.push({
          key,
          savedAt: (raw as { savedAt?: number }).savedAt ?? v.lastSeenAt,
          keep: hallLevel(v, data),
          buildings: v.buildings.filter((b) => data.buildings[b.type]?.category !== 'obstacle').length,
          warriors: Object.values(v.army).reduce((a, b) => a + b, 0) + v.training.length,
          honor: v.trophies,
        });
      } catch {
        /* still unreadable: a later version may be able to repair it */
      }
    }
    return out;
  }

  /** Swap a kept village in. The current one becomes a backup, so a wrong choice can be undone. */
  async restoreBackup(key: string): Promise<boolean> {
    const found = (await this.deps.store.listBackups()).find((b) => b.key === key);
    if (!found) return false;
    const village = deserialize(found.raw, this.deps.data);
    await this.deps.store.backupDamaged(serialize(this.state, this.now()));
    await this.deps.store.deleteBackup(key);
    await this.replace(village);
    return true;
  }

  /** Replace the whole village (import or reset). */
  async replace(state: VillageState): Promise<void> {
    this.state = GameController.marked(state, this.deps);
    this.emit([]);
    await this.save();
  }

  async reset(): Promise<void> {
    await this.replace(createNewVillage(this.now(), this.deps.data));
  }

  /** Saves are queued so they always land in order. Never rejects: failures go to `onSaveError`. */
  save(): Promise<void> {
    return this.persist().then(() => undefined);
  }

  /**
   * Save now and say whether this save landed (`save()` cannot: it always
   * resolves). Store receipts delivered before it are finished once it has.
   */
  persist(): Promise<boolean> {
    if (this.takenOver) return this.saveChain.then(() => false);
    const now = this.now();
    this.state = { ...this.state, lastSeenAt: now };
    const file = serialize(this.state, now);
    // Everything delivered so far is in this file.
    const covered = this.awaitingSave.slice();
    const run = this.saveChain
      .then(() => this.deps.store.save(file))
      .then(
        () => {
          this.awaitingSave = this.awaitingSave.filter((r) => !covered.includes(r));
          for (const r of covered) void this.payments.finish?.(r).catch(() => undefined);
          return true;
        },
        (e) => {
          if (e instanceof SaveConflictError) this.takenOver = true;
          else console.warn('save failed', e);
          for (const fn of this.saveErrorListeners) fn(e instanceof Error ? e : new Error(String(e)));
          return false;
        },
      );
    this.saveChain = run.then(() => undefined);
    return run;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(finished: FinishedUpgrade[]): void {
    for (const fn of this.listeners) fn(finished);
  }
}
