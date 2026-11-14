/**
 * Versioned schema migrations (roadmap step 12). Each change to the database
 * is a numbered SQL file in server/migrations/ (`0002_base_versions.sql`, …).
 * They run as a release step, `npm run server:migrate`, before new server
 * instances start, never on every boot: with several instances, boot-time
 * migrations race each other.
 *
 * - `schema_migrations` records each applied file with a checksum. Editing a
 *   file that was already applied is refused: add a new file instead.
 * - A Postgres advisory lock lets only one runner work at a time, so two
 *   release jobs (or MIGRATE_ON_BOOT on several instances) cannot collide.
 * - Each file runs in its own transaction, together with its bookkeeping row.
 * - Backend A22: a file whose first line is `-- migrate: no-transaction` runs
 *   outside a transaction, one statement at a time (split on a `;` that ends a
 *   line), so it can `create index concurrently` without locking writes. Its
 *   statements must be safe to run again (`if not exists`): a failure part way
 *   cannot be rolled back, and the next run starts the file over. Its
 *   bookkeeping row is written after the last statement. Keep such files to
 *   index builds; nothing in them may contain a `;` at the end of a line inside
 *   a string or body. A `create index concurrently if not exists <name>` that
 *   failed part way leaves an INVALID index of that name, which `if not exists`
 *   would then skip for good: the runner drops such an index before the
 *   statement runs again (2026-11-14 verification fix).
 * - The lock is taken with `pg_try_advisory_lock`, polled: a runner waiting
 *   inside `pg_advisory_lock` holds a snapshot, and `create index concurrently`
 *   in the runner holding the lock waits for that snapshot, a deadlock
 *   (two release jobs at once, MIGRATE_ON_BOOT on several instances).
 */
import { createHash } from 'node:crypto';

export interface Migration {
  /** The number at the start of the file name, e.g. "0002". Files run in this order. */
  version: string;
  /** The file name without its extension. */
  name: string;
  sql: string;
  /** SHA-256 of the SQL with line endings made "\n" (a Windows checkout must not count as an edit). */
  checksum: string;
}

/** The part of a pg client the runner uses. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface SqlPool {
  connect(): Promise<SqlClient>;
}

/** Any fixed number: the lock only has to be the same for every runner of this game. */
const LOCK_ID = 0x7a6b6d1;

/** How long a runner waits between tries for the lock. */
const LOCK_POLL_MS = 250;

/** `create [unique] index concurrently if not exists <name>`: the index name, else null. */
export function concurrentIndexName(stmt: string): string | null {
  const m = /^create\s+(?:unique\s+)?index\s+concurrently\s+if\s+not\s+exists\s+"?([a-z_][a-z0-9_]*)"?\s/i.exec(stmt);
  return m ? m[1]!.toLowerCase() : null;
}

/** Backend A22: drop an INVALID index of this name in the current schema (left by a failed concurrent build). */
async function dropInvalidIndex(client: SqlClient, name: string, log: (msg: string) => void): Promise<void> {
  const r = await client.query(
    `select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = $1 and c.relnamespace = current_schema()::regnamespace and not i.indisvalid`,
    [name],
  );
  if (!r.rows.length) return;
  log(`Dropping the invalid index ${name} left by a failed build…`);
  await client.query(`drop index concurrently if exists "${name}"`);
}

async function takeLock(client: SqlClient, sleep: (ms: number) => Promise<void>): Promise<void> {
  for (;;) {
    const r = await client.query('select pg_try_advisory_lock($1) as ok', [LOCK_ID]);
    if (r.rows[0]?.ok === true) return;
    await sleep(LOCK_POLL_MS);
  }
}

const FILE = /(?:^|\/)((\d{4})_[a-z0-9_]+)\.sql$/;

/** Migrations from a { path: sql } map (Vite's import.meta.glob), sorted by version; malformed or duplicate versions throw. */
export function loadMigrations(files: Record<string, string>): Migration[] {
  const out: Migration[] = [];
  const seen = new Set<string>();
  for (const [path, raw] of Object.entries(files)) {
    const m = FILE.exec(path);
    if (!m) throw new Error(`Migration file names look like 0002_what_it_does.sql, not ${path}`);
    const [, name, version] = m;
    if (seen.has(version)) throw new Error(`Two migrations share version ${version}`);
    seen.add(version);
    const sql = raw.replace(/\r\n/g, '\n');
    out.push({ version, name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return out.sort((a, b) => (a.version < b.version ? -1 : 1));
}

/** Backend A22: the header that runs a migration file outside a transaction. */
export const NO_TRANSACTION_HEADER = '-- migrate: no-transaction';

export function isNoTransaction(m: Pick<Migration, 'sql'>): boolean {
  return m.sql.trimStart().split('\n', 1)[0]!.trim().toLowerCase() === NO_TRANSACTION_HEADER;
}

/** The statements of a no-transaction file: split on a `;` that ends a line, comments and blanks dropped. */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;[ \t]*(?:\n|$)/)
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !/^\s*--/.test(line))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

const BOOKKEEPING = `create table if not exists schema_migrations (
  version text primary key,
  name text not null,
  checksum text not null,
  applied_at bigint not null
)`;

async function appliedOf(client: SqlClient): Promise<Map<string, { name: string; checksum: string }>> {
  await client.query(BOOKKEEPING);
  const rows = (await client.query('select version, name, checksum from schema_migrations')).rows;
  return new Map(rows.map((r) => [String(r.version), { name: String(r.name), checksum: String(r.checksum) }]));
}

function checkApplied(migrations: Migration[], applied: Map<string, { name: string; checksum: string }>): void {
  for (const m of migrations) {
    const a = applied.get(m.version);
    if (a && a.checksum !== m.checksum) throw new Error(`Migration ${m.name} was changed after it was applied. Put the change in a new migration file instead.`);
  }
}

export interface MigrationStatus {
  applied: string[];
  pending: Migration[];
  /** Applied versions this build does not know (the database is newer than this server). */
  unknown: string[];
}

/** What has been applied and what is still to run. Creates only the bookkeeping table. */
export async function migrationStatus(pool: SqlPool, migrations: Migration[]): Promise<MigrationStatus> {
  const client = await pool.connect();
  try {
    const applied = await appliedOf(client);
    checkApplied(migrations, applied);
    const known = new Set(migrations.map((m) => m.version));
    return {
      applied: [...applied.keys()].sort(),
      pending: migrations.filter((m) => !applied.has(m.version)),
      unknown: [...applied.keys()].filter((v) => !known.has(v)).sort(),
    };
  } finally {
    client.release();
  }
}

/** Apply every pending migration in order; returns the names applied. Safe to run while other runners start. */
export async function runMigrations(
  pool: SqlPool,
  migrations: Migration[],
  now: () => number = Date.now,
  log: (msg: string) => void = () => {},
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<string[]> {
  const client = await pool.connect();
  const done: string[] = [];
  try {
    // Waits for any other runner; afterwards it sees what that runner applied.
    await takeLock(client, sleep);
    try {
      const applied = await appliedOf(client);
      checkApplied(migrations, applied);
      for (const m of migrations) {
        if (applied.has(m.version)) continue;
        log(`Applying migration ${m.name}…`);
        if (isNoTransaction(m)) {
          // Backend A22: one statement at a time, outside a transaction (CREATE INDEX CONCURRENTLY).
          try {
            for (const stmt of splitStatements(m.sql)) {
              const index = concurrentIndexName(stmt);
              if (index) await dropInvalidIndex(client, index, log);
              await client.query(stmt);
            }
            await client.query('insert into schema_migrations (version, name, checksum, applied_at) values ($1, $2, $3, $4)', [m.version, m.name, m.checksum, now()]);
          } catch (e) {
            throw new Error(`Migration ${m.name} (no transaction) failed part way; its statements are idempotent, so fix the cause and run it again: ${(e as Error).message}`, { cause: e });
          }
          done.push(m.name);
          continue;
        }
        await client.query('begin');
        try {
          await client.query(m.sql);
          await client.query('insert into schema_migrations (version, name, checksum, applied_at) values ($1, $2, $3, $4)', [m.version, m.name, m.checksum, now()]);
          await client.query('commit');
        } catch (e) {
          await client.query('rollback');
          throw new Error(`Migration ${m.name} failed and was rolled back: ${(e as Error).message}`, { cause: e });
        }
        done.push(m.name);
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } finally {
    client.release();
  }
  return done;
}
