/** The connection the Postgres adapter's stores share (one file per store, composed into `PgRepo` in index.ts). */
import type pg from 'pg';
import type { Repo } from '../ports';
import type { Row } from './rows';

export abstract class PgBase {
  /** `client`: a connection inside a transaction (see `transaction`); otherwise queries use the pool. */
  constructor(
    protected readonly pool: pg.Pool,
    protected readonly client: pg.PoolClient | null = null,
  ) {}

  protected get db(): pg.Pool | pg.PoolClient {
    return this.client ?? this.pool;
  }

  protected async rows(sql: string, vals: unknown[] = []): Promise<Row[]> {
    return (await this.db.query(sql, vals)).rows as Row[];
  }

  /** This repo as the whole port (for calls into another store). */
  protected get repo(): Repo {
    return this as unknown as Repo;
  }
}

/** The connection of a transaction handle (`transaction` passes a PgRepo on one client). */
export const dbOf = (tx: Repo): pg.Pool | pg.PoolClient => (tx as unknown as { db: pg.Pool | pg.PoolClient }).db;
