import type { Analytics } from '../../backend/analytics/events';
import type { SaveStore } from '../../backend/persist/saveStore';
import type { Clock } from '../sim/clock';
import { computeOfflineProgress, type OfflineSummary } from '../sim/offline';
import { deserialize, serialize } from '../sim/save';
import type { GameData, VillageState, PendingBattle } from '../sim/types';
import type { BattleRecord, BattleSetup, Deployment } from '../sim/battle/types';
import type { Cost, OfferRule, OfferTrigger } from '../sim/types';
import { canPurchase } from '../sim/monetization';
import { raidPhase } from '../sim/social/groveRaid';
import { MockPaymentProvider, type PaymentProvider } from '../../backend/payments/provider';
import { advance, applyCommand, createNewVillage, type Command, type CommandResult, type FinishedUpgrade } from '../sim/village';

export interface ControllerDeps {
  clock: Clock;
  store: SaveStore;
  analytics: Analytics;
  data: GameData;
  payments?: PaymentProvider;
  /** False when the online server provides real raids instead of bots. */
  botRaids?: boolean;
}

export type PurchaseOutcome = { ok: true; grants: Cost } | { ok: false; code: string; message: string };

export interface StartResult {
  controller: GameController;
  /** Set when the player was away long enough to show a "welcome back" summary. */
  offline: OfflineSummary | null;
  isNew: boolean;
  /** Set when the old save could not be read and a fresh village was started. */
  loadError?: string;
}

type Listener = (finished: FinishedUpgrade[]) => void;

/**
 * Owns the live village state. Rendering reads `state` and sends commands
 * through `dispatch`. No Phaser here, so it can be tested in Node.
 */
export class GameController {
  private listeners = new Set<Listener>();
  private offerListeners = new Set<(rule: OfferRule) => void>();
  private eventListeners = new Set<(events: import('../sim/village').SimEvent[]) => void>();
  private offersThisSession = 0;
  readonly payments: PaymentProvider;
  private saveChain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly deps: ControllerDeps,
    public state: VillageState,
  ) {
    this.payments = deps.payments ?? new MockPaymentProvider(() => deps.clock.now());
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
        loadError = (e as Error).message;
        await deps.store.backupDamaged(raw).catch(() => undefined);
      }
    }
    if (!state) {
      const controller = new GameController(deps, createNewVillage(now, deps.data));
      await controller.save();
      return { controller, offline: null, isNew: true, loadError };
    }
    const { state: caughtUp, summary } = computeOfflineProgress(state, now, deps.data, { botRaids: deps.botRaids });
    const controller = new GameController(deps, caughtUp);
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
    for (const fn of this.eventListeners) fn(result.events);
    for (const e of result.events) if (e.kind === 'trigger') this.triggerOffer(e.trigger);
    return result;
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

  /** Bank a Grove Raid attack. */
  finishGroveBattle(target: number, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined, opponentName: string): { stars: number; destruction: number } | null {
    const r = this.dispatch({ type: 'groveBattleEnd', target, record: { at: this.now(), opponentName, setup, deployments, endTick } });
    if (!r.ok) return null;
    const e = r.events.find((x) => x.kind === 'grove_attack');
    if (!e || e.kind !== 'grove_attack') return null;
    this.deps.analytics.log('grove_raid_end', { target, stars: e.stars, destruction: e.destruction });
    return { stars: e.stars, destruction: e.destruction };
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

  /** Buy a product through the payment provider. The UI must confirm with the player first. */
  async purchase(productId: string): Promise<PurchaseOutcome> {
    const check = canPurchase(this.state, productId, this.now(), this.deps.data);
    if (!check.ok) return { ok: false, code: check.code, message: check.message };
    if (!this.payments.available()) return { ok: false, code: 'UNAVAILABLE', message: 'Purchases are not available on this device.' };
    const pay = await this.payments.purchase({ productId, name: check.product.name, usd: check.product.usd });
    if (!pay.ok) return { ok: false, code: pay.reason, message: pay.message };
    const r = this.dispatch({ type: 'grantPurchase', productId, transactionId: pay.transactionId });
    if (!r.ok) return { ok: false, code: r.code, message: r.message };
    this.deps.analytics.log('purchase', { productId, usd: check.product.usd, kind: check.product.kind, transactionId: pay.transactionId, provider: this.payments.name });
    await this.save();
    return { ok: true, grants: check.product.grants };
  }

  /** Finish any timers that have ended. Call this a few times a second. */
  tick(): FinishedUpgrade[] {
    const now = this.now();
    const trainingDone = this.state.training.length > 0 && this.state.training[0].endsAt <= now;
    const groveDue = this.state.grove.joined && now - this.state.grove.processedAt >= 30_000;
    this.checkPrepOffer(now);
    if (!trainingDone && !groveDue && !this.state.buildings.some((b) => b.upgrade && b.upgrade.endsAt <= now)) return [];
    const { state, finished } = advance(this.state, now, this.deps.data);
    this.state = state;
    this.emit(finished);
    void this.save();
    return finished;
  }

  /** Pick an opponent; returns its seed. The first look is free. */
  scout(paid: boolean): { ok: true; seed: number } | { ok: false; message: string } {
    const r = this.dispatch({ type: 'scout', paid });
    if (!r.ok) return { ok: false, message: r.message };
    const e = r.events.find((x) => x.kind === 'scout');
    return { ok: true, seed: e && e.kind === 'scout' ? e.seed : 0 };
  }

  /** Bank an attack's result (re-simulated from its seed and deployments). */
  finishBattle(setup: BattleSetup, deployments: Deployment[], endTick: number | undefined, opponentName: string): { record: BattleRecord; banked: Cost } | null {
    const r = this.dispatch({ type: 'battleEnd', record: { at: this.now(), opponentName, setup, deployments, endTick } });
    if (!r.ok) return null;
    const e = r.events.find((x) => x.kind === 'raid_end');
    if (!e || e.kind !== 'raid_end') return null;
    return { record: e.record, banked: e.record.result.loot };
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
    if (p.kind === 'trial' && p.tier !== undefined) {
      const t = this.finishTrial(p.tier, p.setup, p.deployments, undefined);
      if (t) return { pending: p, record: t.record };
    } else {
      const out = this.finishBattle(p.setup, p.deployments, undefined, p.opponentName);
      if (out) return { pending: p, record: out.record };
    }
    // Could not be banked (for example the army changed): drop it rather than block the game.
    this.trackBattle(null);
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

  /** Replace the whole village (import or reset). */
  async replace(state: VillageState): Promise<void> {
    this.state = state;
    this.emit([]);
    await this.save();
  }

  async reset(): Promise<void> {
    await this.replace(createNewVillage(this.now(), this.deps.data));
  }

  /** Saves are queued so they always land in order. */
  save(): Promise<void> {
    const now = this.now();
    this.state = { ...this.state, lastSeenAt: now };
    const file = serialize(this.state, now);
    this.saveChain = this.saveChain
      .then(() => this.deps.store.save(file))
      .catch((e) => console.warn('save failed', e));
    return this.saveChain;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(finished: FinishedUpgrade[]): void {
    for (const fn of this.listeners) fn(finished);
  }
}
