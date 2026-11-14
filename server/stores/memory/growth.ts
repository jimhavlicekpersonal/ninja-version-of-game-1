/** In-memory referrals, shared replays and statistics summaries (`GrowthStore`, growth batch 2026-11-14). */
import type { InstallSummaryRow, ReferralRow, SharedReplayRow } from '../types';
import type { GrowthStore } from '../ports';
import { MemoryBase, clone } from './base';

export class MemoryGrowth extends MemoryBase implements GrowthStore {
  async addReferral(r: ReferralRow) {
    if (this.referralRows.some((x) => x.recruitId === r.recruitId)) return false;
    this.referralRows.push(clone(r));
    return true;
  }
  async referralOf(recruitId: string) {
    return clone(this.referralRows.find((x) => x.recruitId === recruitId) ?? null);
  }
  async referralsBy(inviterId: string) {
    return clone(this.referralRows.filter((x) => x.inviterId === inviterId).sort((a, b) => a.at - b.at));
  }
  async updateReferral(recruitId: string, patch: Partial<ReferralRow>) {
    const r = this.referralRows.find((x) => x.recruitId === recruitId);
    if (r) Object.assign(r, patch);
  }
  async inviterRewardsSince(inviterId: string, since: number) {
    return this.referralRows.filter((x) => x.inviterId === inviterId && x.inviterRewardedAt !== null && x.inviterRewardedAt >= since).length;
  }
  async addSharedReplay(r: SharedReplayRow) {
    if (this.sharedReplayRows.some((x) => x.id === r.id)) return false;
    this.sharedReplayRows.push(clone(r));
    return true;
  }
  async getSharedReplay(id: string, now: number, view: boolean) {
    const r = this.sharedReplayRows.find((x) => x.id === id && x.expiresAt > now);
    if (!r) return null;
    if (view) r.views++;
    return clone(r);
  }
  async sharedReplaysOf(ownerId: string, since: number) {
    return clone(this.sharedReplayRows.filter((x) => x.ownerId === ownerId && x.at >= since).sort((a, b) => b.at - a.at));
  }
  async deleteSharedReplay(id: string, ownerId: string) {
    const n = this.sharedReplayRows.length;
    this.sharedReplayRows = this.sharedReplayRows.filter((x) => !(x.id === id && x.ownerId === ownerId));
    return this.sharedReplayRows.length < n;
  }
  async pruneSharedReplays(before: number) {
    const n = this.sharedReplayRows.length;
    this.sharedReplayRows = this.sharedReplayRows.filter((x) => x.expiresAt >= before);
    return n - this.sharedReplayRows.length;
  }
  async setInstallTz(install: string, tz: number) {
    this.installTzRows[install] = tz;
  }
  async statsTouched(after: number, limit: number) {
    const last = new Map<string, number>();
    for (const r of this.statsRows) if (r.receivedAt > after) last.set(r.install, Math.max(last.get(r.install) ?? 0, r.receivedAt));
    const picked = [...last].sort((a, b) => a[1] - b[1]).slice(0, limit);
    return { installs: picked.map(([i]) => i), maxReceived: picked.length ? picked[picked.length - 1][1] : after };
  }
  async statsEventsOf(installs: string[]) {
    const want = new Set(installs);
    return (this.statsRows).filter((r) => want.has(r.install)).map((r) => ({ install: r.install, name: r.name, at: r.at, props: clone(r.props), arm: r.arm }));
  }
  async installTzs(installs: string[]) {
    return new Map(installs.filter((i) => this.installTzRows[i] !== undefined).map((i) => [i, this.installTzRows[i]]));
  }
  async putInstallSummaries(rows: InstallSummaryRow[]) {
    for (const r of rows) this.installSummaryRows[r.install] = clone(r);
  }
  async installSummaries(basis: 'utc' | 'local', fromDay: number, toDay: number) {
    return clone(
      Object.values(this.installSummaryRows).filter((r) => {
        const d = basis === 'utc' ? r.firstDayUtc : r.firstDayLocal;
        return d >= fromDay && d <= toDay;
      }),
    );
  }
  async getWatermark(name: string) {
    return this.watermarkRows[name] ?? 0;
  }
  async setWatermark(name: string, value: number) {
    this.watermarkRows[name] = value;
  }
  async deleteInstall(install: string) {
    delete this.installSummaryRows[install];
    delete this.installTzRows[install];
  }
  async pruneInstalls(firstBefore: number) {
    let n = 0;
    for (const [k, r] of Object.entries(this.installSummaryRows))
      if (r.firstAt < firstBefore) {
        delete this.installSummaryRows[k];
        delete this.installTzRows[k];
        n++;
      }
    return n;
  }
}
