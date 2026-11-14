/** In-memory names, friends and friendly duels (part of `SocialStore`). */

import type { Player, DuelRecord, DuelTally, DuelChallenge, Squad, FriendRequest } from '../types';
import { MemoryBase, clone } from './base';

export class MemoryFriends extends MemoryBase {
  async playerByFriendCode(code: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.friendCode === code) return clone(p);
    return null;
  }
  async nameHold(key: string, now: number): Promise<{ playerId: string; until: number } | null> {
    const h = this.nameHolds.get(key);
    return h && h.until > now ? { ...h } : null;
  }
  async holdName(key: string, playerId: string, until: number): Promise<void> {
    this.nameHolds.set(key, { playerId, until });
  }
  async playersWithoutNameKey(limit: number): Promise<Player[]> {
    return [...this.players.values()]
      .filter((p) => !p.nameKey)
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map(clone);
  }
  async addFriendship(a: string, b: string, at: number): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    if (!this.friendshipRows.some((f) => f.a === x && f.b === y)) this.friendshipRows.push({ a: x, b: y, since: at });
  }
  async removeFriendship(a: string, b: string): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    this.friendshipRows = this.friendshipRows.filter((f) => !(f.a === x && f.b === y));
  }
  async friendsOf(playerId: string): Promise<{ id: string; since: number }[]> {
    return this.friendshipRows.filter((f) => f.a === playerId || f.b === playerId).map((f) => ({ id: f.a === playerId ? f.b : f.a, since: f.since }));
  }
  async addFriendRequest(r: FriendRequest): Promise<void> {
    this.friendRequestRows.push(clone(r));
  }
  async getFriendRequest(id: string): Promise<FriendRequest | null> {
    const r = this.friendRequestRows.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async friendRequestsOf(playerId: string, since: number): Promise<FriendRequest[]> {
    return this.friendRequestRows.filter((r) => (r.fromId === playerId || r.toId === playerId) && r.at > since).map(clone);
  }
  async deleteFriendRequest(id: string): Promise<void> {
    this.friendRequestRows = this.friendRequestRows.filter((r) => r.id !== id);
  }
  async deleteFriendRequestsBetween(a: string, b: string): Promise<void> {
    this.friendRequestRows = this.friendRequestRows.filter((r) => !((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)));
  }
  async pruneFriendRequests(before: number): Promise<number> {
    const n = this.friendRequestRows.length;
    this.friendRequestRows = this.friendRequestRows.filter((r) => r.at >= before);
    return n - this.friendRequestRows.length;
  }
  async addDuel(d: DuelRecord): Promise<void> {
    this.duelRows.push(clone(d));
  }
  async duelsOf(playerId: string, since: number, limit: number): Promise<DuelRecord[]> {
    return this.duelRows
      .filter((d) => (d.attackerId === playerId || d.defenderId === playerId) && d.at > since)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(clone);
  }
  async bumpDuelTally(attackerId: string, defenderId: string, won: boolean, stars: number, destruction: number): Promise<void> {
    let t = this.duelTallyRows.find((x) => x.attackerId === attackerId && x.defenderId === defenderId);
    if (!t) this.duelTallyRows.push((t = { attackerId, defenderId, duels: 0, wins: 0, bestStars: 0, bestDestruction: 0 }));
    t.duels++;
    if (won) t.wins++;
    t.bestStars = Math.max(t.bestStars, stars);
    t.bestDestruction = Math.max(t.bestDestruction, destruction);
  }
  async duelTallies(playerId: string): Promise<DuelTally[]> {
    return this.duelTallyRows.filter((t) => t.attackerId === playerId || t.defenderId === playerId).map(clone);
  }
  async addChallenge(c: DuelChallenge): Promise<void> {
    this.challengeRows.push(clone(c));
  }
  async getChallenge(id: string): Promise<DuelChallenge | null> {
    const c = this.challengeRows.find((x) => x.id === id);
    return c ? clone(c) : null;
  }
  async challengesOf(playerId: string, since: number): Promise<DuelChallenge[]> {
    return this.challengeRows.filter((c) => (c.fromId === playerId || c.toId === playerId) && c.createdAt > since).map(clone);
  }
  async setChallengeResult(id: string, side: 'from' | 'to', r: { stars: number; destruction: number }): Promise<boolean> {
    const c = this.challengeRows.find((x) => x.id === id);
    const key = side === 'from' ? 'fromResult' : 'toResult';
    if (!c || c[key]) return false;
    c[key] = { ...r };
    return true;
  }
  async pruneDuels(before: number): Promise<number> {
    const n = this.duelRows.length + this.challengeRows.length;
    this.duelRows = this.duelRows.filter((d) => d.at >= before);
    this.challengeRows = this.challengeRows.filter((c) => c.expiresAt >= before);
    return n - this.duelRows.length - this.challengeRows.length;
  }
  async createSquad(s: Squad): Promise<void> {
    this.squadRows.set(s.id, clone(s));
  }}
