/**
 * Backend batch 2026-11-13: periodic jobs and the database. Lease checks before commits (A21), dormant
 * account pruning (A23), batched retention deletes (A18), one-statement ledger and log inserts and no
 * needless raid-base writes (A17), matchmaking without `order by random()` (A19), the cached Power
 * Ranking (A20), and migrations outside a transaction (A22). Postgres SQL is checked against a recording
 * stand-in here; TEST_DATABASE_URL runs it for real in the adapter tests.
 */
import { describe, expect, it } from 'vitest';
import { LeaseLost, requireLease, runLeased } from '../../../server/jobs';
import { concurrentIndexName, isNoTransaction, runMigrations, splitStatements, type SqlClient, type SqlPool } from '../../../server/migrate';
import { PgRepo } from '../../../server/pgRepo';
import { MemoryRepo } from '../../../server/repo';
import { DORMANT_BATCH } from '../../../server/core/retention';
import { POWER_BOARD_TTL_MS } from '../../../server/core/pvp';
import { newRating } from '../../../src/gameplay/sim/rating';
import { baseAt, world } from './harness';

const DAY = 24 * 3_600_000;

/** A pg Pool stand-in that records every statement and answers with `rowCount` from `answer`. */
function recordingPool(answer: (sql: string, params: unknown[]) => { rows?: Record<string, unknown>[]; rowCount?: number } = () => ({})) {
  const log: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    log.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    const a = answer(sql, params);
    return { rows: a.rows ?? [], rowCount: a.rowCount ?? a.rows?.length ?? 0 };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }), totalCount: 0, idleCount: 0, waitingCount: 0, end: async () => undefined };
  return { repo: new PgRepo(pool as never), log };
}

describe('A21: a job checks its lease before committing', () => {
  it('stops quietly once another instance has taken the lease', async () => {
    const repo = new MemoryRepo();
    let t = 0;
    const done: number[] = [];
    const ran = await runLeased(repo, 'a', t, 'job', 60_000, async (held) => {
      for (let i = 0; i < 5; i++) {
        if (i === 2) {
          // This run stalls past its lease; another instance takes the job.
          t += 120_000;
          expect(await repo.claimJob('job', 'b', t, 48_000)).toBe(true);
        }
        await requireLease(held);
        done.push(i);
      }
    }, () => t);
    expect(ran).toBe(false);
    expect(done).toEqual([0, 1]);
    await expect(requireLease(async () => false)).rejects.toBeInstanceOf(LeaseLost);
  });

  it('retention stops at the first lease check it fails', async () => {
    const w = world();
    await expect(w.core.prune(async () => false)).rejects.toBeInstanceOf(LeaseLost);
  });
});

describe('A23: dormant anonymous accounts', () => {
  it('deletes only old anonymous accounts nothing else holds, and never with the policy off', async () => {
    const w = world({ shared: { policy: { dormantAccountDays: 365, dormantMaxKeep: 3 } } });
    const [old, linked, bought, staff, keep9, fresh] = await Promise.all(['Old', 'Linked', 'Bought', 'Staff', 'Keeper', 'Fresh'].map((n) => w.player(n)));
    await w.repo.addLink({ provider: 'apple', subject: 's', playerId: linked.id, linkedAt: w.now() });
    await w.repo.addPurchase({ store: 'apple', transactionId: 't1', playerId: bought.id, productId: 'moonstones_1', cents: 199, at: w.now(), environment: 'Production', status: 'credited', refundedAt: null, ref: 't1', heldOnServer: false });
    await w.repo.updatePlayer(staff.id, { staff: true });
    await keep9.startVillage();
    await w.repo.updatePlayer(keep9.id, { hallLevel: 9 });
    w.advance(400 * DAY);
    await fresh.me(); // seen recently
    expect(await w.core.pruneDormant()).toBe(1);
    expect(await w.repo.getPlayer(old.id)).toBeNull();
    for (const p of [linked, bought, staff, keep9, fresh]) expect(await w.repo.getPlayer(p.id)).not.toBeNull();
    expect(DORMANT_BATCH).toBeGreaterThan(0);

    const off = world({ shared: { policy: { dormantAccountDays: 0 } } });
    const ann = await off.player('Ann');
    off.advance(5000 * DAY);
    expect(await off.core.pruneDormant()).toBe(0);
    expect(await off.repo.getPlayer(ann.id)).not.toBeNull();
  });
});

describe('A18: retention deletes in short batches', () => {
  it('repeats a bounded delete until a batch comes back short, never one unbounded statement', async () => {
    let attackBatches = 0;
    const { repo, log } = recordingPool((sql) => (sql.includes('delete from attacks') ? { rowCount: ++attackBatches < 3 ? 5000 : 12 } : { rowCount: 0 }));
    const r = await repo.prune({ recordsBefore: 1, staleBefore: 1, idempotencyBefore: 1, commandsBefore: 1, batchSize: 5000 });
    expect(r.attacks).toBe(10_012);
    const deletes = log.filter((l) => l.sql.startsWith('delete'));
    expect(deletes.every((d) => /ctid = any\(array\(select ctid from .* limit 5000\)\)/.test(d.sql))).toBe(true);
    expect(deletes.filter((d) => d.sql.startsWith('delete from attacks'))).toHaveLength(3);
  });

  it('stops at the deadline and leaves the rest for the next run', async () => {
    const { repo, log } = recordingPool((sql) => (sql.includes('delete from attacks') ? { rowCount: 5000 } : { rowCount: 0 }));
    await repo.prune({ recordsBefore: 1, staleBefore: 1, batchSize: 5000, deadline: Date.now() - 1 });
    expect(log.filter((d) => d.sql.startsWith('delete from attacks'))).toHaveLength(1);
  });
});

describe('A17: fewer writes per command batch', () => {
  it('saves a village with one statement for the ledger and one for the log, however many lines', async () => {
    const { repo, log } = recordingPool((sql) => (sql.includes('update villages') ? { rowCount: 1 } : { rowCount: 0 }));
    const ledger = Array.from({ length: 40 }, (_, i) => ({ playerId: 'p', at: i, resource: 'acorns', delta: 1, balance: i, reason: 'command:collect', ref: String(i) }));
    const commands = Array.from({ length: 20 }, (_, i) => ({ playerId: 'p', seq: i + 1, at: i, clientAt: i, type: 'collect', command: { type: 'collect' }, ok: true, error: null }));
    expect(await repo.saveVillage({ playerId: 'p', file: {}, revision: 2, seq: 20, at: 1, stateHash: 'h', createdAt: 0, updatedAt: 1 }, 1, ledger, commands)).toBe(true);
    expect(log.filter((l) => l.sql.startsWith('insert into ledger'))).toHaveLength(1);
    expect(log.filter((l) => l.sql.startsWith('insert into command_log'))).toHaveLength(1);
  });

  it('does not rewrite the raid base when a batch leaves it unchanged', async () => {
    const w = world();
    const ann = await w.player('Ann');
    await ann.startVillage();
    let baseWrites = 0;
    const update = w.repo.updatePlayer.bind(w.repo);
    w.repo.updatePlayer = async (id, patch) => {
      if (patch.base) baseWrites++;
      return update(id, patch);
    };
    // An applied command that changes nothing a raider can see (the player's age group): the village is
    // saved, the raid base is not written again.
    const r = await ann.sendCommands({ device: 'device-base001', stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } as never }] });
    expect(r.results).toEqual([{ seq: 1, ok: true }]);
    expect((await w.repo.getVillage(ann.id))!.revision).toBeGreaterThan(2);
    expect(baseWrites).toBe(0);
  });
});

describe('A19: matchmaking walks the honor index from a pivot', () => {
  it('asks for the nearest players above and below, without random()', async () => {
    const rows = [1000, 1010, 990, 1200, 800].map((trophies, i) => ({ id: `p${i}`, name: `P${i}`, token_hash: 'x', trophies, hall_level: 3, shield_until: 0, base: null, grove_id: null, created_at: 0, updated_at: 0, last_seen_at: 0, muted_until: 0, banned_until: 0 }));
    const { repo, log } = recordingPool((sql) => (sql.includes('from players p') ? { rows } : {}));
    const found = await repo.findOpponents({ excludeIds: [], minHall: 1, maxHall: 5, minTrophies: 0, maxTrophies: 2000, now: 0, lockedSince: null, limit: 3, pivot: 1002 });
    expect(log[0]!.sql).not.toContain('random()');
    expect(log[0]!.sql).toMatch(/trophies >= \$9 order by p.trophies asc limit \$8\) union all \(select/);
    expect(found.map((p) => p.trophies)).toEqual([1000, 1010, 990]);
  });
});

describe('A20: the Power Ranking is computed once a minute', () => {
  it('reuses the board within the TTL and ranks from the cached values', async () => {
    const w = world();
    const t = w.now();
    const low = await w.player('Low', baseAt(1));
    await w.repo.updatePlayer(low.id, { ratings: { attack: { rating: 1800, rd: 60, battles: 10, at: t }, base: newRating(t, w.data.ranks.rating) } });
    let scans = 0;
    const values = w.repo.powerValues.bind(w.repo);
    w.repo.powerValues = async (...a) => {
      scans++;
      return values(...a);
    };
    expect((await low.powerLeaderboard(10)).me?.rank).toBe(1);
    const high = await w.player('High', baseAt(3));
    await w.repo.updatePlayer(high.id, { ratings: { attack: { rating: 1900, rd: 60, battles: 10, at: t }, base: newRating(t, w.data.ranks.rating) } });
    expect((await low.powerLeaderboard(10)).me?.rank).toBe(1); // cached
    expect(scans).toBe(1);
    w.advance(POWER_BOARD_TTL_MS);
    expect((await low.powerLeaderboard(10)).me?.rank).toBe(2);
    expect(scans).toBe(2);
  });
});

describe('A22: migrations that must run outside a transaction', () => {
  it('reads the header and splits statements on a line-ending semicolon', () => {
    expect(isNoTransaction({ sql: '-- migrate: no-transaction\ncreate index concurrently x on y (z);' })).toBe(true);
    expect(isNoTransaction({ sql: '-- Migration 0002\ncreate table x ();' })).toBe(false);
    expect(splitStatements('-- migrate: no-transaction\n-- why\ncreate index concurrently if not exists a on t (x);\ncreate index concurrently if not exists b on t (y);\n')).toEqual(['create index concurrently if not exists a on t (x)', 'create index concurrently if not exists b on t (y)']);
  });

  it('runs such a file statement by statement without begin/commit, then records it', async () => {
    const seen: string[] = [];
    const committed: Record<string, unknown>[] = [];
    const client: SqlClient = {
      async query(sql, params = []) {
        const s = sql.trim();
        seen.push(s.split('\n')[0]!);
        if (s.startsWith('select pg_try_advisory_lock')) return { rows: [{ ok: true }] };
        if (s.startsWith('select version')) return { rows: committed };
        if (s.startsWith('insert into schema_migrations')) committed.push({ version: params[0], name: params[1], checksum: params[2] });
        return { rows: [] };
      },
      release() {},
    };
    const pool: SqlPool = { connect: async () => client };
    const sql = '-- migrate: no-transaction\ncreate index concurrently if not exists a on t (x);\ncreate index concurrently if not exists b on t (y);\n';
    const done = await runMigrations(pool, [{ version: '9001', name: '9001_idx', sql, checksum: 'c' }]);
    expect(done).toEqual(['9001_idx']);
    expect(seen).not.toContain('begin');
    expect(seen.filter((s) => s.startsWith('create index concurrently'))).toHaveLength(2);
    expect(committed).toHaveLength(1);
  });

  it('2026-11-14: a rerun drops the INVALID index a failed concurrent build left, then builds it again', async () => {
    // Recording stand-in: index "a" built, "b" failed part way (INVALID); the file is not recorded.
    const seen: string[] = [];
    const committed: Record<string, unknown>[] = [];
    const indexes = new Map<string, 'valid' | 'invalid'>();
    let failB = true;
    const client: SqlClient = {
      async query(sql, params = []) {
        const s = sql.trim();
        seen.push(s.replace(/\s+/g, ' '));
        if (s.startsWith('select pg_try_advisory_lock')) return { rows: [{ ok: true }] };
        if (s.startsWith('select version')) return { rows: committed };
        if (s.startsWith('insert into schema_migrations')) committed.push({ version: params[0], name: params[1], checksum: params[2] });
        if (s.includes('from pg_index')) return { rows: indexes.get(String(params[0])) === 'invalid' ? [{ '?column?': 1 }] : [] };
        const drop = /^drop index concurrently if exists "(\w+)"/.exec(s);
        if (drop) indexes.delete(drop[1]!);
        const create = /^create index concurrently if not exists (\w+)/.exec(s);
        if (create && !indexes.has(create[1]!)) {
          if (create[1] === 'b' && failB) {
            indexes.set('b', 'invalid');
            throw new Error('could not create unique index (a deadlock, a duplicate)');
          }
          indexes.set(create[1]!, 'valid');
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool: SqlPool = { connect: async () => client };
    const file = { version: '9002', name: '9002_idx', sql: '-- migrate: no-transaction\ncreate index concurrently if not exists a on t (x);\ncreate index concurrently if not exists b on t (y);\n', checksum: 'c' };
    await expect(runMigrations(pool, [file])).rejects.toThrow(/failed part way/);
    expect(indexes.get('b')).toBe('invalid');
    failB = false;
    seen.length = 0;
    expect(await runMigrations(pool, [file])).toEqual(['9002_idx']);
    expect(indexes.get('b')).toBe('valid');
    expect(seen).toContain('drop index concurrently if exists "b"');
    expect(seen.filter((s) => s.startsWith('drop index'))).toHaveLength(1); // the valid "a" is left alone
    expect(concurrentIndexName('create unique index concurrently if not exists "Players_X" on p (x)')).toBe('players_x');
    expect(concurrentIndexName('create index x on y (z)')).toBeNull();
  });

  it('2026-11-14: waits for the lock by polling (no snapshot held while another runner builds an index)', async () => {
    let tries = 0;
    const sleeps: number[] = [];
    const client: SqlClient = {
      async query(sql) {
        const s = sql.trim();
        if (s.startsWith('select pg_advisory_lock')) throw new Error('blocking lock used');
        if (s.startsWith('select pg_try_advisory_lock')) return { rows: [{ ok: ++tries >= 3 }] };
        return { rows: [] };
      },
      release() {},
    };
    expect(await runMigrations({ connect: async () => client }, [], Date.now, () => {}, async (ms) => void sleeps.push(ms))).toEqual([]);
    expect(tries).toBe(3);
    expect(sleeps).toHaveLength(2);
  });
});
