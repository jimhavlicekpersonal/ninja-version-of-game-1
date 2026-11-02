import type { Analytics } from '../analytics/events';
import type { SaveStore } from '../persist/saveStore';
import type { Clock } from '../sim/clock';
import { computeOfflineProgress, type OfflineSummary } from '../sim/offline';
import { deserialize, serialize } from '../sim/save';
import type { GameData, VillageState } from '../sim/types';
import type { BattleRecord, BattleSetup, Deployment } from '../sim/battle/types';
import type { Cost } from '../sim/types';
import { advance, applyCommand, createNewVillage, type Command, type CommandResult, type FinishedUpgrade } from '../sim/village';

export interface ControllerDeps {
  clock: Clock;
  store: SaveStore;
  analytics: Analytics;
  data: GameData;
}

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
  private saveChain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly deps: ControllerDeps,
    public state: VillageState,
  ) {}

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
    const { state: caughtUp, summary } = computeOfflineProgress(state, now, deps.data);
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
      } else if (e.kind === 'upgrade_cancel') {
        this.deps.analytics.log('upgrade_cancel', { building: e.buildingType, toLevel: e.toLevel, refund: e.refund });
      } else if (e.kind === 'collect') {
        this.deps.analytics.log('collect', { building: e.buildingType, resource: e.resource, amount: e.amount });
      } else if (e.kind === 'raid_end') {
        const r = e.record.result;
        this.deps.analytics.log('raid_end', { kind: e.record.kind, stars: r.stars, destruction: r.destruction, loot: r.loot, used: r.used, ticks: r.ticks, endReason: r.endReason });
      }
    }
    this.emit([]);
    void this.save();
    return result;
  }

  /** Finish any timers that have ended. Call this a few times a second. */
  tick(): FinishedUpgrade[] {
    const now = this.now();
    const trainingDone = this.state.training.length > 0 && this.state.training[0].endsAt <= now;
    if (!trainingDone && !this.state.buildings.some((b) => b.upgrade && b.upgrade.endsAt <= now)) return [];
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
