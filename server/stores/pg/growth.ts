/** Postgres referrals, shared replays and statistics summaries (`GrowthStore`, growth batch 2026-11-14; migration 0038). */
import type { InstallSummaryRow, ReferralRow, SharedReplayRow } from '../types';
import type { GrowthStore } from '../ports';
import { num } from './rows';
import { PgBase } from './base';

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toReferral = (r: Record<string, unknown>): ReferralRow => ({
  recruitId: String(r.recruit_id),
  inviterId: String(r.inviter_id),
  at: num(r.at),
  qualifiedAt: numOrNull(r.qualified_at),
  recruitRewardedAt: numOrNull(r.recruit_rewarded_at),
  inviterRewardedAt: numOrNull(r.inviter_rewarded_at),
});
const toReplay = (r: Record<string, unknown>): SharedReplayRow => ({
  id: String(r.id),
  ownerId: r.owner_id === null || r.owner_id === undefined ? null : String(r.owner_id),
  at: num(r.at),
  expiresAt: num(r.expires_at),
  rules: num(r.rules),
  dataVersion: String(r.data_version),
  record: r.record,
  views: num(r.views),
});
const toInstallSummary = (r: Record<string, unknown>): InstallSummaryRow => ({
  install: String(r.install),
  arm: String(r.arm ?? ''),
  firstAt: num(r.first_at),
  tz: numOrNull(r.tz),
  firstDayUtc: num(r.first_day_utc),
  firstDayLocal: num(r.first_day_local),
  daysUtc: ((r.days_utc as unknown[]) ?? []).map(num),
  daysLocal: ((r.days_local as unknown[]) ?? []).map(num),
  tutorialDone: r.tutorial_done === true,
  tutorialMax: num(r.tutorial_max),
  firstRaidAt: numOrNull(r.first_raid_at),
  firstPurchaseAt: numOrNull(r.first_purchase_at),
  updatedAt: num(r.updated_at),
});

export class PgGrowth extends PgBase implements GrowthStore {
  async addReferral(r: ReferralRow) {
    const q = await this.db.query<Record<string, unknown>>(
      'insert into referrals (recruit_id, inviter_id, at, qualified_at, recruit_rewarded_at, inviter_rewarded_at) values ($1,$2,$3,$4,$5,$6) on conflict do nothing',
      [r.recruitId, r.inviterId, r.at, r.qualifiedAt, r.recruitRewardedAt, r.inviterRewardedAt],
    );
    return (q.rowCount ?? 0) > 0;
  }
  async referralOf(recruitId: string) {
    const q = await this.db.query<Record<string, unknown>>('select * from referrals where recruit_id = $1', [recruitId]);
    return q.rows[0] ? toReferral(q.rows[0]) : null;
  }
  async referralsBy(inviterId: string) {
    return (await this.db.query<Record<string, unknown>>('select * from referrals where inviter_id = $1 order by at', [inviterId])).rows.map(toReferral);
  }
  async updateReferral(recruitId: string, patch: Partial<ReferralRow>) {
    const cols: [string, unknown][] = [];
    if (patch.qualifiedAt !== undefined) cols.push(['qualified_at', patch.qualifiedAt]);
    if (patch.recruitRewardedAt !== undefined) cols.push(['recruit_rewarded_at', patch.recruitRewardedAt]);
    if (patch.inviterRewardedAt !== undefined) cols.push(['inviter_rewarded_at', patch.inviterRewardedAt]);
    if (!cols.length) return;
    await this.db.query<Record<string, unknown>>(`update referrals set ${cols.map(([c], i) => `${c} = $${i + 2}`).join(', ')} where recruit_id = $1`, [recruitId, ...cols.map(([, v]) => v)]);
  }
  async inviterRewardsSince(inviterId: string, since: number) {
    return num((await this.db.query<Record<string, unknown>>('select count(*) as n from referrals where inviter_id = $1 and inviter_rewarded_at >= $2', [inviterId, since])).rows[0]?.n);
  }
  async addSharedReplay(r: SharedReplayRow) {
    const q = await this.db.query<Record<string, unknown>>(
      'insert into shared_replays (id, owner_id, at, expires_at, rules, data_version, record, views) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing',
      [r.id, r.ownerId, r.at, r.expiresAt, r.rules, r.dataVersion, JSON.stringify(r.record), r.views],
    );
    return (q.rowCount ?? 0) > 0;
  }
  async getSharedReplay(id: string, now: number, view: boolean) {
    const q = view
      ? await this.db.query<Record<string, unknown>>('update shared_replays set views = views + 1 where id = $1 and expires_at > $2 returning *', [id, now])
      : await this.db.query<Record<string, unknown>>('select * from shared_replays where id = $1 and expires_at > $2', [id, now]);
    return q.rows[0] ? toReplay(q.rows[0]) : null;
  }
  async sharedReplaysOf(ownerId: string, since: number) {
    return (await this.db.query<Record<string, unknown>>('select * from shared_replays where owner_id = $1 and at >= $2 order by at desc', [ownerId, since])).rows.map(toReplay);
  }
  async deleteSharedReplay(id: string, ownerId: string) {
    return ((await this.db.query<Record<string, unknown>>('delete from shared_replays where id = $1 and owner_id = $2', [id, ownerId])).rowCount ?? 0) > 0;
  }
  async pruneSharedReplays(before: number) {
    return (await this.db.query<Record<string, unknown>>('delete from shared_replays where expires_at < $1', [before])).rowCount ?? 0;
  }
  async setInstallTz(install: string, tz: number, at: number) {
    await this.db.query<Record<string, unknown>>('insert into stats_install_tz (install, tz, at) values ($1,$2,$3) on conflict (install) do update set tz = excluded.tz, at = excluded.at', [install, tz, at]);
  }
  async statsTouched(after: number, limit: number) {
    const rows = (await this.db.query<Record<string, unknown>>('select install, max(received_at) as last from stats_events where received_at > $1 group by install order by last limit $2', [after, limit])).rows;
    return { installs: rows.map((r) => String(r.install)), maxReceived: rows.length ? num(rows[rows.length - 1].last) : after };
  }
  async statsEventsOf(installs: string[]) {
    if (!installs.length) return [];
    return (await this.db.query<Record<string, unknown>>('select install, name, at, props, arm from stats_events where install = any($1::text[])', [installs])).rows.map((r) => ({
      install: String(r.install),
      name: String(r.name),
      at: num(r.at),
      props: (r.props as Record<string, unknown>) ?? {},
      arm: String(r.arm ?? ''),
    }));
  }
  async installTzs(installs: string[]) {
    if (!installs.length) return new Map<string, number>();
    return new Map((await this.db.query<Record<string, unknown>>('select install, tz from stats_install_tz where install = any($1::text[])', [installs])).rows.map((r) => [String(r.install), num(r.tz)] as [string, number]));
  }
  async putInstallSummaries(rows: InstallSummaryRow[]) {
    for (const r of rows)
      await this.db.query<Record<string, unknown>>(
        `insert into stats_installs (install, arm, first_at, tz, first_day_utc, first_day_local, days_utc, days_local, tutorial_done, tutorial_max, first_raid_at, first_purchase_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (install) do update set arm = excluded.arm, first_at = excluded.first_at, tz = excluded.tz, first_day_utc = excluded.first_day_utc,
           first_day_local = excluded.first_day_local, days_utc = excluded.days_utc, days_local = excluded.days_local, tutorial_done = excluded.tutorial_done,
           tutorial_max = excluded.tutorial_max, first_raid_at = excluded.first_raid_at, first_purchase_at = excluded.first_purchase_at, updated_at = excluded.updated_at`,
        [r.install, r.arm, r.firstAt, r.tz, r.firstDayUtc, r.firstDayLocal, r.daysUtc, r.daysLocal, r.tutorialDone, r.tutorialMax, r.firstRaidAt, r.firstPurchaseAt, r.updatedAt],
      );
  }
  async installSummaries(basis: 'utc' | 'local', fromDay: number, toDay: number) {
    const col = basis === 'utc' ? 'first_day_utc' : 'first_day_local';
    return (await this.db.query<Record<string, unknown>>(`select * from stats_installs where ${col} between $1 and $2`, [fromDay, toDay])).rows.map(toInstallSummary);
  }
  async getWatermark(name: string) {
    return num((await this.db.query<Record<string, unknown>>('select value from stats_watermarks where name = $1', [name])).rows[0]?.value);
  }
  async setWatermark(name: string, value: number) {
    await this.db.query<Record<string, unknown>>('insert into stats_watermarks (name, value) values ($1,$2) on conflict (name) do update set value = excluded.value', [name, value]);
  }
  async deleteInstall(install: string) {
    await this.db.query<Record<string, unknown>>('delete from stats_installs where install = $1', [install]);
    await this.db.query<Record<string, unknown>>('delete from stats_install_tz where install = $1', [install]);
  }
  async pruneInstalls(firstBefore: number) {
    const n = (await this.db.query<Record<string, unknown>>('delete from stats_installs where first_at < $1', [firstBefore])).rowCount ?? 0;
    await this.db.query<Record<string, unknown>>('delete from stats_install_tz t where t.at < $1 and not exists (select 1 from stats_installs s where s.install = t.install)', [firstBefore]);
    return n;
  }
}
