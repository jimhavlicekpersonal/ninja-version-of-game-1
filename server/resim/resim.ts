/**
 * Battle re-simulation off the main thread (roadmap step 57).
 *
 * The server re-runs every reported battle. At late Keeps one run takes up to
 * ~0.45 s of CPU (step 18), and on the main thread that stalls every other
 * request on the instance. `WorkerResimulator` runs battles in a pool of
 * worker threads with the same code and the same rule engines
 * (`server/rules/`), so the API stays responsive and a multi-core host checks
 * several battles at once. `InlineResimulator` runs them in place (tests,
 * tools, and `RESIM_WORKERS=0`).
 *
 * - One battle per worker at a time; the rest wait in a queue. A full queue
 *   answers `503 busy` at once (the game retries server errors), so a burst
 *   cannot pile up minutes of work.
 * - A battle that runs past `timeoutMs` (a bug, never a real battle) stops
 *   its worker; a new one takes its place and the report gets `503 busy`.
 * - A worker that crashes is replaced the same way.
 * - The worker says which engine it used; if that is not the one asked for
 *   (only possible with an engine the worker does not have, such as a test
 *   double), the battle is run in place instead.
 */
import type { BattleResult, BattleSetup, Deployment } from '../../src/gameplay/sim/battle/types';
import type { RulesEngine } from '../rules/registry';

export interface FallenBuilding {
  id: string;
  loot: Record<string, number>;
}

export interface ResimOutcome {
  result: BattleResult;
  /** Buildings destroyed in the battle, with the loot each held (the defender's losses). */
  fallen: FallenBuilding[];
  /** CPU time of the simulation itself. */
  ms: number;
  /** Time spent waiting for a free worker. */
  waitMs: number;
}

export interface Resimulator {
  run(engine: RulesEngine, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined): Promise<ResimOutcome>;
  /** Battles waiting for a worker right now (a gauge). */
  readonly queued: number;
  close(): Promise<void>;
}

/** The battle in place, on the calling thread. */
export function simulate(engine: RulesEngine, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined): { result: BattleResult; fallen: FallenBuilding[]; ms: number } {
  const t0 = performance.now();
  const { sim, result } = engine.runBattle(setup, deployments, engine.data, endTick);
  const fallen = sim.buildings.filter((b) => b.destroyed).map((b) => ({ id: b.id, loot: { ...(b.loot as Record<string, number>) } }));
  return { result, fallen, ms: performance.now() - t0 };
}

export class InlineResimulator implements Resimulator {
  readonly queued = 0;
  async run(engine: RulesEngine, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined): Promise<ResimOutcome> {
    return { ...simulate(engine, setup, deployments, endTick), waitMs: 0 };
  }
  async close(): Promise<void> {}
}

/** Thrown when the pool cannot take or finish a battle (answered 503 busy; the game retries). */
export class ResimBusyError extends Error {}

/** What a worker thread looks like to the pool (node:worker_threads Worker, or a test double). */
export interface WorkerLike {
  postMessage(msg: unknown): void;
  on(event: 'message', fn: (msg: unknown) => void): void;
  on(event: 'error', fn: (err: Error) => void): void;
  on(event: 'exit', fn: (code: number) => void): void;
  terminate(): Promise<number> | void;
  unref?(): void;
}

export interface ResimJob {
  id: number;
  rules: number;
  dataVersion: string;
  setup: BattleSetup;
  deployments: Deployment[];
  endTick?: number;
}

export type ResimReply = { id: number; ok: true; result: BattleResult; fallen: FallenBuilding[]; ms: number; dataVersion: string; rules: number } | { id: number; ok: false; error: string };

interface Pending {
  job: ResimJob;
  engine: RulesEngine;
  queuedAt: number;
  resolve(o: ResimOutcome): void;
  reject(e: Error): void;
}

interface Slot {
  worker: WorkerLike;
  busy: Pending | null;
  timer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
}

export interface WorkerPoolOptions {
  /** Makes one worker thread. */
  spawn(): WorkerLike;
  size: number;
  /** Most battles waiting at once before new ones are refused. */
  maxQueue?: number;
  /** A battle running longer than this stops its worker. */
  timeoutMs?: number;
  log?: (level: 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void;
}

export class WorkerResimulator implements Resimulator {
  private readonly slots: Slot[] = [];
  private readonly waiting: Pending[] = [];
  private nextId = 1;
  private closed = false;
  private readonly maxQueue: number;
  private readonly timeoutMs: number;

  constructor(private readonly o: WorkerPoolOptions) {
    this.maxQueue = o.maxQueue ?? 200;
    this.timeoutMs = o.timeoutMs ?? 15_000;
    for (let i = 0; i < Math.max(1, o.size); i++) this.slots.push(this.makeSlot());
  }

  get queued(): number {
    return this.waiting.length;
  }

  get size(): number {
    return this.slots.length;
  }

  private makeSlot(): Slot {
    const slot: Slot = { worker: this.o.spawn(), busy: null, timer: null, startedAt: 0 };
    slot.worker.unref?.();
    slot.worker.on('message', (msg) => this.onMessage(slot, msg as ResimReply));
    slot.worker.on('error', (err) => this.replace(slot, `worker error: ${err.message}`));
    slot.worker.on('exit', (code) => {
      if (!this.closed && this.slots.includes(slot)) this.replace(slot, `worker exited (${code})`);
    });
    return slot;
  }

  run(engine: RulesEngine, setup: BattleSetup, deployments: Deployment[], endTick: number | undefined): Promise<ResimOutcome> {
    if (this.closed) return Promise.reject(new ResimBusyError('The server is shutting down.'));
    if (this.waiting.length >= this.maxQueue) return Promise.reject(new ResimBusyError('The server is busy checking battles. Your report will be sent again shortly.'));
    return new Promise<ResimOutcome>((resolve, reject) => {
      const job: ResimJob = { id: this.nextId++, rules: engine.rules, dataVersion: engine.dataVersion, setup, deployments, ...(endTick !== undefined ? { endTick } : {}) };
      this.waiting.push({ job, engine, queuedAt: performance.now(), resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.busy || !this.waiting.length) continue;
      const p = this.waiting.shift()!;
      slot.busy = p;
      slot.startedAt = performance.now();
      slot.timer = setTimeout(() => this.replace(slot, `battle took over ${this.timeoutMs} ms`), this.timeoutMs);
      slot.timer.unref?.();
      slot.worker.postMessage(p.job);
    }
  }

  private onMessage(slot: Slot, msg: ResimReply): void {
    const p = slot.busy;
    if (!p || msg.id !== p.job.id) return;
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.busy = null;
    const waitMs = slot.startedAt - p.queuedAt;
    if (!msg.ok) p.reject(new Error(msg.error));
    else if (msg.dataVersion !== p.engine.dataVersion || msg.rules !== p.engine.rules) {
      // The worker has no such engine (a test double): run it here.
      p.resolve({ ...simulate(p.engine, p.job.setup, p.job.deployments, p.job.endTick), waitMs });
    } else p.resolve({ result: msg.result, fallen: msg.fallen, ms: msg.ms, waitMs });
    this.pump();
  }

  /** Stop a stuck or broken worker, fail its battle, and start a fresh one in its place. */
  private replace(slot: Slot, why: string): void {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    if (slot.timer) clearTimeout(slot.timer);
    const p = slot.busy;
    slot.busy = null;
    this.o.log?.('error', 'resim worker replaced', { why, job: p?.job.id });
    if (p) p.reject(new ResimBusyError('The server could not check this battle right now. It will be sent again shortly.'));
    this.slots.splice(i, 1);
    void Promise.resolve(slot.worker.terminate()).catch(() => undefined);
    if (!this.closed) {
      this.slots.push(this.makeSlot());
      this.pump();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const p of this.waiting.splice(0)) p.reject(new ResimBusyError('The server is shutting down.'));
    await Promise.all(
      this.slots.splice(0).map(async (s) => {
        if (s.timer) clearTimeout(s.timer);
        s.busy?.reject(new ResimBusyError('The server is shutting down.'));
        await Promise.resolve(s.worker.terminate()).catch(() => undefined);
      }),
    );
  }
}
