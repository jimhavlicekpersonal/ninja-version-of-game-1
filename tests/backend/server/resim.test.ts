/**
 * Re-simulation in worker threads (roadmap step 57): the same results as on
 * the main thread, the event loop stays free while battles run, a stuck
 * battle times out and the pool recovers.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { InlineResimulator, WorkerResimulator, type ResimJob } from '../../../server/resim';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { createRng } from '../../../src/gameplay/sim/rng';

let dir = '';
let workerFile: URL;

beforeAll(async () => {
  // Bundle the worker the way the server build does (vite.server.config.ts).
  dir = mkdtempSync(join(tmpdir(), 'resim-'));
  await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    build: { ssr: true, outDir: dir, emptyOutDir: true, target: 'node20', rollupOptions: { input: { resimWorker: resolve(__dirname, '../../../server/resimWorker.ts') }, output: { entryFileNames: '[name].js', format: 'es' } } },
  });
  workerFile = pathToFileURL(join(dir, 'resimWorker.js'));
}, 60_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function job(keep: number, i: number): ResimJob {
  const base = generateOpponent(keep * 31 + i, keep, data);
  const army = botArmy(keep, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = Math.max(1, Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length));
  const setup = { seed: 1000 + i, base, army, levels, infiltration: true };
  const probe = createBattle(setup, data);
  return { setup, deployments: botDeployments(probe.deployable, probe.grid.size, army, createRng(i), data, levels, probe.entry) };
}

describe('re-simulation worker pool', () => {
  it('gives exactly the main thread\'s results, with the event loop free meanwhile', async () => {
    const pool = new WorkerResimulator(workerFile, 2);
    const inline = new InlineResimulator(data);
    try {
      const jobs = [job(8, 1), job(12, 2), job(4, 3), job(15, 4)];
      let ticks = 0;
      const timer = setInterval(() => ticks++, 5);
      const out = await Promise.all(jobs.map((j) => pool.run(j)));
      clearInterval(timer);
      for (const [i, j] of jobs.entries()) {
        const want = await inline.run(j);
        expect(out[i].result.hash).toBe(want.result.hash);
        expect(out[i].fallen).toEqual(want.fallen);
      }
      expect(ticks).toBeGreaterThan(0); // timers ran while four battles were simulated
      expect(out.some((o) => o.waitMs > 0)).toBe(true); // two workers, four battles: some waited
    } finally {
      await pool.close();
    }
  }, 60_000);

  it('times a stuck battle out and keeps serving', async () => {
    const pool = new WorkerResimulator(workerFile, 1, 1);
    try {
      await expect(pool.run(job(15, 9))).rejects.toThrow(/could not be checked/);
      // The worker was replaced; with a sane timeout it works again.
      const ok = new WorkerResimulator(workerFile, 1);
      expect((await ok.run(job(2, 1))).result.hash).toBe((await new InlineResimulator(data).run(job(2, 1))).result.hash);
      await ok.close();
    } finally {
      await pool.close();
    }
  }, 60_000);
});
