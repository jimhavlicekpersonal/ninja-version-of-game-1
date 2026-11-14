/** In-memory tickets, attack records, base versions and retention (`BattleStore`). */
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';
import { contentHash } from '../../contentHash';
import type { Ticket, AttackRecord, PruneCutoffs, PruneResult } from '../types';
import type { BattleStore } from '../ports';
import { MemoryBase, clone } from './base';

export class MemoryBattles extends MemoryBase implements BattleStore {
  private putBase(base: BaseLayout, at: number): string {
    const hash = contentHash(base);
    const known = this.bases.get(hash);
    if (known) known.lastUsedAt = Math.max(known.lastUsedAt, at);
    else this.bases.set(hash, { base: clone(base), createdAt: at, lastUsedAt: at });
    return hash;
  }
  private withBase<T extends { baseHash: string }>(row: T): Omit<T, 'baseHash'> & { base: BaseLayout } {
    const { baseHash, ...rest } = clone(row);
    return { ...rest, base: clone(this.bases.get(baseHash)!.base) };
  }
  async createTicket(t: Ticket): Promise<void> {
    const { base, ...rest } = clone(t);
    this.tickets.set(t.id, { ...rest, baseHash: this.putBase(base, t.createdAt) });
  }
  async getTicket(id: string): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    return t ? this.withBase(t) : null;
  }
  async useTicket(id: string, response?: unknown): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.used) return false;
    t.used = true;
    if (response !== undefined) t.response = clone(response);
    return true;
  }
  async startTicket(id: string, at: number, stake?: number): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.used) return false;
    if (t.startedAt === undefined) {
      t.startedAt = at;
      if (stake !== undefined) t.stake = stake;
    }
    return true;
  }
  async bumpTicketFailures(id: string): Promise<number> {
    const t = this.tickets.get(id);
    if (!t) return 0;
    t.failures = (t.failures ?? 0) + 1;
    return t.failures;
  }
  async openTickets(attackerId: string, kind: Ticket['kind']): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => !t.used && t.attackerId === attackerId && t.kind === kind).sort((a, b) => b.createdAt - a.createdAt).map((t) => this.withBase(t));
  }
  async expiredOpenTickets(kind: Ticket['kind'], before: number, limit: number): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => !t.used && t.kind === kind && t.expiresAt < before).sort((a, b) => a.expiresAt - b.expiresAt).slice(0, limit).map((t) => this.withBase(t));
  }
  async addRefundNotice(store: string, key: string, at: number, why: string): Promise<void> {
    if (!this.refundRows.has(`${store}:${key}`)) this.refundRows.set(`${store}:${key}`, { at, why });
  }
  async refundNotice(store: string, key: string): Promise<{ at: number; why: string } | null> {
    const r = this.refundRows.get(`${store}:${key}`);
    return r ? { ...r } : null;
  }
  async addAttack(a: AttackRecord): Promise<void> {
    const { base, ...rest } = clone(a);
    this.attacks.push({ ...rest, baseHash: this.putBase(base, a.at) });
  }
  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    return this.attacks
      .filter((a) => a.defenderId === defenderId && a.at > since)
      .slice(-limit)
      .map((a) => this.withBase(a));
  }
  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return this.attacks.filter((a) => a.attackerId === attackerId && a.at > since).map((a) => a.defenderId);
  }
  async prune(c: PruneCutoffs): Promise<PruneResult> {
    const attacks = this.attacks.length;
    this.attacks = this.attacks.filter((a) => a.at >= c.recordsBefore);
    let tickets = 0;
    for (const [id, t] of this.tickets) {
      if (t.createdAt < c.recordsBefore || (!t.used && t.expiresAt < (c.ticketsBefore ?? c.staleBefore))) {
        this.tickets.delete(id);
        tickets++;
      }
    }
    const used = new Set([...[...this.tickets.values()].map((t) => t.baseHash), ...this.attacks.map((a) => a.baseHash)]);
    let bases = 0;
    for (const [hash, b] of this.bases) {
      if (!used.has(hash) && b.lastUsedAt < c.staleBefore) {
        this.bases.delete(hash);
        bases++;
      }
    }
    const reports = this.reportRows.length;
    const before = c.resolvedReportsBefore;
    if (before !== undefined) this.reportRows = this.reportRows.filter((r) => r.status === 'open' || (r.resolvedAt ?? 0) >= before);
    const commands = this.commandRows.length;
    const cmdBefore = c.commandsBefore;
    if (cmdBefore !== undefined) this.commandRows = this.commandRows.filter((r) => r.at >= cmdBefore);
    const delBefore = c.deletionRequestsBefore;
    if (delBefore !== undefined) this.deletionRows = this.deletionRows.filter((r) => r.status === 'open' || (r.resolvedAt ?? 0) >= delBefore);
    const intentsBefore = c.intentsBefore;
    if (intentsBefore !== undefined) this.intentRows = this.intentRows.filter((i) => i.at >= intentsBefore);
    const snBefore = c.storeNotificationsBefore;
    if (snBefore !== undefined) this.storeNoticeRows = this.storeNoticeRows.filter((n) => n.receivedAt >= snBefore);
    const complaintsBefore = c.complaintsBefore;
    if (complaintsBefore !== undefined) this.complaintRows = this.complaintRows.filter((x) => x.status === 'open' || (x.resolvedAt ?? 0) >= complaintsBefore);
    const noncesBefore = c.noncesBefore;
    if (noncesBefore !== undefined) for (const [n, exp] of this.nonceRows) if (exp < noncesBefore) this.nonceRows.delete(n);
    let idempotency = 0;
    const idemBefore = c.idempotencyBefore;
    if (idemBefore !== undefined) {
      for (const [k, r] of this.idempotencyRows) {
        if (r.createdAt < idemBefore) {
          this.idempotencyRows.delete(k);
          idempotency++;
        }
      }
    }
    return { attacks: attacks - this.attacks.length, tickets, bases, reports: reports - this.reportRows.length, commands: commands - this.commandRows.length, idempotency };
  }}
