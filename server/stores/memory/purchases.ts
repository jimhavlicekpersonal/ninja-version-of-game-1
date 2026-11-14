/** In-memory purchases, refunds, push tokens and the power leaderboards (`PurchaseStore`). */
import { STATE_NOTICES } from '../notices';
import type { Player, PurchaseRow, PushToken } from '../types';
import type { PurchaseStore } from '../ports';
import { MemoryBase, clone } from './base';

export class MemoryPurchases extends MemoryBase implements PurchaseStore {
  async addPurchase(p: PurchaseRow): Promise<boolean> {
    if (this.purchaseRows.some((x) => x.store === p.store && x.transactionId === p.transactionId)) return false;
    this.purchaseRows.push(clone(p));
    return true;
  }
  async getPurchase(store: string, transactionId: string): Promise<PurchaseRow | null> {
    const p = this.purchaseRows.find((x) => x.store === store && x.transactionId === transactionId);
    return p ? clone(p) : null;
  }
  async purchaseByRef(store: string, ref: string): Promise<PurchaseRow | null> {
    const p = this.purchaseRows.find((x) => x.store === store && x.ref === ref);
    return p ? clone(p) : null;
  }
  async purchasesOf(playerId: string, limit: number): Promise<PurchaseRow[]> {
    return this.purchaseRows
      .filter((p) => p.playerId === playerId)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(clone);
  }
  async storefrontPurchases(storefronts: string[], before: number): Promise<PurchaseRow[]> {
    const want = new Set(storefronts.map((f) => f.toUpperCase()));
    return this.purchaseRows
      .filter((p) => p.at <= before && want.has(String(p.storefront ?? '').toUpperCase()))
      .sort((a, b) => a.at - b.at)
      .map(clone);
  }
  async setPurchaseStatus(store: string, transactionId: string, status: PurchaseRow['status'], at: number): Promise<boolean> {
    const p = this.purchaseRows.find((x) => x.store === store && x.transactionId === transactionId);
    if (!p || p.status === status) return false;
    p.status = status;
    p.refundedAt = status === 'refunded' ? at : null;
    return true;
  }
  async spentCents(playerId: string, since: number, now: number): Promise<number> {
    const bought = this.purchaseRows.filter((p) => p.playerId === playerId && p.status === 'credited' && p.at >= since).reduce((s, p) => s + p.cents, 0);
    const held = this.intentRows.filter((i) => i.playerId === playerId && !i.used && i.holdUntil > now).reduce((s, i) => s + i.cents, 0);
    return bought + held;
  }
  async linkedPurchases(playerId: string, devices: string[], since: number): Promise<PurchaseRow[]> {
    const devs = new Set(devices);
    const shared = new Set([...this.villageRows.values()].filter((v) => Object.keys(v.deviceSeqs ?? {}).some((d) => devs.has(d))).map((v) => v.playerId));
    return this.purchaseRows
      .filter((p) => p.at >= since && (p.playerId === playerId || (p.device && devs.has(p.device)) || shared.has(p.playerId)))
      .sort((a, b) => b.at - a.at)
      .slice(0, 500)
      .map(clone);
  }
  async testCentsSince(since: number): Promise<number> {
    return this.purchaseRows.filter((p) => p.environment !== 'Production' && p.at >= since).reduce((s, p) => s + p.cents, 0);
  }
  async noteStoreNotification(n: { id: string; store: string; ref: string | null; type: string; signedAt: number; receivedAt: number }): Promise<{ duplicate: boolean; newerAt: number | null }> {
    if (this.storeNoticeRows.some((x) => x.id === n.id)) return { duplicate: true, newerAt: null };
    const others = n.ref ? this.storeNoticeRows.filter((x) => x.store === n.store && x.ref === n.ref && STATE_NOTICES.has(x.type)).map((x) => x.signedAt) : [];
    this.storeNoticeRows.push({ ...n });
    return { duplicate: false, newerAt: others.length ? Math.max(...others) : null };
  }
  async putPushToken(t: Omit<PushToken, 'day' | 'sent'>): Promise<void> {
    const old = this.pushRows.find((x) => x.token === t.token);
    this.pushRows = this.pushRows.filter((x) => x.token !== t.token);
    this.pushRows.push({ ...clone(t), day: old?.playerId === t.playerId ? old.day : 0, sent: old?.playerId === t.playerId ? old.sent : 0 });
  }
  async pushTokensOf(playerId: string): Promise<PushToken[]> {
    return this.pushRows.filter((t) => t.playerId === playerId).map(clone);
  }
  async removePushToken(token: string): Promise<void> {
    this.pushRows = this.pushRows.filter((t) => t.token !== token);
  }
  async countPush(token: string, day: number): Promise<void> {
    const t = this.pushRows.find((x) => x.token === token);
    if (!t) return;
    if (t.day !== day) Object.assign(t, { day, sent: 0 });
    t.sent++;
  }
  async playersByIds(ids: string[]): Promise<Player[]> {
    return ids.map((id) => this.players.get(id)).filter((p): p is Player => Boolean(p)).map(clone);
  }
  private powerOf(p: Player, beta: number): number {
    return (p.ratings?.attack.rating ?? 1500) + beta * (Math.max(1, p.hallLevel) - 1);
  }
  async topByPower(limit: number, minBattles: number, beta: number): Promise<Player[]> {
    return [...this.players.values()]
      .filter((p) => p.base && !p.bannedUntil && (p.ratings?.attack.battles ?? 0) >= minBattles)
      .sort((a, b) => this.powerOf(b, beta) - this.powerOf(a, beta) || a.createdAt - b.createdAt)
      .slice(0, limit)
      .map(clone);
  }
  async powerValues(minBattles: number, beta: number): Promise<number[]> {
    return [...this.players.values()].filter((p) => p.base && !p.bannedUntil && (p.ratings?.attack.battles ?? 0) >= minBattles).map((p) => this.powerOf(p, beta));
  }
  async powerRankOf(power: number, minBattles: number, beta: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => p.base && !p.bannedUntil && (p.ratings?.attack.battles ?? 0) >= minBattles && this.powerOf(p, beta) > power).length;
  }
  async rankedPlayers(): Promise<{ id: string; trophies: number; createdAt: number }[]> {
    return [...this.players.values()].filter((p) => p.base && !p.bannedUntil).map((p) => ({ id: p.id, trophies: p.trophies, createdAt: p.createdAt }));
  }}
