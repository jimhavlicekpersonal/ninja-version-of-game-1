/** In-memory server-held villages, their ledger and command log (`VillageStore`). */

import type { VillageRow, LedgerEntry, CommandLogRow } from '../types';
import type { VillageStore } from '../ports';
import { MemoryBase, clone } from './base';

export class MemoryVillages extends MemoryBase implements VillageStore {
  async getVillage(playerId: string): Promise<VillageRow | null> {
    const v = this.villageRows.get(playerId);
    return v ? clone(v) : null;
  }
  async createVillage(v: VillageRow): Promise<boolean> {
    if (this.villageRows.has(v.playerId) || !this.players.has(v.playerId)) return false;
    this.villageRows.set(v.playerId, clone(v));
    return true;
  }
  async saveVillage(v: VillageRow, expectedRevision: number, ledger: LedgerEntry[], commands: CommandLogRow[]): Promise<boolean> {
    const cur = this.villageRows.get(v.playerId);
    if (!cur || cur.revision !== expectedRevision) return false;
    this.villageRows.set(v.playerId, clone(v));
    this.ledgerRows.push(...clone(ledger));
    for (const c of commands) {
      this.commandRows = this.commandRows.filter((x) => !(x.playerId === c.playerId && x.seq === c.seq));
      this.commandRows.push(clone(c));
    }
    return true;
  }
  async recordVillageCommands(v: Pick<VillageRow, 'playerId' | 'revision' | 'seq' | 'updatedAt' | 'deviceSeqs'>, expectedRevision: number, commands: CommandLogRow[]): Promise<boolean> {
    const cur = this.villageRows.get(v.playerId);
    if (!cur || cur.revision !== expectedRevision) return false;
    this.villageRows.set(v.playerId, { ...cur, revision: v.revision, seq: v.seq, updatedAt: v.updatedAt, ...(v.deviceSeqs ? { deviceSeqs: clone(v.deviceSeqs) } : {}) });
    for (const c of commands) {
      this.commandRows = this.commandRows.filter((x) => !(x.playerId === c.playerId && x.seq === c.seq));
      this.commandRows.push(clone(c));
    }
    return true;
  }
  async ledgerOf(playerId: string, limit: number): Promise<LedgerEntry[]> {
    return this.ledgerRows
      .filter((l) => l.playerId === playerId)
      .slice(-limit)
      .reverse()
      .map(clone);
  }
  async balanceAt(playerId: string, resource: string, at: number): Promise<number | null> {
    let found: LedgerEntry | null = null;
    for (const l of this.ledgerRows) if (l.playerId === playerId && l.resource === resource && l.at <= at && (!found || l.at >= found.at)) found = l;
    return found ? found.balance : null;
  }
  async commandsOf(playerId: string, sinceSeq: number, limit: number): Promise<CommandLogRow[]> {
    return this.commandRows
      .filter((c) => c.playerId === playerId && c.seq > sinceSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map(clone);
  }}
