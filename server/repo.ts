/** Storage for the PvP server. Postgres in production, memory in tests and local dev. */
import type { BaseLayout, BattleResult, Deployment } from '../src/sim/battle/types';

export interface Player {
  id: string;
  name: string;
  tokenHash: string;
  trophies: number;
  hallLevel: number;
  shieldUntil: number;
  base: BaseLayout | null;
  createdAt: number;
  updatedAt: number;
}

export interface Ticket {
  id: string;
  attackerId: string;
  defenderId: string;
  base: BaseLayout;
  defenderTrophies: number;
  createdAt: number;
  used: boolean;
}

export interface AttackRecord {
  id: string;
  at: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  seed: number;
  army: Record<string, number>;
  /** Attacker's troop levels (absent on records from before troop research). */
  levels?: Record<string, number>;
  base: BaseLayout;
  deployments: Deployment[];
  endTick?: number;
  result: BattleResult;
  attackerTrophies: number;
  defenderTrophies: number;
}

export interface Repo {
  createPlayer(p: Player): Promise<void>;
  playerByTokenHash(hash: string): Promise<Player | null>;
  getPlayer(id: string): Promise<Player | null>;
  updatePlayer(id: string, patch: Partial<Pick<Player, 'name' | 'trophies' | 'hallLevel' | 'shieldUntil' | 'base' | 'updatedAt'>>): Promise<void>;
  /** Players with a base, not shielded, trophies in range, excluding some ids. */
  findOpponents(opts: { excludeIds: string[]; minTrophies: number; maxTrophies: number; now: number; limit: number }): Promise<Player[]>;
  createTicket(t: Ticket): Promise<void>;
  getTicket(id: string): Promise<Ticket | null>;
  /** Marks a ticket used; returns false if it already was (prevents double submits). */
  useTicket(id: string): Promise<boolean>;
  addAttack(a: AttackRecord): Promise<void>;
  defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]>;
  recentTargets(attackerId: string, since: number): Promise<string[]>;
}

export class MemoryRepo implements Repo {
  players = new Map<string, Player>();
  tickets = new Map<string, Ticket>();
  attacks: AttackRecord[] = [];

  async createPlayer(p: Player): Promise<void> {
    this.players.set(p.id, structuredClone(p));
  }
  async playerByTokenHash(hash: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.tokenHash === hash) return structuredClone(p);
    return null;
  }
  async getPlayer(id: string): Promise<Player | null> {
    const p = this.players.get(id);
    return p ? structuredClone(p) : null;
  }
  async updatePlayer(id: string, patch: Partial<Player>): Promise<void> {
    const p = this.players.get(id);
    if (p) Object.assign(p, structuredClone(patch));
  }
  async findOpponents(o: { excludeIds: string[]; minTrophies: number; maxTrophies: number; now: number; limit: number }): Promise<Player[]> {
    return [...this.players.values()]
      .filter((p) => p.base && !o.excludeIds.includes(p.id) && p.shieldUntil <= o.now && p.trophies >= o.minTrophies && p.trophies <= o.maxTrophies)
      .slice(0, o.limit)
      .map((p) => structuredClone(p));
  }
  async createTicket(t: Ticket): Promise<void> {
    this.tickets.set(t.id, structuredClone(t));
  }
  async getTicket(id: string): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    return t ? structuredClone(t) : null;
  }
  async useTicket(id: string): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.used) return false;
    t.used = true;
    return true;
  }
  async addAttack(a: AttackRecord): Promise<void> {
    this.attacks.push(structuredClone(a));
  }
  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    return this.attacks.filter((a) => a.defenderId === defenderId && a.at > since).slice(-limit).map((a) => structuredClone(a));
  }
  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return this.attacks.filter((a) => a.attackerId === attackerId && a.at > since).map((a) => a.defenderId);
  }
}
