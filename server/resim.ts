/**
 * Battle re-simulation off the event loop (roadmap step 57). A late-Keep
 * battle takes up to ~0.45 s of CPU (step 18); run on the request's thread it
 * stalls every other request on that instance (the step 46 load test: one
 * instance held ~3 battles/s with match p95 near 40 s). `WorkerResimulator`
 * runs battles in a pool of worker threads (dist-server/resimWorker.js), one
 * battle per worker at a time, queued in order; `InlineResimulator` runs them
 * on the calling thread (tests, custom game data, RESIM_WORKERS=0).
 */
import { Worker } from 'node:worker_threads';
import type { BattleResult, BattleSetup, Deployment } from '../src/gameplay/sim/battle/types';
import type { Cost, GameData } from '../src/gameplay/sim/types';
import { ruleSet } from './rules';

export interface ResimJob {
  setup: BattleSetup;
  deployments: Deployment[];
  endTick?: number;
  /** The battle rules to run it with (the ticket's; roadmap step 73). Absent: the live rules. */
  rules?: number;
}

export interface ResimOutput {
  result: BattleResult;
  /** Buildings destroyed, with the loot they held (the defender's losses). */
  fallen: { id: string; loot: Cost }[];
  /** HP each building lost, counting any start damage: the next relay strike's `startDamage`. */
  damage: Record<string, number>;
  /** CPU time of the battle itself. */
  ms: number;
  /** Time spent waiting for a free worker. */
  waitMs: number;
}

export interface Resimulator {
  readonly threads: number;
  run(job: ResimJob): Promise<ResimOutput>;
  close(): Promise<void>;
}

/** One battle, exactly as the game (of the job's rules version) runs it. `data`: the live rules' data. */
export function resimOnce(job: ResimJob, data: GameData): Omit<ResimOutput, 'waitMs'> {
  const set = ruleSet(job.rules, data);
  if (!set) throw new Error(`Battle rules ${job.rules} are not kept on this server.`);
  const t0 = performance.now();
  const out = set.resim(job);
  return { ...out, ms: performance.now() - t0 };
}

export class InlineResimulator implements Resimulator {
  readonly threads = 0;
  constructor(private readonly data: GameData) {}
  async run(job: ResimJob): Promise<ResimOutput> {
    return { ...resimOnce(job, this.data), waitMs: 0 };
  }
  async close(): Promise<void> {}
}

interface Pending {
  job: ResimJob;
  queuedAt: number;
  resolve: (o: ResimOutput) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: Worker;
  busy: Pending | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/** A pool of worker threads running `resimWorker` (always the built-in game data). */
export class WorkerResimulator implements Resimulator {
  private readonly slots: Slot[] = [];
  private readonly queue: Pending[] = [];
  private closed = false;

  constructor(
    private readonly file: URL | string,
    readonly threads: number,
    private readonly timeoutMs = 15_000,
  ) {
    for (let i = 0; i < threads; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.file), busy: null, timer: null };
    slot.worker.unref();
    slot.worker.on('message', (m: { out?: Omit<ResimOutput, 'waitMs'>; error?: string }) => {
      const p = this.finish(slot);
      if (!p) return;
      if (m.error !== undefined) p.reject(new Error(m.error));
      else p.resolve({ ...m.out!, waitMs: 0 });
      this.pump();
    });
    const replace = (why: string) => {
      const p = this.finish(slot);
      p?.reject(new Error(`The battle could not be checked (${why}). Try again.`));
      if (this.closed) return;
      const i = this.slots.indexOf(slot);
      if (i >= 0) this.slots[i] = this.spawn();
      this.pump();
    };
    slot.worker.on('error', (e) => replace(e.message));
    slot.worker.on('exit', (code) => {
      if (code !== 0 || slot.busy) replace(`worker exited with ${code}`);
    });
    return slot;
  }

  private finish(slot: Slot): Pending | null {
    const p = slot.busy;
    slot.busy = null;
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    return p;
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.busy || !this.queue.length) continue;
      const p = this.queue.shift()!;
      const waited = performance.now() - p.queuedAt;
      slot.busy = { ...p, resolve: (o) => p.resolve({ ...o, waitMs: waited }) };
      slot.timer = setTimeout(() => void slot.worker.terminate(), this.timeoutMs);
      slot.worker.postMessage(p.job);
    }
  }

  run(job: ResimJob): Promise<ResimOutput> {
    if (this.closed) return Promise.reject(new Error('The battle checker is shutting down.'));
    return new Promise((resolve, reject) => {
      this.queue.push({ job, queuedAt: performance.now(), resolve, reject });
      this.pump();
    });
  }

  /** Battles waiting for a worker (for the readiness check and metrics). */
  get waiting(): number {
    return this.queue.length;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const p of this.queue.splice(0)) p.reject(new Error('The battle checker is shutting down.'));
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }
}
