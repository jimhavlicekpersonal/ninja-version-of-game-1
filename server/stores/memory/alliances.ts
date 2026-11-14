/** In-memory Alliances (groves): members, chat, reports and blocks, troop requests and donations, Grove Raids (part of `SocialStore`). */

import type { Player, Grove, GroveSummaryRow, GroveMember, ChatRow, Report, Block, TroopRequest, Donation, RaidPairing, RaidAttack, RaidClaim } from '../types';
import { MemoryBase, clone } from './base';

export class MemoryAlliances extends MemoryBase {
  async playerByNameKey(key: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.nameKey === key) return clone(p);
    return null;
  }
  async createGrove(g: Grove): Promise<void> {
    this.groves.set(g.id, clone(g));
  }
  async getGrove(id: string): Promise<Grove | null> {
    const g = this.groves.get(id);
    return g ? clone(g) : null;
  }
  private summary(g: Grove): GroveSummaryRow {
    const rows = this.memberRows.filter((m) => m.groveId === g.id);
    const players = rows.map((m) => this.players.get(m.playerId)).filter((p): p is Player => Boolean(p));
    const avg = players.length ? Math.round(players.reduce((s, p) => s + p.trophies, 0) / players.length) : 0;
    return { ...clone(g), members: rows.length, averageTrophies: avg, lastActiveAt: Math.max(0, ...players.map((p) => p.lastSeenAt)) };
  }
  async listGroves(query: string, limit: number): Promise<GroveSummaryRow[]> {
    const q = query.trim().toLowerCase();
    return [...this.groves.values()]
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .map((g) => this.summary(g))
      .filter((s) => s.members > 0)
      .slice(0, limit);
  }
  async members(groveId: string): Promise<GroveMember[]> {
    return this.memberRows.filter((m) => m.groveId === groveId).map(clone);
  }
  async getMembership(playerId: string): Promise<GroveMember | null> {
    const m = this.memberRows.find((r) => r.playerId === playerId);
    return m ? clone(m) : null;
  }
  async addMember(m: GroveMember): Promise<boolean> {
    if (this.memberRows.some((r) => r.playerId === m.playerId)) return false;
    this.memberRows.push(clone(m));
    return true;
  }
  async removeMember(groveId: string, playerId: string): Promise<void> {
    this.memberRows = this.memberRows.filter((m) => !(m.groveId === groveId && m.playerId === playerId));
  }
  async updateMember(groveId: string, playerId: string, patch: Partial<Pick<GroveMember, 'role' | 'xp'>>): Promise<void> {
    const m = this.memberRows.find((r) => r.groveId === groveId && r.playerId === playerId);
    if (m) Object.assign(m, patch);
  }
  async addChat(row: Omit<ChatRow, 'seq'>): Promise<ChatRow> {
    const full = { ...clone(row), seq: ++this.seq };
    this.chatRows.push(full);
    return clone(full);
  }
  async chatAfter(groveId: string, afterSeq: number, limit: number): Promise<ChatRow[]> {
    return this.chatRows.filter((c) => c.groveId === groveId && c.seq > afterSeq && !c.hidden).slice(-limit).map(clone);
  }
  async getChat(id: string): Promise<ChatRow | null> {
    const c = this.chatRows.find((x) => x.id === id);
    return c ? clone(c) : null;
  }
  async setChatHidden(id: string, hidden: boolean): Promise<void> {
    const c = this.chatRows.find((x) => x.id === id);
    if (c) c.hidden = hidden;
  }
  async hiddenChatIds(groveId: string, lastN: number): Promise<string[]> {
    return this.chatRows.filter((c) => c.groveId === groveId).slice(-lastN).filter((c) => c.hidden).map((c) => c.id);
  }
  async reports(status: 'open' | 'all', limit: number): Promise<Report[]> {
    return this.reportRows.filter((r) => status === 'all' || r.status === 'open').slice(0, limit).map(clone);
  }
  async getReport(id: string): Promise<Report | null> {
    const r = this.reportRows.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async openReportsOn(messageId: string): Promise<Report[]> {
    return this.reportRows.filter((r) => r.status === 'open' && r.messageId === messageId).map(clone);
  }
  async resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string, at: number): Promise<boolean> {
    const r = this.reportRows.find((x) => x.id === id);
    if (!r || r.status !== 'open') return false;
    Object.assign(r, { status, resolution, resolvedAt: at });
    return true;
  }
  async addBlock(b: Block): Promise<void> {
    this.blockRows = this.blockRows.filter((x) => !(x.playerId === b.playerId && x.blockedId === b.blockedId));
    this.blockRows.push(clone(b));
  }
  async removeBlock(playerId: string, blockedId: string): Promise<void> {
    this.blockRows = this.blockRows.filter((x) => !(x.playerId === playerId && x.blockedId === blockedId));
  }
  async blocksOf(playerId: string): Promise<Block[]> {
    return this.blockRows
      .filter((b) => b.playerId === playerId)
      .sort((a, b) => b.at - a.at)
      .map(clone);
  }
  async recentChatCount(playerId: string, since: number): Promise<number> {
    return this.chatRows.filter((c) => c.playerId === playerId && c.at > since && c.kind === 'chat').length;
  }
  async addRequest(r: TroopRequest): Promise<void> {
    this.requestRows.set(r.id, clone(r));
  }
  async getRequest(id: string): Promise<TroopRequest | null> {
    const r = this.requestRows.get(id);
    return r ? clone(r) : null;
  }
  async openRequests(groveId: string, since: number): Promise<TroopRequest[]> {
    return [...this.requestRows.values()].filter((r) => r.groveId === groveId && r.open && r.at > since).sort((a, b) => a.at - b.at).map(clone);
  }
  async lastRequestAt(playerId: string): Promise<number> {
    return Math.max(0, ...[...this.requestRows.values()].filter((r) => r.playerId === playerId).map((r) => r.at));
  }
  async closeRequestsOf(playerId: string): Promise<void> {
    for (const r of this.requestRows.values()) if (r.playerId === playerId) r.open = false;
  }
  async fillRequest(id: string, housing: number): Promise<TroopRequest | null> {
    const r = this.requestRows.get(id);
    if (!r || !r.open || r.filled + housing > r.size) return null;
    r.filled += housing;
    if (r.filled >= r.size) r.open = false;
    return clone(r);
  }
  async addDonation(d: Donation): Promise<void> {
    this.donations.push(clone(d));
  }
  async undelivered(playerId: string): Promise<Donation[]> {
    return this.donations.filter((d) => d.toId === playerId && !d.delivered).map(clone);
  }
  async markDelivered(playerId: string, ids: string[]): Promise<void> {
    for (const d of this.donations) if (d.toId === playerId && ids.includes(d.id)) d.delivered = true;
  }
  async getPairing(week: number, groveId: string): Promise<RaidPairing | null> {
    const p = this.pairings.find((x) => x.week === week && x.groveId === groveId);
    return p ? clone(p) : null;
  }
  async createPairings(pairs: RaidPairing[]): Promise<boolean> {
    if (pairs.some((p) => this.pairings.some((x) => x.week === p.week && x.groveId === p.groveId))) return false;
    for (const p of pairs) this.pairings.push(clone(p));
    return true;
  }
  async unpairedGroves(week: number, activeSince: number, limit: number): Promise<GroveSummaryRow[]> {
    const paired = new Set(this.pairings.filter((p) => p.week === week).map((p) => p.groveId));
    return [...this.groves.values()]
      .filter((g) => !paired.has(g.id))
      .map((g) => this.summary(g))
      .filter((s) => s.members > 0 && s.lastActiveAt >= activeSince)
      .slice(0, limit);
  }
  async addRaidAttack(a: RaidAttack): Promise<void> {
    this.raidAttackRows.push(clone(a));
  }
  async raidAttacks(week: number, groveId: string): Promise<RaidAttack[]> {
    return this.raidAttackRows.filter((a) => a.week === week && a.groveId === groveId).map(clone);
  }
  async addClaim(c: RaidClaim): Promise<boolean> {
    if (this.claims.some((x) => x.week === c.week && x.playerId === c.playerId)) return false;
    this.claims.push(clone(c));
    return true;
  }
  async getClaim(week: number, playerId: string): Promise<RaidClaim | null> {
    const c = this.claims.find((x) => x.week === week && x.playerId === playerId);
    return c ? clone(c) : null;
  }}
