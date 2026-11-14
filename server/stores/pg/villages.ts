/** Postgres server-held villages, their ledger and command log (`VillageStore`). */
import type { VillageRow, LedgerEntry, CommandLogRow } from '../types';
import type { VillageStore } from '../ports';
import { num, toVillage, toLedger, toCommand } from './rows';
import { PgBase, dbOf } from './base';

export class PgVillages extends PgBase implements VillageStore {
  async getVillage(playerId: string, opts: { forUpdate?: boolean } = {}): Promise<VillageRow | null> {
    // A row lock only means something inside a transaction.
    const r = await this.rows(`select * from villages where player_id = $1${opts.forUpdate && this.client ? ' for update' : ''}`, [playerId]);
    return r[0] ? toVillage(r[0]) : null;
  }

  async createVillage(v: VillageRow): Promise<boolean> {
    const r = await this.db.query(
      `insert into villages (player_id, file, revision, seq, at, state_hash, created_at, updated_at)
       select $1, $2, $3, $4, $5, $6, $7, $8 where exists (select 1 from players where id = $1)
       on conflict (player_id) do nothing`,
      [v.playerId, JSON.stringify(v.file), v.revision, v.seq, v.at, v.stateHash, v.createdAt, v.updatedAt],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async saveVillage(v: VillageRow, expectedRevision: number, ledger: LedgerEntry[], commands: CommandLogRow[]): Promise<boolean> {
    const stale = new Error('stale revision');
    try {
      return await this.repo.transaction(async (tx) => {
        const db = dbOf(tx);
        const r = await db.query(
          `update villages set file = $2, revision = $3, seq = $4, at = $5, state_hash = $6, updated_at = $7, device_seqs = coalesce($9::jsonb, device_seqs) where player_id = $1 and revision = $8`,
          [v.playerId, JSON.stringify(v.file), v.revision, v.seq, v.at, v.stateHash, v.updatedAt, expectedRevision, v.deviceSeqs ? JSON.stringify(v.deviceSeqs) : null],
        );
        if ((r.rowCount ?? 0) === 0) throw stale;
        // Backend A17: one statement for all the ledger lines and one for all the log lines of a batch
        // (they were one round trip per line: up to MAX_BATCH × resources inserts per command batch).
        if (ledger.length) {
          await db.query(
            `insert into ledger (player_id, at, resource, delta, balance, reason, ref)
             select * from unnest($1::text[], $2::bigint[], $3::text[], $4::bigint[], $5::bigint[], $6::text[], $7::text[])`,
            [ledger.map((l) => l.playerId), ledger.map((l) => l.at), ledger.map((l) => l.resource), ledger.map((l) => l.delta), ledger.map((l) => l.balance), ledger.map((l) => l.reason), ledger.map((l) => l.ref)],
          );
        }
        if (commands.length) {
          await db.query(
            `insert into command_log (player_id, seq, at, client_at, type, command, ok, error)
             select p, s, a, ca, t, c::jsonb, o, e from unnest($1::text[], $2::bigint[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::boolean[], $8::text[]) as x(p, s, a, ca, t, c, o, e)
             on conflict (player_id, seq) do update set at = excluded.at, client_at = excluded.client_at, type = excluded.type, command = excluded.command, ok = excluded.ok, error = excluded.error`,
            [commands.map((c) => c.playerId), commands.map((c) => c.seq), commands.map((c) => c.at), commands.map((c) => c.clientAt), commands.map((c) => c.type), commands.map((c) => JSON.stringify(c.command)), commands.map((c) => c.ok), commands.map((c) => c.error)],
          );
        }
        return true;
      });
    } catch (e) {
      if (e === stale) return false;
      throw e;
    }
  }

  async recordVillageCommands(v: Pick<VillageRow, 'playerId' | 'revision' | 'seq' | 'updatedAt' | 'deviceSeqs'>, expectedRevision: number, commands: CommandLogRow[]): Promise<boolean> {
    const stale = new Error('stale revision');
    try {
      return await this.repo.transaction(async (tx) => {
        const db = dbOf(tx);
        const r = await db.query(`update villages set revision = $3, seq = $4, updated_at = $5, device_seqs = coalesce($6::jsonb, device_seqs) where player_id = $1 and revision = $2`, [
          v.playerId,
          expectedRevision,
          v.revision,
          v.seq,
          v.updatedAt,
          v.deviceSeqs ? JSON.stringify(v.deviceSeqs) : null,
        ]);
        if ((r.rowCount ?? 0) === 0) throw stale;
        if (commands.length) {
          // One statement for the whole batch (up to MAX_BATCH short lines).
          await db.query(
            `insert into command_log (player_id, seq, at, client_at, type, command, ok, error)
             select $1, s, a, ca, t, c::jsonb, o, e from unnest($2::bigint[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::boolean[], $8::text[]) as x(s, a, ca, t, c, o, e)
             on conflict (player_id, seq) do update set at = excluded.at, client_at = excluded.client_at, type = excluded.type, command = excluded.command, ok = excluded.ok, error = excluded.error`,
            [
              v.playerId,
              commands.map((c) => c.seq),
              commands.map((c) => c.at),
              commands.map((c) => c.clientAt),
              commands.map((c) => c.type),
              commands.map((c) => JSON.stringify(c.command)),
              commands.map((c) => c.ok),
              commands.map((c) => c.error),
            ],
          );
        }
        return true;
      });
    } catch (e) {
      if (e === stale) return false;
      throw e;
    }
  }

  async ledgerOf(playerId: string, limit: number): Promise<LedgerEntry[]> {
    return (await this.rows('select * from ledger where player_id = $1 order by id desc limit $2', [playerId, limit])).map(toLedger);
  }

  async balanceAt(playerId: string, resource: string, at: number): Promise<number | null> {
    const r = await this.rows('select balance from ledger where player_id = $1 and resource = $2 and at <= $3 order by at desc, id desc limit 1', [playerId, resource, at]);
    return r[0] ? num(r[0].balance) : null;
  }

  async commandsOf(playerId: string, sinceSeq: number, limit: number): Promise<CommandLogRow[]> {
    return (await this.rows('select * from command_log where player_id = $1 and seq > $2 order by seq limit $3', [playerId, sinceSeq, limit])).map(toCommand);
  }
}
