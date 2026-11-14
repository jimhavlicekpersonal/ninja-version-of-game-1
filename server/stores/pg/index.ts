/** Postgres storage adapter for the Repo port: its stores composed into one `Repo`. */
import { pgPoolSettings, pgTls, type PgPoolSettings } from '../../config';
import pg from 'pg';
import { migrationStatus, runMigrations, type MigrationStatus } from '../../migrate';
import { migrations } from '../../migrations';
import type { Repo } from '../ports';
import { composeStores } from '../compose';
import { PgBase } from './base';
import { num } from './rows';
import { PgPlayers } from './players';
import { PgPurchases } from './purchases';
import { PgOps } from './ops';
import { PgBattles } from './battles';
import { PgVillages } from './villages';
import { PgAlliances } from './alliances';
import { PgFriends } from './friends';
import { PgGangs } from './gangs';

let savepoints = 0;

// The store classes' methods are copied onto PgRepo by composeStores (which refuses a name defined twice);
// these merges give PgRepo their types, and `implements Repo` checks the result.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PgRepo extends PgPlayers, PgPurchases, PgOps, PgBattles, PgVillages, PgAlliances, PgFriends, PgGangs {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PgRepo extends PgBase implements Repo {
  /**
   * Run `fn` in one transaction on one connection. Inside a transaction, a
   * nested one is a savepoint: if it throws, only its own writes are undone.
   */
  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    if (this.client) {
      const sp = `sp_${++savepoints}`;
      await this.client.query(`savepoint ${sp}`);
      try {
        const out = await fn(this);
        await this.client.query(`release savepoint ${sp}`);
        return out;
      } catch (e) {
        await this.client.query(`rollback to savepoint ${sp}`);
        throw e;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const out = await fn(new PgRepo(this.pool, client));
      await client.query('commit');
      return out;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * A pool for DATABASE_URL with the TLS and pool settings of server/config.ts
   * (`pgTls`, `pgPoolSettings`: PG_CA_CERT, PG_SSL_ALLOW_UNVERIFIED,
   * PG_POOL_MAX, PG_*_TIMEOUT_MS). Without `settings` (the migration tool) the
   * statement timeout is off, so a long migration is not cancelled.
   */
  static fromUrl(url: string, settings: PgPoolSettings = pgPoolSettings(process.env, { migrations: true }), env: Record<string, string | undefined> = process.env): PgRepo {
    const tls = pgTls(url, env);
    return new PgRepo(new pg.Pool({ ...settings, connectionString: tls.connectionString, ssl: tls.ssl || undefined }));
  }

  /** Connections in the pool (for the tk_db_pool_connections gauge, step 47). */
  poolStats(): { total: number; idle: number; waiting: number } {
    return { total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount };
  }

  /** Apply pending migrations (a release step: `npm run server:migrate`). Returns the names applied. */
  async migrate(log?: (msg: string) => void): Promise<string[]> {
    return runMigrations(this.pool, migrations, Date.now, log);
  }

  /** Applied and pending migrations, without changing the schema. */
  async migrationStatus(): Promise<MigrationStatus> {
    return migrationStatus(this.pool, migrations);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.db.query('select 1');
  }

  /**
   * The deployment this database belongs to (step 42): written by the first
   * server that starts on it, returned as stored afterwards.
   */
  async claimEnvironment(deploy: string): Promise<string> {
    await this.db.query(`insert into server_meta (key, value) values ('environment', $1) on conflict (key) do nothing`, [deploy]);
    const r = await this.rows(`select value from server_meta where key = 'environment'`, []);
    return String(r[0].value);
  }

  async lockPurchases(playerId: string): Promise<void> {
    // Held until the transaction ends; every instance shares the database, so this is cross-instance.
    if (this.client) await this.client.query(`select pg_advisory_xact_lock(hashtextextended('purchases:' || $1, 0))`, [playerId]);
  }

  async claimJob(name: string, holder: string, now: number, leaseMs: number): Promise<boolean> {
    const r = await this.db.query(
      `insert into job_leases (name, holder, until) values ($1, $2, $3)
       on conflict (name) do update set holder = excluded.holder, until = excluded.until
       where job_leases.until <= $4 or job_leases.holder = excluded.holder
       returning name`,
      [name, holder, now + leaseMs, now],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async lockPlayer(playerId: string): Promise<void> {
    if (this.client) await this.client.query(`select pg_advisory_xact_lock(hashtextextended('player:' || $1, 0))`, [playerId]);
  }

  async getIdempotent(scope: string, key: string): Promise<{ status: number; body: unknown; fingerprint: string | null } | null> {
    const r = await this.rows('select status, body, fingerprint from idempotency_keys where scope = $1 and key = $2', [scope, key]);
    return r[0] ? { status: num(r[0].status), body: r[0].body ?? null, fingerprint: (r[0].fingerprint as string | null) ?? null } : null;
  }

  async putIdempotent(scope: string, key: string, status: number, body: unknown, at: number, fingerprint: string | null = null): Promise<void> {
    await this.db.query('insert into idempotency_keys (scope, key, status, body, created_at, fingerprint) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [scope, key, status, body === undefined ? null : JSON.stringify(body), at, fingerprint]);
  }

  async dropIdempotentScopes(scopes: string[]): Promise<number> {
    if (!scopes.length) return 0;
    return (await this.db.query('delete from idempotency_keys where scope = any($1::text[])', [scopes])).rowCount ?? 0;
  }
}

composeStores(PgRepo, [PgPlayers, PgPurchases, PgOps, PgBattles, PgVillages, PgAlliances, PgFriends, PgGangs]);
