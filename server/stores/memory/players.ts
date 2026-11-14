/** In-memory players, sessions, staff tools, account protections and deletion (`PlayerStore`). */
import type { AgeBand } from '../../../src/gameplay/sim/age';
import { noticesNaming } from '../notices';
import { NameTakenError, REVOKED_TOKEN_PREFIX, DELETED_PLAYER } from '../types';
import type { Player, PlayerPatch, StaffAction, IdentityLink, PlayerNotice, TokenRow, TokenRotation, DeletionRequest, OpponentQuery } from '../types';
import type { PlayerStore } from '../ports';
import { MemoryBase, clone } from './base';

export class MemoryPlayers extends MemoryBase implements PlayerStore {
  async createPlayer(p: Player): Promise<void> {
    if (p.nameKey && [...this.players.values()].some((x) => x.nameKey === p.nameKey)) throw new NameTakenError();
    this.players.set(p.id, clone(p));
  }
  async playerByTokenHash(hash: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.tokenHash === hash) return clone(p);
    const t = this.tokenRows.find((x) => x.tokenHash === hash);
    const p = t ? this.players.get(t.playerId) : undefined;
    return p ? clone(p) : null;
  }
  async addToken(playerId: string, tokenHash: string, at: number, label: string, provider?: string): Promise<void> {
    this.tokenRows.push({ tokenHash, playerId, createdAt: at, label, provider: provider ?? null, lastUsedAt: null });
  }
  async linksOf(playerId: string): Promise<IdentityLink[]> {
    return this.linkRows.filter((l) => l.playerId === playerId).map(clone);
  }
  async playerByIdentity(provider: string, subject: string): Promise<string | null> {
    return this.linkRows.find((l) => l.provider === provider && l.subject === subject)?.playerId ?? null;
  }
  async addLink(l: IdentityLink): Promise<boolean> {
    if (this.linkRows.some((x) => (x.provider === l.provider && x.subject === l.subject) || (x.playerId === l.playerId && x.provider === l.provider))) return false;
    this.linkRows.push(clone(l));
    return true;
  }
  async removeLink(playerId: string, provider: string): Promise<void> {
    this.linkRows = this.linkRows.filter((l) => !(l.playerId === playerId && l.provider === provider));
  }
  async searchPlayers(q: string, limit: number): Promise<Player[]> {
    const lower = q.toLowerCase();
    return [...this.players.values()]
      .filter((p) => p.id === q || p.name.toLowerCase().startsWith(lower))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(clone);
  }
  async addStaffAction(a: StaffAction): Promise<void> {
    this.staffRows.push(clone(a));
  }
  async staffActions(playerId: string | null, limit: number): Promise<StaffAction[]> {
    return this.staffRows
      .filter((a) => playerId === null || a.playerId === playerId)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(clone);
  }
  async getPlayer(id: string): Promise<Player | null> {
    const p = this.players.get(id);
    return p ? clone(p) : null;
  }
  async updatePlayer(id: string, patch: PlayerPatch): Promise<void> {
    const p = this.players.get(id);
    if (patch.nameKey !== undefined && [...this.players.values()].some((x) => x.id !== id && x.nameKey === patch.nameKey)) throw new NameTakenError();
    if (patch.friendCode && [...this.players.values()].some((x) => x.id !== id && x.friendCode === patch.friendCode)) throw new NameTakenError();
    if (p) Object.assign(p, clone(patch));
  }
  async findOpponents(q: OpponentQuery): Promise<Player[]> {
    const since = q.lockedSince;
    const locked = new Set(since === null ? [] : [...this.tickets.values()].filter((t) => !t.used && t.defenderId && t.createdAt > since).map((t) => t.defenderId));
    return [...this.players.values()]
      .filter((p) => p.base && !p.bannedUntil && !q.excludeIds.includes(p.id) && !locked.has(p.id) && p.shieldUntil <= q.now)
      .filter((p) => p.hallLevel >= q.minHall && p.hallLevel <= q.maxHall && p.trophies >= q.minTrophies && p.trophies <= q.maxTrophies)
      .slice(0, q.limit)
      .map(clone);
  }
  async topPlayers(limit: number): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.base && !p.bannedUntil).sort((a, b) => b.trophies - a.trophies || a.createdAt - b.createdAt).slice(0, limit).map(clone);
  }
  async rankOf(trophies: number): Promise<number> {
    return 1 + [...this.players.values()].filter((p) => p.base && !p.bannedUntil && p.trophies > trophies).length;
  }
  async deletePlayer(id: string, name: string, at: number): Promise<void> {
    const D = DELETED_PLAYER;
    for (const [k, t] of this.tickets) {
      if (t.attackerId === id) this.tickets.delete(k);
      else if (t.defenderId === id) t.defenderId = null;
    }
    this.attacks = this.attacks.filter((a) => a.defenderId !== id);
    for (const a of this.attacks) if (a.attackerId === id) Object.assign(a, { attackerId: D.id, attackerName: D.name });
    this.memberRows = this.memberRows.filter((m) => m.playerId !== id);
    const notices = noticesNaming(name);
    this.chatRows = this.chatRows.filter((c) => c.playerId !== id && !(c.kind === 'system' && c.playerId === null && notices(c.text)));
    const giftNote = ` to ${name}.`;
    for (const c of this.chatRows) if (c.kind === 'donation' && c.text.endsWith(giftNote)) c.text = `${c.text.slice(0, -giftNote.length)} to ${D.name}.`;
    this.donations = this.donations.filter((d) => d.toId !== id);
    for (const d of this.donations) if (d.fromId === id) Object.assign(d, { fromId: D.id, fromName: D.name });
    for (const [k, r] of this.requestRows) if (r.playerId === id) this.requestRows.delete(k);
    for (const a of this.raidAttackRows) if (a.attackerId === id) a.attackerId = D.id;
    this.claims = this.claims.filter((c) => c.playerId !== id);
    for (const p of this.pairings) {
      for (const e of p.roster) if (e.playerId === id) Object.assign(e, { playerId: null, name: D.name, base: { ...e.base, name: D.name } });
    }
    // Blocks either way go; their own reports go; reports about them are closed and lose the evidence text.
    this.blockRows = this.blockRows.filter((b) => b.playerId !== id && b.blockedId !== id);
    // Friends and requests go. Name holds stay, held by nobody (report section 5 step 7, backend A12): a
    // deleted player's names are not free at once for someone to pose as them (account.ts holds the current one).
    this.friendshipRows = this.friendshipRows.filter((f) => f.a !== id && f.b !== id);
    this.friendRequestRows = this.friendRequestRows.filter((r) => r.fromId !== id && r.toId !== id);
    for (const h of this.nameHolds.values()) if (h.playerId === id) h.playerId = D.id;
    // Duels, tallies and challenges either way; Gang membership and invites (the core hands leadership over first).
    this.duelRows = this.duelRows.filter((d) => d.attackerId !== id && d.defenderId !== id);
    this.duelTallyRows = this.duelTallyRows.filter((t) => t.attackerId !== id && t.defenderId !== id);
    this.challengeRows = this.challengeRows.filter((c) => c.fromId !== id && c.toId !== id);
    this.squadMemberRows = this.squadMemberRows.filter((m) => m.playerId !== id);
    this.squadInviteRows = this.squadInviteRows.filter((i) => i.toId !== id && i.fromId !== id);
    // Gang War rosters keep the base (the war's score depends on it) without the player.
    for (const w of this.warRows.values()) for (const e of [...w.a.roster, ...w.b.roster]) if (e.playerId === id) Object.assign(e, { playerId: null, name: DELETED_PLAYER.name });
    this.gangClaimRows = this.gangClaimRows.filter((c) => c.playerId !== id);
    // Report section 5 step 7 (backend A12): stored idempotent answers (a village import's answer holds the
    // whole village) go with the account, not a day later. Their scope is the token's hash (first 32 hex).
    const scopes = new Set([this.players.get(id)?.tokenHash, ...this.tokenRows.filter((t) => t.playerId === id).map((t) => t.tokenHash)].filter((h): h is string => Boolean(h)).map((h) => h.slice(0, 32)));
    for (const k of [...this.idempotencyRows.keys()]) if (scopes.has(k.split('\u0000')[0])) this.idempotencyRows.delete(k);
    // A server-held village, its ledger and command log, other devices' tokens and linked sign-ins are only theirs.
    this.villageRows.delete(id);
    this.tokenRows = this.tokenRows.filter((t) => t.playerId !== id);
    this.rotationRows = this.rotationRows.filter((r) => r.playerId !== id);
    this.linkRows = this.linkRows.filter((l) => l.playerId !== id);
    this.deletionCodeRows.delete(id);
    this.noticeRows = this.noticeRows.filter((n) => n.playerId !== id);
    this.intentRows = this.intentRows.filter((i) => i.playerId !== id);
    this.ageRows.delete(id);
    this.importHoldRows = this.importHoldRows.filter((h) => h.playerId !== id);
    for (const c of this.complaintRows) if (c.playerId === id) c.playerId = null;
    this.pushRows = this.pushRows.filter((t) => t.playerId !== id);
    // Purchase records are financial records (refunds, tax): kept, no longer tied to the player.
    for (const p of this.purchaseRows) if (p.playerId === id) p.playerId = D.id;
    this.ledgerRows = this.ledgerRows.filter((l) => l.playerId !== id);
    this.commandRows = this.commandRows.filter((c) => c.playerId !== id);
    this.reportRows = this.reportRows.filter((r) => r.reporterId !== id);
    for (const r of this.reportRows) {
      if (r.targetId !== id) continue;
      Object.assign(r, { targetId: D.id, targetName: D.name, text: null });
      if (r.status === 'open') Object.assign(r, { status: 'dismissed', resolution: 'Account deleted.', resolvedAt: at });
    }
    this.players.delete(id);
  }
  async addDeletionRequest(r: DeletionRequest): Promise<void> {
    this.deletionRows.push(clone(r));
  }
  async getAgeBand(playerId: string): Promise<{ band: AgeBand | null; under18: boolean; at: number } | null> {
    const a = this.ageRows.get(playerId);
    return a ? { band: a.band ?? null, under18: a.under18, at: a.at } : null;
  }
  async setAgeBand(playerId: string, band: AgeBand, at: number): Promise<void> {
    this.ageRows.set(playerId, { under18: band !== 'adult', band, at });
  }
  async touchToken(tokenHash: string, at: number): Promise<void> {
    const t = this.tokenRows.find((x) => x.tokenHash === tokenHash);
    if (t) t.lastUsedAt = at;
  }
  async revokeTokens(playerId: string, provider: string, except?: string): Promise<number> {
    const before = this.tokenRows.length;
    this.tokenRows = this.tokenRows.filter((t) => !(t.playerId === playerId && t.provider === provider && t.tokenHash !== except));
    return before - this.tokenRows.length;
  }
  async revokeOtherTokens(playerId: string, keepHash: string): Promise<number> {
    const p = this.players.get(playerId);
    if (!p) return 0;
    const mine = this.tokenRows.filter((t) => t.playerId === playerId);
    if (p.tokenHash !== keepHash && !mine.some((t) => t.tokenHash === keepHash)) return 0;
    let n = mine.filter((t) => t.tokenHash !== keepHash).length;
    if (p.tokenHash !== keepHash) {
      p.tokenHash = keepHash;
      n += 1;
    }
    this.tokenRows = this.tokenRows.filter((t) => t.playerId !== playerId);
    return n;
  }
  async replaceToken(playerId: string, oldHash: string, newHash: string): Promise<boolean> {
    const p = this.players.get(playerId);
    if (!p) return false;
    if (p.tokenHash === oldHash) {
      p.tokenHash = newHash;
      return true;
    }
    const t = this.tokenRows.find((x) => x.playerId === playerId && x.tokenHash === oldHash);
    if (!t) return false;
    t.tokenHash = newHash;
    return true;
  }
  async dormantPlayers(seenBefore: number, maxKeep: number, limit: number): Promise<string[]> {
    return [...this.players.values()]
      .filter(
        (p) =>
          p.lastSeenAt < seenBefore &&
          p.id !== DELETED_PLAYER.id &&
          !p.staff &&
          !(p.bannedUntil ?? 0) &&
          !this.purchaseRows.some((x) => x.playerId === p.id) &&
          !this.linkRows.some((l) => l.playerId === p.id) &&
          (!this.villageRows.has(p.id) || p.hallLevel <= maxKeep),
      )
      .sort((a, b) => a.lastSeenAt - b.lastSeenAt)
      .slice(0, limit)
      .map((p) => p.id);
  }
  async addNonce(nonce: string, expiresAt: number): Promise<void> {
    this.nonceRows.set(nonce, expiresAt);
  }
  async useNonce(nonce: string, now: number): Promise<boolean> {
    const exp = this.nonceRows.get(nonce);
    this.nonceRows.delete(nonce);
    return exp !== undefined && exp > now;
  }
  async pruneTokens(unusedBefore: number): Promise<number> {
    const before = this.tokenRows.length;
    const used = (t: TokenRow) => t.lastUsedAt ?? t.createdAt;
    // The newest device token of an account with no other way in (first token signed out, no link) stays.
    const lastKey = (t: TokenRow) => {
      const p = this.players.get(t.playerId);
      if (p && !p.tokenHash.startsWith(REVOKED_TOKEN_PREFIX)) return false;
      if (this.linkRows.some((l) => l.playerId === t.playerId)) return false;
      const newest = this.tokenRows.filter((x) => x.playerId === t.playerId).sort((a, b) => used(b) - used(a) || (a.tokenHash < b.tokenHash ? -1 : 1))[0];
      return newest === t;
    };
    this.tokenRows = this.tokenRows.filter((t) => used(t) >= unusedBefore || lastKey(t));
    return before - this.tokenRows.length;
  }
  async keysOf(playerId: string): Promise<{ main: string | null; devices: { hash: string; provider: string | null }[] }> {
    const p = this.players.get(playerId);
    return {
      main: p && !p.tokenHash.startsWith(REVOKED_TOKEN_PREFIX) ? p.tokenHash : null,
      devices: this.tokenRows.filter((t) => t.playerId === playerId).map((t) => ({ hash: t.tokenHash, provider: t.provider ?? null })),
    };
  }
  async addRotation(r: TokenRotation): Promise<void> {
    this.rotationRows.push(clone(r));
  }
  async rotationOf(newHash: string): Promise<TokenRotation | null> {
    const r = this.rotationRows.find((x) => x.newHash === newHash);
    return r ? clone(r) : null;
  }
  async dropRotations(oldHash: string): Promise<number> {
    const before = this.rotationRows.length;
    this.rotationRows = this.rotationRows.filter((r) => r.oldHash !== oldHash);
    return before - this.rotationRows.length;
  }
  async pruneRotations(before: number): Promise<number> {
    const n = this.rotationRows.length;
    this.rotationRows = this.rotationRows.filter((r) => r.at >= before);
    return n - this.rotationRows.length;
  }
  async setLinkToken(provider: string, subject: string, refreshToken: string | null, clientId: string | null): Promise<void> {
    const l = this.linkRows.find((x) => x.provider === provider && x.subject === subject);
    if (l) Object.assign(l, { refreshToken, clientId });
  }
  async linkTokensOf(playerId: string): Promise<{ provider: string; subject: string; refreshToken: string; clientId: string | null }[]> {
    return this.linkRows.filter((l) => l.playerId === playerId && l.refreshToken).map((l) => ({ provider: l.provider, subject: l.subject, refreshToken: l.refreshToken!, clientId: l.clientId ?? null }));
  }
  async setDeletionCode(playerId: string, codeHash: string, at: number, expiresAt: number): Promise<void> {
    this.deletionCodeRows.set(playerId, { codeHash, createdAt: at, expiresAt });
  }
  async deletionCodeOf(playerId: string): Promise<{ codeHash: string; expiresAt: number } | null> {
    const c = this.deletionCodeRows.get(playerId);
    return c ? { codeHash: c.codeHash, expiresAt: c.expiresAt } : null;
  }
  async clearDeletionCode(playerId: string): Promise<void> {
    this.deletionCodeRows.delete(playerId);
  }
  async addNotice(n: PlayerNotice): Promise<void> {
    if (this.players.has(n.playerId)) this.noticeRows.push(clone(n));
  }
  async noticesOf(playerId: string, limit: number): Promise<PlayerNotice[]> {
    return this.noticeRows.filter((n) => n.playerId === playerId).sort((a, b) => b.at - a.at).slice(0, limit).map(clone);
  }
  async markNoticesRead(playerId: string, ids: string[]): Promise<void> {
    const set = new Set(ids);
    for (const n of this.noticeRows) if (n.playerId === playerId && set.has(n.id)) n.read = true;
  }
  async deletionRequests(status: 'open' | 'all', limit: number): Promise<DeletionRequest[]> {
    return this.deletionRows.filter((r) => status === 'all' || r.status === 'open').slice(0, limit).map(clone);
  }
  async getDeletionRequest(id: string): Promise<DeletionRequest | null> {
    const r = this.deletionRows.find((x) => x.id === id);
    return r ? clone(r) : null;
  }
  async resolveDeletionRequest(id: string, status: 'done' | 'rejected', resolution: string, at: number): Promise<boolean> {
    const r = this.deletionRows.find((x) => x.id === id);
    if (!r || r.status !== 'open') return false;
    Object.assign(r, { status, resolution, resolvedAt: at });
    return true;
  }}
