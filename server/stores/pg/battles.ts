/** Postgres tickets, attack records, base versions and retention (`BattleStore`). */
import { contentHash } from '../../contentHash';
import type { Ticket, AttackRecord, PruneCutoffs, PruneResult } from '../types';
import type { BattleStore } from '../ports';
import { num, toTicket, toAttack, PUT_BASE } from './rows';
import { PgBase } from './base';

export class PgBattles extends PgBase implements BattleStore {
  async createTicket(t: Ticket): Promise<void> {
    // The base version and the ticket in one statement: retention never sees one without the other.
    await this.db.query(
      `${PUT_BASE}
       insert into tickets (base_hash, base, created_at, id, kind, attacker_id, defender_id, defender_name, defender_trophies, expires_at, used, week, grove_id, target, seed, rules, data_version, challenge_id, war_id, relay, start_damage, scout_seed)
       values ($1, null, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [contentHash(t.base), JSON.stringify(t.base), t.createdAt, t.id, t.kind, t.attackerId, t.defenderId, t.defenderName, t.defenderTrophies, t.expiresAt, t.week ?? null, t.groveId ?? null, t.target ?? null, t.seed ?? null, t.rules ?? null, t.dataVersion ?? null, t.challengeId ?? null, t.warId ?? null, t.relay ?? null, t.startDamage ? JSON.stringify(t.startDamage) : null, t.scoutSeed ?? null],
    );
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const r = await this.rows('select t.*, b.base as stored_base from tickets t left join base_versions b on b.hash = t.base_hash where t.id = $1', [id]);
    return r[0] ? toTicket(r[0]) : null;
  }

  async useTicket(id: string, response?: unknown): Promise<boolean> {
    const r = await this.db.query('update tickets set used = true, response = coalesce($2::jsonb, response) where id = $1 and used = false', [id, response === undefined ? null : JSON.stringify(response)]);
    return (r.rowCount ?? 0) > 0;
  }

  async startTicket(id: string, at: number, stake?: number): Promise<boolean> {
    const r = await this.db.query('update tickets set stake = case when started_at is null then $3 else stake end, started_at = coalesce(started_at, $2) where id = $1 and used = false', [id, at, stake ?? null]);
    return (r.rowCount ?? 0) > 0;
  }

  async bumpTicketFailures(id: string): Promise<number> {
    const r = await this.rows('update tickets set failures = failures + 1 where id = $1 returning failures', [id]);
    return r[0] ? num(r[0].failures) : 0;
  }

  async openTickets(attackerId: string, kind: Ticket['kind']): Promise<Ticket[]> {
    const r = await this.rows('select t.*, b.base as stored_base from tickets t left join base_versions b on b.hash = t.base_hash where t.attacker_id = $1 and t.kind = $2 and not t.used order by t.created_at desc limit 50', [attackerId, kind]);
    return r.map(toTicket);
  }

  async expiredOpenTickets(kind: Ticket['kind'], before: number, limit: number): Promise<Ticket[]> {
    const r = await this.rows('select t.*, b.base as stored_base from tickets t left join base_versions b on b.hash = t.base_hash where t.kind = $1 and not t.used and t.expires_at < $2 order by t.expires_at limit $3', [kind, before, limit]);
    return r.map(toTicket);
  }

  async addRefundNotice(store: string, key: string, at: number, why: string): Promise<void> {
    await this.db.query('insert into refund_notices (store, key, at, why) values ($1,$2,$3,$4) on conflict do nothing', [store, key, at, why]);
  }

  async refundNotice(store: string, key: string): Promise<{ at: number; why: string } | null> {
    const r = await this.rows('select at, why from refund_notices where store = $1 and key = $2', [store, key]);
    return r[0] ? { at: num(r[0].at), why: String(r[0].why) } : null;
  }

  async addAttack(a: AttackRecord): Promise<void> {
    const { base, ...record } = a;
    await this.db.query(
      `${PUT_BASE}
       insert into attacks (base_hash, at, id, attacker_id, defender_id, record) values ($1, $3, $4, $5, $6, $7)`,
      [contentHash(base), JSON.stringify(base), a.at, a.id, a.attackerId, a.defenderId, JSON.stringify(record)],
    );
  }

  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    const r = await this.rows(
      `select a.id, a.record, b.base as stored_base from attacks a left join base_versions b on b.hash = a.base_hash
       where a.defender_id = $1 and a.at > $2 order by a.at desc limit $3`,
      [defenderId, since, limit],
    );
    return r.map(toAttack).reverse();
  }

  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return (await this.rows('select defender_id from attacks where attacker_id = $1 and at > $2', [attackerId, since])).map((x) => String(x.defender_id));
  }

  /**
   * Backend A18: delete matching rows in short batches (by ctid), so no statement nears the statement
   * timeout however much has piled up; stops at `deadline` (the rest goes next run). Returns rows deleted.
   */
  private async batchDelete(table: string, where: string, params: unknown[], c: PruneCutoffs): Promise<number> {
    const size = Math.max(100, Math.floor(c.batchSize ?? 5000));
    let total = 0;
    for (;;) {
      const r = await this.db.query(`delete from ${table} where ctid = any(array(select ctid from ${table} where ${where} limit ${size}))`, params);
      const n = r.rowCount ?? 0;
      total += n;
      if (n < size || (c.deadline !== undefined && Date.now() > c.deadline)) return total;
    }
  }

  async prune(c: PruneCutoffs): Promise<PruneResult> {
    const attacks = await this.batchDelete('attacks', 'at < $1', [c.recordsBefore], c);
    const tickets = await this.batchDelete('tickets', 'created_at < $1 or (not used and expires_at < $2)', [c.recordsBefore, c.ticketsBefore ?? c.staleBefore], c);
    // last_used_at guards a base that a new ticket is referring to right now (its insert refreshes it).
    const bases = await this.batchDelete(
      'base_versions b',
      `b.last_used_at < $1
         and not exists (select 1 from tickets t where t.base_hash = b.hash)
         and not exists (select 1 from attacks a where a.base_hash = b.hash)`,
      [c.staleBefore],
      c,
    );
    const reports = c.resolvedReportsBefore === undefined ? 0 : await this.batchDelete('reports', `status <> 'open' and resolved_at < $1`, [c.resolvedReportsBefore], c);
    const commands = c.commandsBefore === undefined ? 0 : await this.batchDelete('command_log', 'at < $1', [c.commandsBefore], c);
    const idem = c.idempotencyBefore === undefined ? 0 : await this.batchDelete('idempotency_keys', 'created_at < $1', [c.idempotencyBefore], c);
    if (c.intentsBefore !== undefined) await this.batchDelete('purchase_intents', 'at < $1', [c.intentsBefore], c);
    if (c.deletionRequestsBefore !== undefined) await this.batchDelete('deletion_requests', `status <> 'open' and resolved_at < $1`, [c.deletionRequestsBefore], c);
    if (c.storeNotificationsBefore !== undefined) await this.batchDelete('store_notifications', 'received_at < $1', [c.storeNotificationsBefore], c);
    if (c.complaintsBefore !== undefined) await this.batchDelete('complaints', `status <> 'open' and resolved_at < $1`, [c.complaintsBefore], c);
    if (c.noncesBefore !== undefined) await this.batchDelete('auth_nonces', 'expires_at < $1', [c.noncesBefore], c);
    return { attacks, tickets, bases, reports, commands, idempotency: idem };
  }
}
