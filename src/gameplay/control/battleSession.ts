import { createBattle, deploy, deploymentsByTick, end, result, step, type BattleSim, type SimEvent } from '../sim/battle/battle';
import type { BattleRecord, BattleResult, BattleSetup, Deployment } from '../sim/battle/types';
import { createRng } from '../sim/rng';
import type { GameData } from '../sim/types';

export type BattleMode = 'scout' | 'live' | 'replay';

/**
 * Runs a battle in real time: steps the fixed 10 tps simulation from frame
 * deltas and records deployments with the tick they happened on. No Phaser.
 */
export class BattleSession {
  readonly sim: BattleSim;
  readonly deployments: Deployment[] = [];
  readonly msPerTick: number;
  speed = 1;
  /** Events from every tick since the renderer last drained them. */
  pending: SimEvent[] = [];
  private acc = 0;
  private replayDeps: Map<number, Deployment[]> | null = null;
  private replayEndTick: number | undefined;
  endTick: number | undefined;

  constructor(
    readonly setup: BattleSetup,
    readonly data: GameData,
    public mode: BattleMode,
    replay?: BattleRecord,
  ) {
    this.sim = createBattle(setup, data);
    this.msPerTick = 1000 / data.battle.ticksPerSecond;
    if (replay) {
      this.replayDeps = deploymentsByTick(replay.deployments);
      this.replayEndTick = replay.endTick;
    }
  }

  /**
   * Use the seed the server sent when Attack was pressed (protocol 10, ledger audit A1). Only while
   * scouting: no tick has run, so nothing has drawn from the old seed yet.
   */
  reseed(seed: number): void {
    if (this.mode !== 'scout' || this.sim.tick !== 0) return;
    this.setup.seed = seed >>> 0;
    this.sim.rng = createRng(this.setup.seed);
  }

  /** Begin the live battle (the timer starts). */
  start(): void {
    if (this.mode === 'scout') this.mode = 'live';
  }

  get running(): boolean {
    return this.mode !== 'scout' && !this.sim.ended;
  }

  /** Advance by real elapsed time. Returns how many ticks ran. */
  update(dtMs: number): number {
    if (!this.running) return 0;
    this.acc += Math.min(dtMs, 250) * this.speed;
    let ticks = 0;
    while (this.acc >= this.msPerTick && !this.sim.ended) {
      this.acc -= this.msPerTick;
      if (this.replayDeps) {
        if (this.replayEndTick !== undefined && this.sim.tick >= this.replayEndTick) {
          end(this.sim, 'surrender');
          break;
        }
        step(this.sim, this.replayDeps.get(this.sim.tick));
      } else {
        // (live deployments were applied directly by tryDeploy)
        step(this.sim);
      }
      for (const e of this.sim.events) this.pending.push(e);
      ticks++;
    }
    return ticks;
  }

  /** 0..1 progress into the next tick, for smooth rendering. */
  alpha(): number {
    return this.sim.ended ? 1 : Math.min(1, this.acc / this.msPerTick);
  }

  tryDeploy(troop: string, x: number, y: number): boolean {
    if (this.mode !== 'live' || this.sim.ended) return false;
    const d: Deployment = { tick: this.sim.tick, troop, x: Math.floor(x), y: Math.floor(y) };
    if (!deploy(this.sim, d)) return false;
    this.deployments.push(d);
    return true;
  }

  surrender(): void {
    if (this.sim.ended) return;
    this.endTick = this.sim.tick;
    end(this.sim, 'surrender');
  }

  result(): BattleResult {
    return result(this.sim);
  }

  secondsLeft(): number {
    return Math.max(0, Math.ceil((this.sim.duration - this.sim.tick) / this.data.battle.ticksPerSecond));
  }
}

export function drainEvents(session: BattleSession): SimEvent[] {
  const out = session.pending;
  session.pending = [];
  return out;
}
