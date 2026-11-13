/**
 * Backend batch 2026-11-13, A3: command batches with battle commands are replayed off the request
 * thread (the re-simulation pool) before the village row is locked, and written only if the village did
 * not change meanwhile. A32: a battle that runs past the worker timeout counts against its ticket.
 */
import { describe, expect, it } from 'vitest';
import { burnAfterFailures, MAX_TICKET_FAILURES, ResimTimedOut } from '../../../server/core/pvp';
import { replayVillage, type VillageReplayJob, type VillageReplayOutcome } from '../../../server/core/villageReplay';
import { MemoryRepo, type Ticket } from '../../../server/repo';
import { InlineResimulator, ResimTimeoutError, WorkerResimulator, type ResimReply, type VillageJob, type WorkerLike } from '../../../server/resim/resim';
import type { GameData } from '../../../src/gameplay/sim/types';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import { serialize } from '../../../src/gameplay/sim/save';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, world } from './harness';

const bogus = (t: number) => ({ at: t, opponentName: 'x', setup: { seed: 1, base: baseAt(1), army: { hedgehog_roller: 999 } }, deployments: [] });

/** The in-place replay, recording whether a database transaction was open while it ran. */
class Watching extends InlineResimulator {
  calls = 0;
  duringTx = 0;
  before?: () => Promise<void>;
  constructor(private readonly repo: MemoryRepo) {
    super();
  }
  override async replayVillage(job: VillageReplayJob, d: GameData): Promise<VillageReplayOutcome> {
    this.calls++;
    if ((this.repo as unknown as { inTx?: number }).inTx) this.duringTx++;
    const hook = this.before;
    this.before = undefined;
    await hook?.();
    return replayVillage(job, d);
  }
}

function watchTransactions(repo: MemoryRepo) {
  const tx = repo.transaction.bind(repo);
  const r = repo as unknown as { inTx?: number };
  repo.transaction = async (fn) => {
    r.inTx = (r.inTx ?? 0) + 1;
    try {
      return await tx(fn);
    } finally {
      r.inTx! -= 1;
    }
  };
}

describe('A3: battle commands replay before the row lock', () => {
  it('runs a batch with battle commands in the pool, outside any transaction, with the same answer', async () => {
    const repo = new MemoryRepo();
    watchTransactions(repo);
    const resim = new Watching(repo);
    const w = world({ repo, shared: { resim } });
    const ann = await w.player('Ann');
    await ann.startVillage();
    const r = await ann.sendCommands({ device: 'device-replay1', stateHash: '', commands: [1, 2].map((seq) => ({ seq, t: w.now(), command: { type: 'abandonBattle', record: bogus(w.now()) } as never })) });
    expect(r.results.map((x) => x.ok)).toEqual([true, true]);
    expect(resim.calls).toBe(1);
    expect(resim.duringTx).toBe(0);
    // A batch without battles stays in place (no extra read, no thread hop).
    await ann.sendCommands({ device: 'device-replay1', stateHash: '', commands: [{ seq: 3, t: w.now(), command: { type: 'collect', id: 'none' } as never }] });
    expect(resim.calls).toBe(1);

    // The same batch on a server without the pool gives the same village and the same answer.
    const plain = world();
    const ben = await plain.player('Ann');
    await ben.startVillage();
    const r2 = await ben.sendCommands({ device: 'device-replay1', stateHash: '', commands: [1, 2].map((seq) => ({ seq, t: plain.now(), command: { type: 'abandonBattle', record: bogus(plain.now()) } as never })) });
    expect(r2.stateHash).toBe(r.stateHash);
    expect(r2.results).toEqual(r.results);
  });

  it('replays again when the village changed while the battle was being checked', async () => {
    const repo = new MemoryRepo();
    const resim = new Watching(repo);
    const w = world({ repo, shared: { resim } });
    const ann = await w.player('Ann');
    await ann.startVillage();
    // Another device writes to the village while the first replay runs.
    resim.before = async () => {
      await ann.sendCommands({ device: 'device-other1', stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'collect', id: 'none' } as never }] });
    };
    const before = (await w.repo.getVillage(ann.id))!.revision;
    const r = await ann.sendCommands({ device: 'device-replay1', stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'abandonBattle', record: bogus(w.now()) } as never }] });
    expect(r.results).toEqual([{ seq: 1, ok: true }]);
    expect(resim.calls).toBe(2);
    const row = (await w.repo.getVillage(ann.id))!;
    expect(row.revision).toBe(before + 2);
    expect(row.deviceSeqs).toMatchObject({ 'device-other1': 1, 'device-replay1': 1 });
    // The battle budget was spent once for that command, not once per replay.
    const again = await ann.sendCommands({ device: 'device-replay1', stateHash: '', commands: [2, 3, 4, 5, 6].map((seq) => ({ seq, t: w.now(), command: { type: 'abandonBattle', record: bogus(w.now()) } as never })) });
    expect(again.results.filter((x) => x.error === 'TOO_MANY_BATTLES')).toHaveLength(2); // 3 per batch
  });
});

/** A stand-in worker that answers village jobs on this thread, optionally with other data. */
class VillageWorker implements WorkerLike {
  private handlers: Record<string, ((x: never) => void)[]> = {};
  constructor(private readonly mode: { otherData?: boolean; hang?: boolean } = {}) {}
  on(event: string, fn: (x: never) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }
  postMessage(job: VillageJob): void {
    if (this.mode.hang) return;
    setTimeout(() => {
      const reply: ResimReply = { id: job.id, ok: true, village: { ...replayVillage(job.village, data), stateHash: this.mode.otherData ? 'from-other-data' : replayVillage(job.village, data).stateHash }, dataVersion: this.mode.otherData ? 'other' : job.dataVersion };
      for (const fn of this.handlers.message ?? []) fn(reply as never);
    }, 1);
  }
  terminate(): void {}
}

describe('the pool runs village replays', () => {
  const t = Date.UTC(2026, 10, 13);
  const job = (): VillageReplayJob => ({ file: serialize(createNewVillage(t, data), t), at: t, now: t, earliest: t - 3_600_000, skewMs: 60_000, steps: [{ seq: 1, clientAt: t, command: { type: 'abandonBattle', record: bogus(t) } as never, error: null }] });

  it('answers with the worker’s replay, or replays in place when the worker has other data', async () => {
    const here = replayVillage(job(), data);
    const pool = new WorkerResimulator({ size: 1, spawn: () => new VillageWorker() });
    expect((await pool.replayVillage(job(), data)).stateHash).toBe(here.stateHash);
    await pool.close();
    const other = new WorkerResimulator({ size: 1, spawn: () => new VillageWorker({ otherData: true }) });
    expect((await other.replayVillage(job(), data)).stateHash).toBe(here.stateHash);
    await other.close();
  });

  it('A32: a job past the timeout fails with ResimTimeoutError (a 503 that counts against the ticket)', async () => {
    const pool = new WorkerResimulator({ size: 1, timeoutMs: 20, spawn: () => new VillageWorker({ hang: true }) });
    await expect(pool.replayVillage(job(), data)).rejects.toBeInstanceOf(ResimTimeoutError);
    await pool.close();
  });
});

describe('A32: re-simulation timeouts count against the ticket', () => {
  it('burns a ticket after MAX_TICKET_FAILURES timeouts, but not after a full queue', async () => {
    const w = world();
    const ann = await w.player('Ann');
    const ticket: Ticket = { id: 't-timeout', kind: 'pvp', attackerId: ann.id, defenderId: null, defenderName: 'Outpost', base: baseAt(1), defenderTrophies: 0, createdAt: w.now(), expiresAt: w.now() + 60_000, used: false };
    await w.repo.createTicket(ticket);
    const ctx = w.core.ctx;
    for (let i = 0; i < MAX_TICKET_FAILURES + 2; i++) await burnAfterFailures(ctx, ticket, new (await import('../../../server/core/context')).ApiError(503, 'busy', 'queue full'));
    expect((await w.repo.getTicket(ticket.id))!.used).toBe(false);
    for (let i = 0; i < MAX_TICKET_FAILURES; i++) await burnAfterFailures(ctx, ticket, new ResimTimedOut('too long'));
    expect((await w.repo.getTicket(ticket.id))!.used).toBe(true);
  });
});
