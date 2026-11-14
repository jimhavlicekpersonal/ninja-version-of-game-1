/** In-memory Gangs and Gang Wars (part of `SocialStore`). */

import type { Squad, SquadMember, SquadInvite, GangWar, GangWarAttack, GangRelay, GangQueueEntry, Report } from '../types';
import { MemoryBase, clone } from './base';

export class MemoryGangs extends MemoryBase {
  async getSquad(id: string): Promise<Squad | null> {
    const s = this.squadRows.get(id);
    return s ? clone(s) : null;
  }
  async updateSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'rating'>>): Promise<void> {
    const s = this.squadRows.get(id);
    if (s) Object.assign(s, clone(patch));
  }
  async deleteSquad(id: string): Promise<void> {
    this.squadRows.delete(id);
    this.squadMemberRows = this.squadMemberRows.filter((m) => m.squadId !== id);
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.squadId !== id);
  }
  async squadMembers(squadId: string): Promise<SquadMember[]> {
    return this.squadMemberRows.filter((m) => m.squadId === squadId).sort((a, b) => a.joinedAt - b.joinedAt).map(clone);
  }
  async squadOf(playerId: string): Promise<SquadMember | null> {
    const m = this.squadMemberRows.find((x) => x.playerId === playerId);
    return m ? clone(m) : null;
  }
  async addSquadMember(m: SquadMember): Promise<boolean> {
    if (this.squadMemberRows.some((x) => x.playerId === m.playerId)) return false;
    this.squadMemberRows.push(clone(m));
    return true;
  }
  async removeSquadMember(playerId: string): Promise<void> {
    this.squadMemberRows = this.squadMemberRows.filter((m) => m.playerId !== playerId);
  }
  async setSquadRole(playerId: string, role: SquadMember['role']): Promise<void> {
    const m = this.squadMemberRows.find((x) => x.playerId === playerId);
    if (m) m.role = role;
  }
  async addSquadInvite(i: SquadInvite): Promise<void> {
    this.squadInviteRows.push(clone(i));
  }
  async getSquadInvite(id: string): Promise<SquadInvite | null> {
    const i = this.squadInviteRows.find((x) => x.id === id);
    return i ? clone(i) : null;
  }
  async squadInvitesTo(playerId: string, since: number): Promise<SquadInvite[]> {
    return this.squadInviteRows.filter((i) => i.toId === playerId && i.at > since).map(clone);
  }
  async squadInvitesFrom(squadId: string, since: number): Promise<SquadInvite[]> {
    return this.squadInviteRows.filter((i) => i.squadId === squadId && i.at > since).map(clone);
  }
  async deleteSquadInvite(id: string): Promise<void> {
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.id !== id);
  }
  async deleteSquadInvitesTo(playerId: string): Promise<void> {
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.toId !== playerId);
  }
  async deleteSquadInvitesFrom(squadId: string): Promise<void> {
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.squadId !== squadId);
  }
  async createWar(w: GangWar): Promise<void> {
    this.warRows.set(w.id, clone(w));
  }
  async getWar(id: string): Promise<GangWar | null> {
    const w = this.warRows.get(id);
    return w ? clone(w) : null;
  }
  async updateWar(id: string, patch: Partial<Pick<GangWar, 'a' | 'b' | 'notified'>>): Promise<void> {
    const w = this.warRows.get(id);
    if (w) Object.assign(w, clone(patch));
  }
  async activeWars(now: number, limit: number): Promise<GangWar[]> {
    return [...this.warRows.values()].filter((w) => w.endsAt > now).slice(0, limit).map(clone);
  }
  async markWarRated(id: string): Promise<boolean> {
    const w = this.warRows.get(id);
    if (!w || w.rated) return false;
    w.rated = true;
    return true;
  }
  async activeWarOf(squadId: string, now: number): Promise<GangWar | null> {
    for (const w of this.warRows.values()) if ((w.a.squadId === squadId || w.b.squadId === squadId) && w.endsAt > now) return clone(w);
    return null;
  }
  async warsOf(squadId: string, limit: number): Promise<GangWar[]> {
    return [...this.warRows.values()]
      .filter((w) => w.a.squadId === squadId || w.b.squadId === squadId)
      .sort((x, y) => y.createdAt - x.createdAt)
      .slice(0, limit)
      .map(clone);
  }
  async addWarAttack(a: GangWarAttack): Promise<void> {
    this.warAttackRows.push(clone(a));
  }
  async warAttacks(warId: string): Promise<GangWarAttack[]> {
    return this.warAttackRows.filter((a) => a.warId === warId).map(clone);
  }
  async getRelay(warId: string, side: 'a' | 'b', target: number): Promise<GangRelay | null> {
    const r = this.relayRows.find((x) => x.warId === warId && x.side === side && x.target === target);
    return r ? clone(r) : null;
  }
  async holdRelay(warId: string, side: 'a' | 'b', target: number, playerId: string, until: number, now: number): Promise<boolean> {
    let r = this.relayRows.find((x) => x.warId === warId && x.side === side && x.target === target);
    if (!r) this.relayRows.push((r = { warId, side, target, damage: {}, stars: 0, destruction: 0, strikes: 0, lastBy: null, holder: null, holdUntil: 0 }));
    if (r.holder && r.holder !== playerId && r.holdUntil > now) return false;
    r.holder = playerId;
    r.holdUntil = until;
    return true;
  }
  async putRelay(r: GangRelay): Promise<void> {
    this.relayRows = this.relayRows.filter((x) => !(x.warId === r.warId && x.side === r.side && x.target === r.target));
    this.relayRows.push(clone(r));
  }
  async enqueueGang(e: GangQueueEntry): Promise<boolean> {
    if (this.gangQueueRows.some((x) => x.squadId === e.squadId)) return false;
    this.gangQueueRows.push(clone(e));
    return true;
  }
  async dequeueGang(squadId: string): Promise<boolean> {
    const n = this.gangQueueRows.length;
    this.gangQueueRows = this.gangQueueRows.filter((x) => x.squadId !== squadId);
    return this.gangQueueRows.length < n;
  }
  async queuedGang(squadId: string): Promise<GangQueueEntry | null> {
    const e = this.gangQueueRows.find((x) => x.squadId === squadId);
    return e ? clone(e) : null;
  }
  async gangQueue(size: number): Promise<GangQueueEntry[]> {
    return this.gangQueueRows.filter((x) => x.size === size).sort((a, b) => a.queuedAt - b.queuedAt).map(clone);
  }
  async addGangClaim(warId: string, playerId: string, outcome: string, at: number): Promise<boolean> {
    if (this.gangClaimRows.some((c) => c.warId === warId && c.playerId === playerId)) return false;
    this.gangClaimRows.push({ warId, playerId, outcome, at });
    return true;
  }
  async gangClaimed(warId: string, playerId: string): Promise<boolean> {
    return this.gangClaimRows.some((c) => c.warId === warId && c.playerId === playerId);
  }
  async addReport(r: Report): Promise<boolean> {
    if (this.reportRows.some((x) => x.status === 'open' && x.reporterId === r.reporterId && x.targetId === r.targetId && (x.messageId ?? '') === (r.messageId ?? ''))) return false;
    this.reportRows.push(clone(r));
    return true;
  }
}
