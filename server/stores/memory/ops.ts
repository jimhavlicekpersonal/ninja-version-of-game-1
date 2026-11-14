/** In-memory play statistics, purchase intents, age answers, import holds and complaints (`OpsStore`). */

import type { StatsInstallSummary, StatsDailyRow, PurchaseIntent, ImportHold, Complaint } from '../types';
import type { OpsStore } from '../ports';
import { MemoryBase, clone } from './base';

export class MemoryOps extends MemoryBase implements OpsStore {
  async addStatsEvents(install: string, build: string, arm: string, events: import('../../../src/backend/net/stats').StatsEvent[], receivedAt: number): Promise<number> {
    for (const e of events) this.statsRows.push({ install, day: Math.floor(e.at / 86_400_000), name: e.name, at: e.at, props: clone(e.props), build, arm, receivedAt });
    return events.length;
  }
  async deleteStats(install: string): Promise<number> {
    const before = this.statsRows.length;
    this.statsRows = this.statsRows.filter((r) => r.install !== install);
    return before - this.statsRows.length;
  }
  async statsInstalls(fromDay: number, toDay: number): Promise<StatsInstallSummary[]> {
    const by = new Map<string, typeof this.statsRows>();
    for (const r of this.statsRows) by.set(r.install, [...(by.get(r.install) ?? []), r]);
    const out: StatsInstallSummary[] = [];
    for (const [install, rows] of by) {
      rows.sort((a, b) => a.at - b.at);
      const firstDay = Math.min(...rows.map((r) => r.day));
      if (firstDay < fromDay || firstDay > toDay) continue;
      const firstOf = (name: string) => rows.find((r) => r.name === name)?.at ?? null;
      out.push({
        install,
        arm: rows[0].arm,
        firstDay,
        firstAt: rows[0].at,
        days: [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b),
        tutorialDone: rows.some((r) => r.name === 'tutorial_step' && r.props.done === true),
        firstRaidAt: firstOf('raid_end'),
        firstPurchaseAt: firstOf('purchase'),
      });
    }
    return out;
  }
  async putStatsDaily(fromDay: number, toDay: number, rows: StatsDailyRow[]): Promise<void> {
    this.statsDailyRows = [...this.statsDailyRows.filter((r) => r.day < fromDay || r.day > toDay), ...clone(rows)];
  }
  async statsDaily(fromDay: number, toDay: number): Promise<StatsDailyRow[]> {
    return clone(this.statsDailyRows.filter((r) => r.day >= fromDay && r.day <= toDay).sort((a, b) => a.day - b.day || a.arm.localeCompare(b.arm)));
  }
  async pruneStats(before: number): Promise<number> {
    const n = this.statsRows.length;
    this.statsRows = this.statsRows.filter((r) => r.receivedAt >= before);
    return n - this.statsRows.length;
  }
  async holdIntent(id: string, playerId: string, holdUntil: number): Promise<boolean> {
    const i = this.intentRows.find((x) => x.id === id && x.playerId === playerId && !x.used);
    if (!i || i.holdUntil === holdUntil) return false;
    i.holdUntil = holdUntil;
    return true;
  }
  async getAgeGroup(playerId: string): Promise<{ under18: boolean; at: number } | null> {
    const a = this.ageRows.get(playerId);
    return a ? { ...a } : null;
  }
  async setAgeGroup(playerId: string, under18: boolean | null, at: number): Promise<void> {
    if (under18 === null) this.ageRows.delete(playerId);
    else this.ageRows.set(playerId, { ...this.ageRows.get(playerId), under18, at });
  }
  async resolveImportHold(id: string, playerId: string): Promise<boolean> {
    const h = this.importHoldRows.find((x) => x.id === id && x.playerId === playerId && x.status === 'held');
    if (!h) return false;
    h.status = 'resolved';
    return true;
  }
  async addComplaint(c: Complaint): Promise<void> {
    this.complaintRows.push(clone(c));
  }
  async complaints(status: 'open' | 'all', limit: number): Promise<Complaint[]> {
    return this.complaintRows.filter((c) => status === 'all' || c.status === 'open').slice(0, limit).map(clone);
  }
  async resolveComplaint(id: string, resolution: string, at: number): Promise<boolean> {
    const c = this.complaintRows.find((x) => x.id === id && x.status === 'open');
    if (!c) return false;
    Object.assign(c, { status: 'done', resolution, resolvedAt: at });
    return true;
  }
  async addImportHold(h: ImportHold): Promise<void> {
    this.importHoldRows.push(clone(h));
  }
  async importHoldsOf(playerId: string): Promise<ImportHold[]> {
    return clone(this.importHoldRows.filter((h) => h.playerId === playerId).reverse());
  }
  async addIntent(i: PurchaseIntent): Promise<void> {
    this.intentRows.push(clone(i));
  }
  async getIntent(id: string): Promise<PurchaseIntent | null> {
    const i = this.intentRows.find((x) => x.id === id);
    return i ? clone(i) : null;
  }
  async useIntent(id: string): Promise<void> {
    const i = this.intentRows.find((x) => x.id === id);
    if (i) i.used = true;
  }}
