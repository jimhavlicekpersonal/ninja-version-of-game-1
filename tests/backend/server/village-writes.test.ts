/**
 * Backend A17 (2026-11-14 code-debt batch): server-held villages written in parts (migration 0038,
 * server/stores/pg/villageParts.ts). Pure split/join checks always run; with TEST_DATABASE_URL the
 * Postgres checks show that an unchanged part is not written again, that both forms read the same village
 * and that switching VILLAGE_PARTS on or off converges, and the measurement prints what a model player's
 * command batches write (row bytes and WAL bytes) in each form:
 *
 *   TEST_DATABASE_URL=postgres://… npx vitest run tests/backend/server/village-writes.test.ts
 *
 * Its WAL numbers are only quiet when nothing else writes to that database at the same time.
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { PgRepo } from '../../../server/pgRepo';
import type { Player, VillageRow } from '../../../server/repo';
import { joinVillageFile, PARTS_KEY, splitVillageFile } from '../../../server/stores/pg/villageParts';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { serialize } from '../../../src/gameplay/sim/save';
import { activeHour, ModelPlayer, normalDays } from '../../../tools/balance/playerModel';
import { freshPgRepo, hasPg } from './pg';

const T = Date.UTC(2026, 10, 14);
const BATCH = 10;

/** Save files after every `BATCH` commands of a model player (a command batch is up to 20 commands or 15 s). */
function modelBatches(days: number): unknown[] {
  const p = new ModelPlayer(data, { raidsPerSession: 2, policy: 'explorer', engaged: true });
  const proto = ModelPlayer.prototype as unknown as { run: (c: unknown) => boolean };
  const run = proto.run;
  const files: unknown[] = [];
  let n = 0;
  proto.run = function (this: ModelPlayer, c) {
    const ok = run.call(this, c);
    if (ok && ++n % BATCH === 0) files.push(structuredClone(serialize(this.state, T + n)));
    return ok;
  };
  try {
    activeHour(p, 60, 2);
    normalDays(p, days);
  } finally {
    proto.run = run;
  }
  return files;
}

const player = (id: string): Player => ({ id, name: id, tokenHash: `h-${id}`, trophies: 0, hallLevel: 1, shieldUntil: 0, base: null, groveId: null, createdAt: T, updatedAt: T, lastSeenAt: T });
const row = (id: string, file: unknown, revision: number): VillageRow => ({ playerId: id, file, revision, seq: revision, at: T, stateHash: `s${revision}`, createdAt: T, updatedAt: T + revision });
const poolOf = (repo: PgRepo) => (repo as unknown as { pool: pg.Pool }).pool;

describe('village parts (pure)', () => {
  it('splits the big, rarely changing keys out and joins them back to the same file', () => {
    const file = modelBatches(1).at(-1) as { village: Record<string, unknown> };
    const split = splitVillageFile(file)!;
    expect(split.rest[PARTS_KEY]).toEqual(['layout', 'progress']);
    expect(split.rest.village).not.toHaveProperty('buildings');
    expect(split.rest.village).toHaveProperty('resources');
    expect(split.parts.find((p) => p.part === 'layout')!.data).toHaveProperty('buildings');
    const parts = Object.fromEntries(split.parts.map((p) => [p.part, p.data]));
    expect(joinVillageFile(split.rest, parts)).toEqual(file);
    // A whole file (written before parts, or with VILLAGE_PARTS off) reads as it is.
    expect(joinVillageFile(file, null)).toBe(file);
    expect(splitVillageFile({ version: 1 })).toBeNull();
  });

  it('refuses a file whose part is missing instead of handing out a village without buildings', () => {
    const split = splitVillageFile(modelBatches(1).at(-1))!;
    expect(() => joinVillageFile(split.rest, { progress: {} })).toThrow(/layout/);
  });
});

describe.skipIf(!hasPg)('village parts on Postgres', () => {
  it('writes an unchanged part no more, and both forms read the same village', async () => {
    const parts = await freshPgRepo();
    const whole = new PgRepo(poolOf(parts), null, { villageParts: false });
    const on = new PgRepo(poolOf(parts), null, { villageParts: true });
    await on.createPlayer(player('a'));
    const files = modelBatches(1);
    const first = files[0] as { village: Record<string, unknown> };
    expect(await on.createVillage(row('a', first, 1))).toBe(true);
    expect((await on.getVillage('a'))!.file).toEqual(first);
    const versions = async () => Object.fromEntries((await poolOf(parts).query(`select part, xmin::text as v from village_parts where player_id = 'a'`)).rows.map((r) => [r.part, r.v]));
    const before = await versions();
    // Only resources change: neither part gets a new row version.
    const richer = structuredClone(first);
    (richer.village.resources as Record<string, number>).gold = 12345;
    expect(await on.saveVillage(row('a', richer, 2), 1, [], [])).toBe(true);
    expect(await versions()).toEqual(before);
    expect((await on.getVillage('a'))!.file).toEqual(richer);
    // A building moves: only the layout is written again.
    const moved = structuredClone(richer);
    (moved.village.buildings as { x: number }[])[0]!.x += 1;
    expect(await on.saveVillage(row('a', moved, 3), 2, [], [])).toBe(true);
    const after = await versions();
    expect(after.layout).not.toBe(before.layout);
    expect(after.progress).toBe(before.progress);
    // The previous form reads the split row, writes it whole and drops the parts; the new form reads that.
    expect((await whole.getVillage('a'))!.file).toEqual(moved);
    expect(await whole.saveVillage(row('a', moved, 4), 3, [], [])).toBe(true);
    expect((await poolOf(parts).query(`select count(*)::int as n from village_parts where player_id = 'a'`)).rows[0].n).toBe(0);
    expect((await poolOf(parts).query(`select file from villages where player_id = 'a'`)).rows[0].file).not.toHaveProperty(PARTS_KEY);
    expect((await on.getVillage('a'))!.file).toEqual(moved);
    // A stale revision still writes nothing, in parts too.
    expect(await on.saveVillage(row('a', first, 9), 1, [], [])).toBe(false);
    expect((await on.getVillage('a'))!.file).toEqual(moved);
    // Inside a transaction (the command-batch path) with a row lock.
    await on.transaction(async (tx) => {
      const v = (await tx.getVillage('a', { forUpdate: true }))!;
      expect(v.file).toEqual(moved);
      expect(await tx.saveVillage(row('a', richer, 5), 4, [], [])).toBe(true);
    });
    expect((await whole.getVillage('a'))!.file).toEqual(richer);
    // Deleting the account (the village) takes its parts along.
    await on.deletePlayer('a', 'a', T + 99);
    expect((await poolOf(parts).query(`select count(*)::int as n from village_parts`)).rows[0].n).toBe(0);
  });

  it('measures what a model player\'s command batches write, whole and in parts', { timeout: 120_000 }, async () => {
    const base = await freshPgRepo();
    const pool = poolOf(base);
    const files = modelBatches(7).slice(-120);
    const lsn = async () => String((await pool.query('select pg_current_wal_insert_lsn()::text as l')).rows[0].l);
    const walSince = async (from: string) => Number((await pool.query('select pg_wal_lsn_diff(pg_current_wal_insert_lsn(), $1::pg_lsn)::bigint as n', [from])).rows[0].n);
    const out: Record<string, { rowBytes: number; walBytes: number }> = {};
    for (const [label, villageParts] of [['whole', false], ['parts', true]] as const) {
      const repo = new PgRepo(pool, null, { villageParts });
      const id = `m-${label}`;
      await repo.createPlayer(player(id));
      await repo.createVillage(row(id, files[0], 1));
      let rowBytes = 0;
      let prev: Map<string, string> | null = null;
      const start = await lsn();
      for (let i = 1; i < files.length; i++) {
        expect(await repo.saveVillage(row(id, files[i], i + 1), i, [], [])).toBe(true);
        // Bytes of the rows that really changed (the JSON a batch rewrites).
        const split = splitVillageFile(files[i])!;
        if (!villageParts) rowBytes += JSON.stringify(files[i]).length;
        else {
          rowBytes += JSON.stringify(split.rest).length;
          const now = new Map(split.parts.map((p) => [p.part, p.hash]));
          for (const p of split.parts) if (prev?.get(p.part) !== p.hash) rowBytes += JSON.stringify(p.data).length;
          prev = now;
        }
      }
      out[label] = { rowBytes: Math.round(rowBytes / (files.length - 1)), walBytes: Math.round((await walSince(start)) / (files.length - 1)) };
      expect((await repo.getVillage(id))!.file).toEqual(files.at(-1));
    }
    console.log(`village write per batch of ${BATCH} commands (model player, day 7, ${files.length - 1} batches; file ${JSON.stringify(files.at(-1)).length} bytes):`, JSON.stringify(out));
    expect(out.parts!.rowBytes).toBeLessThan(out.whole!.rowBytes);
  });
});
