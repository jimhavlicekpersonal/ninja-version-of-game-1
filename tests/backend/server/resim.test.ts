/**
 * Re-simulation off the main thread (roadmap step 57): the pool's queueing,
 * limits and recovery (with stand-in workers), and real worker threads built
 * from server/resim/worker.ts giving exactly the in-place results while the
 * main thread stays free.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { InlineResimulator, ResimBusyError, simulate, WorkerResimulator, type ResimJob, type ResimReply, type WorkerLike } from '../../../server/resim/resim';
import { liveEngine } from '../../../server/rules/registry';
import { replayVillage, type VillageReplayJob } from '../../../server/core/villageReplay';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import { serialize } from '../../../src/gameplay/sim/save';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { createRng } from '../../../src/gameplay/sim/rng';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, rush } from './harness';

const engine = liveEngine(data);

/** A realistic late-Keep battle (the expensive kind). */
function battle(keep: number, i: number): { setup: BattleSetup; deployments: Deployment[] } {
  const setup: BattleSetup = { seed: (keep * 104729 + i) >>> 0, base: generateOpponent(keep * 7919 + i, keep, data), army: botArmy(keep, 1, data), infiltration: true };
  const probe = createBattle(setup, data);
  return { setup, deployments: botDeployments(probe.deployable, probe.grid.size, setup.army, createRng(i + 1), data, {}, probe.entry) };
}

/** A stand-in worker on this thread: answers after `delayMs`, or never (`hang`), or dies (`crash`). */
class FakeWorker implements WorkerLike {
  static made = 0;
  private handlers: Record<string, ((x: never) => void)[]> = {};
  terminated = false;
  constructor(private readonly mode: { delayMs?: number; hang?: (job: ResimJob) => boolean; crash?: (job: ResimJob) => boolean; wrongEngine?: boolean } = {}) {
    FakeWorker.made++;
  }
  on(event: string, fn: (x: never) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }
  private emit(event: string, x: unknown) {
    for (const fn of this.handlers[event] ?? []) fn(x as never);
  }
  postMessage(job: ResimJob): void {
    if (this.mode.hang?.(job)) return;
    if (this.mode.crash?.(job)) {
      setTimeout(() => this.emit('error', new Error('boom')), 1);
      return;
    }
    setTimeout(() => {
      if (this.terminated) return;
      const out = simulate(engine, job.setup, job.deployments, job.endTick);
      const reply: ResimReply = { id: job.id, ok: true, ...out, rules: engine.rules, dataVersion: this.mode.wrongEngine ? 'other' : engine.dataVersion };
      this.emit('message', reply);
    }, this.mode.delayMs ?? 1);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('the re-simulation pool (stand-in workers)', () => {
  const small = () => ({ setup: { seed: 7, base: baseAt(2), army: rush(10).army, infiltration: true } as BattleSetup, deployments: rush(10).deployments });

  it('gives exactly the in-place result, one battle per worker, the rest in a queue', async () => {
    const pool = new WorkerResimulator({ size: 2, spawn: () => new FakeWorker({ delayMs: 5 }) });
    const jobs = Array.from({ length: 6 }, (_, i) => ({ ...small(), setup: { ...small().setup, seed: i + 1 } }));
    const runs = jobs.map((j) => pool.run(engine, j.setup, j.deployments, undefined));
    expect(pool.queued).toBe(4);
    const outs = await Promise.all(runs);
    for (let i = 0; i < jobs.length; i++) expect(outs[i].result.hash).toBe(simulate(engine, jobs[i].setup, jobs[i].deployments, undefined).result.hash);
    expect(outs.some((o) => o.waitMs > 0)).toBe(true);
    await pool.close();
  });

  it('refuses at once when the queue is full (the game retries)', async () => {
    const pool = new WorkerResimulator({ size: 1, maxQueue: 1, spawn: () => new FakeWorker({ delayMs: 20 }) });
    const { setup, deployments } = small();
    const a = pool.run(engine, setup, deployments, undefined); // running
    const b = pool.run(engine, setup, deployments, undefined); // waiting
    await expect(pool.run(engine, setup, deployments, undefined)).rejects.toBeInstanceOf(ResimBusyError);
    await Promise.all([a, b]);
    await pool.close();
  });

  it('replaces a stuck or crashed worker, fails only that battle, and keeps going', async () => {
    FakeWorker.made = 0;
    let first = true;
    const pool = new WorkerResimulator({
      size: 1,
      timeoutMs: 30,
      spawn: () =>
        new FakeWorker({
          hang: (j) => j.setup.seed === 1 && first && !(first = false),
          crash: (j) => j.setup.seed === 2,
        }),
    });
    const { setup, deployments } = small();
    await expect(pool.run(engine, { ...setup, seed: 1 }, deployments, undefined)).rejects.toBeInstanceOf(ResimBusyError);
    await expect(pool.run(engine, { ...setup, seed: 2 }, deployments, undefined)).rejects.toBeInstanceOf(ResimBusyError);
    const ok = await pool.run(engine, { ...setup, seed: 3 }, deployments, undefined);
    expect(ok.result.hash).toBe(simulate(engine, { ...setup, seed: 3 }, deployments, undefined).result.hash);
    expect(FakeWorker.made).toBe(3);
    await pool.close();
  });

  it('runs in place when the worker used another engine than the one asked for', async () => {
    const pool = new WorkerResimulator({ size: 1, spawn: () => new FakeWorker({ wrongEngine: true }) });
    const { setup, deployments } = small();
    expect((await pool.run(engine, setup, deployments, undefined)).result.hash).toBe(simulate(engine, setup, deployments, undefined).result.hash);
    await pool.close();
  });
});

describe('real worker threads', () => {
  let workerUrl: URL;

  beforeAll(async () => {
    // Bundle the worker exactly as the server build does.
    const outDir = mkdtempSync(join(tmpdir(), 'tk-resim-'));
    await build({
      configFile: false,
      logLevel: 'error',
      publicDir: false,
      build: { ssr: true, outDir, emptyOutDir: true, target: 'node20', rollupOptions: { input: { resimWorker: 'server/resim/worker.ts' }, output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', format: 'es' } } },
    });
    workerUrl = pathToFileURL(join(outDir, 'resimWorker.js'));
  }, 60_000);

  const pools: WorkerResimulator[] = [];
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.close()));
  });
  const realPool = (size: number) => {
    const p = new WorkerResimulator({ size, spawn: () => new Worker(workerUrl, { workerData: { data } }) as unknown as WorkerLike });
    pools.push(p);
    return p;
  };

  it('give the same results as the main thread, and leave it free while they work', async () => {
    const pool = realPool(2);
    const battles = [battle(8, 1), battle(12, 2), battle(15, 3), battle(4, 4)];
    // Ticks of the main thread's event loop while the workers run: a blocked loop would show long gaps.
    let maxGap = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 5);
    const outs = await Promise.all(battles.map((b) => pool.run(engine, b.setup, b.deployments, undefined)));
    clearInterval(ticker);
    for (let i = 0; i < battles.length; i++) {
      const here = simulate(engine, battles[i].setup, battles[i].deployments, undefined);
      expect(outs[i].result).toEqual(here.result);
      expect(outs[i].fallen).toEqual(here.fallen);
    }
    expect(maxGap).toBeLessThan(150);
  }, 60_000);

  it('settle a PvP attack over HTTP exactly as the in-place path does', async () => {
    const pool = realPool(1);
    const settle = async (resim: WorkerResimulator | InlineResimulator) => {
      let t = Date.UTC(2026, 2, 1);
      const app = buildServer({ repo: new MemoryRepo(), data, now: () => t, random: () => 0.5, shared: { resim } });
      const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown) => {
        const r = await app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
        return r.body ? r.json() : null;
      };
      const def = await call('POST', Routes.players, undefined, { name: 'Defender' });
      await call('PUT', Routes.base, def.token, { base: baseAt(3, 3, 500) });
      t += 100 * 3_600_000;
      const atk = await call('POST', Routes.players, undefined, { name: 'Attacker' });
      await call('PUT', Routes.base, atk.token, { base: baseAt(3, 5) });
      const m = await call('GET', Routes.match, atk.token);
      const { seed } = await call('POST', Routes.attackStart, atk.token, { ticket: m.ticket });
      const r = await call('POST', Routes.attacks, atk.token, { ticket: m.ticket, seed, ...rush(20) });
      return { result: r.result, base: m.base, seed };
    };
    // The server picks a fresh seed per ticket, so compare with the same battle run here.
    for (const resim of [pool, new InlineResimulator()]) {
      const got = await settle(resim);
      const { army, deployments } = rush(20);
      expect(got.result).toEqual(simulate(engine, { seed: got.seed, base: got.base, army, infiltration: true }, deployments, undefined).result);
    }
  }, 60_000);

  it('replay a village command batch exactly as the main thread does (backend A3)', async () => {
    const pool = realPool(1);
    const t = Date.UTC(2026, 10, 13);
    const record = { at: t, opponentName: 'x', setup: { seed: 1, base: baseAt(1), army: { hedgehog_roller: 999 } }, deployments: [] };
    const job: VillageReplayJob = {
      file: serialize(createNewVillage(t, data), t),
      at: t,
      now: t + 60_000,
      earliest: t - 3_600_000,
      skewMs: 120_000,
      steps: [
        { seq: 1, clientAt: t + 1000, command: { type: 'abandonBattle', record } as never, error: null },
        { seq: 2, clientAt: t + 2000, command: { type: 'collect', id: 'nothing' } as never, error: null },
        { seq: 3, clientAt: t + 3000, command: { type: 'abandonBattle', record } as never, error: 'TOO_MANY_BATTLES' },
      ],
    };
    const there = await pool.replayVillage(job, data);
    const here = replayVillage(job, data);
    expect({ ...there, ms: 0 }).toEqual({ ...here, ms: 0 });
  }, 60_000);
});
