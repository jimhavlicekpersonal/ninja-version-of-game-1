/** Versioned migrations (roadmap step 12): file rules, the runner's bookkeeping, and real Postgres when TEST_DATABASE_URL is set. */
import { describe, expect, it } from 'vitest';
import { loadMigrations, migrationStatus, runMigrations, type SqlClient, type SqlPool } from '../../../server/migrate';
import { migrations } from '../../../server/migrations';
import { freshPgPool, hasPg } from './pg';

/** Just enough of Postgres for the runner: bookkeeping rows, transactions, the advisory lock, and a statement that fails. */
function fakePool() {
  const committed: { version: string; name: string; checksum: string }[] = [];
  const ran: string[] = [];
  const events: string[] = [];
  let tx: { rows: typeof committed; ran: string[] } | null = null;
  const client: SqlClient = {
    async query(sql, params = []) {
      const s = sql.trim();
      if (s.startsWith('select pg_advisory_lock')) events.push('lock');
      else if (s.startsWith('select pg_advisory_unlock')) events.push('unlock');
      else if (s.startsWith('create table if not exists schema_migrations')) events.push('bookkeeping');
      else if (s.startsWith('select version')) return { rows: committed.map((r) => ({ ...r })) };
      else if (s === 'begin') tx = { rows: [], ran: [] };
      else if (s === 'commit') {
        committed.push(...tx!.rows);
        ran.push(...tx!.ran);
        tx = null;
      } else if (s === 'rollback') tx = null;
      else if (s.startsWith('insert into schema_migrations')) tx!.rows.push({ version: String(params[0]), name: String(params[1]), checksum: String(params[2]) });
      else if (s.includes('FAIL')) throw new Error('syntax error at "FAIL"');
      else tx!.ran.push(s);
      return { rows: [] };
    },
    release() {
      events.push('release');
    },
  };
  const pool: SqlPool = { connect: async () => client };
  return { pool, committed, ran, events };
}

describe('migration files', () => {
  it('are numbered, sorted and unique, with checksums that ignore Windows line endings', () => {
    const list = loadMigrations({ './0002_b.sql': 'select 2;\n', './0001_a.sql': 'select 1;\r\nselect 11;\r\n' });
    expect(list.map((m) => m.name)).toEqual(['0001_a', '0002_b']);
    expect(list[0].checksum).toBe(loadMigrations({ './0001_a.sql': 'select 1;\nselect 11;\n' })[0].checksum);
    expect(() => loadMigrations({ './init.sql': 'x' })).toThrow(/0002_what_it_does/);
    expect(() => loadMigrations({ './0001_a.sql': 'x', './0001_b.sql': 'y' })).toThrow(/share version 0001/);
  });

  it('the bundled migrations start at 0001 and leave no gaps', () => {
    expect(migrations.length).toBeGreaterThan(0);
    migrations.forEach((m, i) => expect(m.version).toBe(String(i + 1).padStart(4, '0')));
    expect(migrations[0].sql).toMatch(/create table if not exists players/);
  });
});

describe('migration runner', () => {
  const files = loadMigrations({ './0001_a.sql': 'create table a (x int);', './0002_b.sql': 'create table b (x int);' });

  it('applies pending files in order under the lock, once', async () => {
    const f = fakePool();
    expect(await runMigrations(f.pool, files, () => 5)).toEqual(['0001_a', '0002_b']);
    expect(f.ran).toEqual(['create table a (x int);', 'create table b (x int);']);
    expect(f.events[0]).toBe('lock');
    expect(f.events.slice(-2)).toEqual(['unlock', 'release']);
    expect(await runMigrations(f.pool, files)).toEqual([]);
    expect(f.ran).toHaveLength(2);
    const status = await migrationStatus(f.pool, [...files, ...loadMigrations({ './0003_c.sql': 'create table c (x int);' })]);
    expect(status.pending.map((m) => m.name)).toEqual(['0003_c']);
    expect(status.applied).toEqual(['0001', '0002']);
  });

  it('refuses a migration that was edited after it was applied', async () => {
    const f = fakePool();
    await runMigrations(f.pool, files);
    const edited = loadMigrations({ './0001_a.sql': 'create table a (x bigint);', './0002_b.sql': 'create table b (x int);' });
    await expect(runMigrations(f.pool, edited)).rejects.toThrow(/0001_a was changed after it was applied/);
    expect(f.events.slice(-2)).toEqual(['unlock', 'release']);
    await expect(migrationStatus(f.pool, edited)).rejects.toThrow(/changed/);
  });

  it('rolls back a failing file, keeps the ones before it, and still releases the lock', async () => {
    const f = fakePool();
    const bad = loadMigrations({ './0001_a.sql': 'create table a (x int);', './0002_bad.sql': 'FAIL;', './0003_c.sql': 'create table c (x int);' });
    await expect(runMigrations(f.pool, bad)).rejects.toThrow(/0002_bad failed and was rolled back/);
    expect(f.committed.map((r) => r.version)).toEqual(['0001']);
    expect(f.ran).toEqual(['create table a (x int);']);
    expect(f.events.slice(-2)).toEqual(['unlock', 'release']);
  });

  it('reports applied versions this build does not know (a newer database)', async () => {
    const f = fakePool();
    await runMigrations(f.pool, files);
    expect((await migrationStatus(f.pool, files.slice(0, 1))).unknown).toEqual(['0002']);
  });
});

describe.skipIf(!hasPg)('migrations on Postgres', () => {
  it('build a fresh database, then find nothing left to do', async () => {
    const pool = await freshPgPool();
    expect(await runMigrations(pool, migrations)).toEqual(migrations.map((m) => m.name));
    expect((await migrationStatus(pool, migrations)).pending).toEqual([]);
    expect(await runMigrations(pool, migrations)).toEqual([]);
    const tables = (await pool.query(`select table_name from information_schema.tables where table_schema = current_schema()`)).rows.map((r) => r.table_name);
    expect(tables).toEqual(expect.arrayContaining(['players', 'tickets', 'attacks', 'groves', 'schema_migrations']));
  });

  it('adopt a database made by the old boot-time schema without changing it', async () => {
    const pool = await freshPgPool();
    await pool.query(migrations[0].sql); // what every boot used to run
    await pool.query(`insert into players (id, name, token_hash, created_at, updated_at) values ('p1', 'Old Timer', 'h', 1, 1)`);
    await runMigrations(pool, migrations);
    expect((await pool.query(`select name from players where id = 'p1'`)).rows[0].name).toBe('Old Timer');
  });

  it('two release jobs at once apply each migration exactly once', async () => {
    const pool = await freshPgPool();
    const [a, b] = await Promise.all([runMigrations(pool, migrations), runMigrations(pool, migrations)]);
    expect([...a, ...b].sort()).toEqual(migrations.map((m) => m.name).sort());
    expect(Number((await pool.query('select count(*) as n from schema_migrations')).rows[0].n)).toBe(migrations.length);
  });
});
