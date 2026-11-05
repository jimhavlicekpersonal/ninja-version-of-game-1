/**
 * Report section 5 step 2 (docs/audit/STATE_OF_THE_GAME.md): what a real
 * deployment needs. A9 graceful shutdown, A10 outbound timeouts, A21 one
 * instance per periodic job, and /readyz while draining.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { leaseFor, runLeased } from '../../../server/jobs';
import { timedFetch } from '../../../server/outbound';
import { MemoryRepo } from '../../../server/repo';
import { gracefulShutdown } from '../../../server/shutdown';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { repoFactories } from './pg';

describe('A10: outbound calls have a deadline, body included', () => {
  const never = () => new Promise<never>(() => undefined);
  it('gives up on a server that never answers', async () => {
    const f = timedFetch((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))), 30);
    await expect(f('https://androidpublisher.googleapis.com/x')).rejects.toThrow(/androidpublisher.googleapis.com within 30 ms/);
  });

  it('gives up on a body that stalls after the headers', async () => {
    const stalled = new Response(new ReadableStream({ pull: never }), { status: 200 });
    const f = timedFetch(async (_url, init) => {
      init?.signal?.addEventListener('abort', () => void stalled.body?.cancel().catch(() => undefined));
      return { status: 200, statusText: 'OK', headers: new Headers(), arrayBuffer: () => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))) } as unknown as Response;
    }, 30);
    await expect(f('https://fcm.googleapis.com/v1')).rejects.toThrow(/within 30 ms/);
  });

  it('passes answers through, keeps the caller signal, and handles bodiless statuses', async () => {
    const f = timedFetch(async () => new Response(JSON.stringify({ ok: 1 }), { status: 201, headers: { 'content-type': 'application/json' } }), 1000);
    const r = await f('https://example.test/');
    expect([r.status, r.ok, await r.json()]).toEqual([201, true, { ok: 1 }]);
    expect((await timedFetch(async () => new Response(null, { status: 204 }), 1000)('https://example.test/')).status).toBe(204);
    const caller = new AbortController();
    const slow = timedFetch((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('caller gave up')))), 10_000);
    const p = slow('https://example.test/', { signal: caller.signal });
    caller.abort(new Error('caller gave up'));
    await expect(p).rejects.toThrow(/caller gave up/);
  });
});

describe('A9: graceful shutdown', () => {
  const run = (steps: { name: string; run: () => Promise<unknown> }[], opts: { deadlineMs?: number } = {}) => {
    const events: string[] = [];
    let code: number | null = null;
    const handler = gracefulShutdown({
      drainMs: 0,
      deadlineMs: opts.deadlineMs ?? 1000,
      setDraining: () => void events.push('draining'),
      steps: steps.map((s) => ({ name: s.name, run: async () => (events.push(s.name), s.run()) })),
      log: () => undefined,
      exit: (c) => void (code ??= c),
      wait: async () => void events.push('waited'),
    });
    return { events, handler, code: () => code };
  };

  it('stops being ready first, waits, then closes HTTP before the stores, and exits 0', async () => {
    const s = run([
      { name: 'http', run: async () => undefined },
      { name: 'resim', run: async () => undefined },
      { name: 'database', run: async () => undefined },
    ]);
    await s.handler('SIGTERM');
    await s.handler('SIGINT'); // a second signal changes nothing
    expect(s.events).toEqual(['draining', 'waited', 'http', 'resim', 'database']);
    expect(s.code()).toBe(0);
  });

  it('a failing step does not stop the others; the exit code says so', async () => {
    const s = run([
      { name: 'http', run: async () => Promise.reject(new Error('boom')) },
      { name: 'database', run: async () => undefined },
    ]);
    await s.handler('SIGTERM');
    expect(s.events).toEqual(['draining', 'waited', 'http', 'database']);
    expect(s.code()).toBe(1);
  });

  it('exits 1 at the deadline when a step hangs', async () => {
    const s = run([{ name: 'http', run: () => new Promise(() => undefined) }], { deadlineMs: 20 });
    void s.handler('SIGTERM');
    await new Promise((r) => setTimeout(r, 60));
    expect(s.code()).toBe(1);
  });

  it('/readyz answers 503 while the instance drains', async () => {
    let draining = false;
    const app = buildServer({ repo: new MemoryRepo(), data, readiness: { draining: async () => { if (draining) throw new Error('shutting down'); } } });
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    draining = true;
    const r = await app.inject({ method: 'GET', url: '/readyz' });
    expect(r.statusCode).toBe(503);
    expect(r.json().checks.draining).toMatch(/shutting down/);
    await app.close();
  });
});

describe('A21: a periodic job runs on one instance at a time', () => {
  it('only the lease holder runs it; another instance takes over when the lease lapses', async () => {
    const repo = new MemoryRepo();
    const ran: string[] = [];
    const every = 5 * 60_000;
    const tick = (holder: string, now: number) => runLeased(repo, holder, now, 'gang-war-reminders', every, async () => void ran.push(`${holder}@${now}`));
    expect(await tick('a', 0)).toBe(true);
    expect(await tick('b', 60_000)).toBe(false); // b's tick lands while a holds it
    expect(await tick('a', every)).toBe(true); // a renews on its own next run
    expect(await tick('b', every + 60_000)).toBe(false);
    // a stops: its lease lapses and b takes over.
    expect(await tick('b', every + leaseFor(every) + 1)).toBe(true);
    expect(ran).toEqual(['a@0', `a@${every}`, `b@${every + leaseFor(every) + 1}`]);
  });

  it('the lease is shorter than the interval, so the holder renews it every run', () => {
    for (const every of [5 * 60_000, 3_600_000]) {
      expect(leaseFor(every)).toBeLessThan(every);
      expect(leaseFor(every)).toBeGreaterThanOrEqual(every * 0.8);
    }
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`A21: job leases on ${label} storage`, () => {
    it('one holder at a time, renewable by the holder, free once it lapses', async () => {
      const repo = await makeRepo();
      expect(await repo.claimJob('retention', 'a', 1_000, 500)).toBe(true);
      expect(await repo.claimJob('retention', 'b', 1_200, 500)).toBe(false);
      expect(await repo.claimJob('retention', 'a', 1_300, 500)).toBe(true);
      expect(await repo.claimJob('voided-purchases', 'b', 1_300, 500)).toBe(true); // another job
      expect(await repo.claimJob('retention', 'b', 1_799, 500)).toBe(false);
      expect(await repo.claimJob('retention', 'b', 1_800, 500)).toBe(true);
      expect(await repo.claimJob('retention', 'a', 1_900, 500)).toBe(false);
    });
  });
}
