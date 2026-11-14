/**
 * Storage for the growth batch (2026-11-14, retention audit G13/G14, growth 1/3), kept beside the main
 * `Repo` port (repo.ts / pgRepo.ts) so the two files other sessions edit stay untouched:
 * - referrals: one row per recruit (so one reward pair per recruit), both sides' reward times;
 * - shared replays: a re-simulated battle stored under a short code, for 90 days or until deleted;
 * - statistics: the time zone offset a statistics id reported, one summary row per statistics id
 *   (rebuilt only for ids with new events since the last watermark) and the watermarks.
 *
 * `growthOf(repo)` gives the store for a repo or a transaction handle: on Postgres it uses the same
 * connection (so it joins the request's transaction); in memory its state is a field of the
 * MemoryRepo, which the memory transaction restores on error like every other field.
 * Account deletion calls `deletePlayer` (core/account.ts).
 */
import type { Repo } from './repo';

export interface ReferralRow {
  recruitId: string;
  inviterId: string;
  at: number;
  /** When the server saw the recruit's server-held village at the needed Keep (null: not yet). */
  qualifiedAt: number | null;
  recruitRewardedAt: number | null;
  inviterRewardedAt: number | null;
}

export interface SharedReplayRow {
  id: string;
  ownerId: string | null;
  at: number;
  expiresAt: number;
  rules: number;
  dataVersion: string;
  /** `SharedReplayView` without `id`/`views` (protocol `growth.ts`). */
  record: unknown;
  views: number;
}

/** One statistics id's summary, by both day bases (UTC and the id's own UTC offset). */
export interface InstallSummaryRow {
  install: string;
  arm: string;
  firstAt: number;
  /** Minutes east of UTC the id reported (null: never; then local days are UTC days). */
  tz: number | null;
  firstDayUtc: number;
  firstDayLocal: number;
  daysUtc: number[];
  daysLocal: number[];
  tutorialDone: boolean;
  /** Highest tutorial step reached (0: none). */
  tutorialMax: number;
  firstRaidAt: number | null;
  firstPurchaseAt: number | null;
  updatedAt: number;
}

export interface StatsEventRow {
  install: string;
  name: string;
  at: number;
  props: Record<string, unknown>;
  arm: string;
}

export interface GrowthRepo {
  addReferral(r: ReferralRow): Promise<boolean>;
  referralOf(recruitId: string): Promise<ReferralRow | null>;
  referralsBy(inviterId: string): Promise<ReferralRow[]>;
  updateReferral(recruitId: string, patch: Partial<Pick<ReferralRow, 'qualifiedAt' | 'recruitRewardedAt' | 'inviterRewardedAt'>>): Promise<void>;
  /** Inviter rewards paid since `since` (the monthly cap). */
  inviterRewardsSince(inviterId: string, since: number): Promise<number>;

  addSharedReplay(r: SharedReplayRow): Promise<boolean>;
  /** The replay (counting a view when `view`), or null when missing or expired. */
  getSharedReplay(id: string, now: number, view: boolean): Promise<SharedReplayRow | null>;
  sharedReplaysOf(ownerId: string, since: number): Promise<SharedReplayRow[]>;
  deleteSharedReplay(id: string, ownerId: string): Promise<boolean>;
  pruneSharedReplays(before: number): Promise<number>;

  setInstallTz(install: string, tz: number, at: number): Promise<void>;
  /** Statistics ids with events received after `after`, oldest first, and the newest receipt time among them. */
  statsTouched(after: number, limit: number): Promise<{ installs: string[]; maxReceived: number }>;
  statsEventsOf(installs: string[]): Promise<StatsEventRow[]>;
  installTzs(installs: string[]): Promise<Map<string, number>>;
  putInstallSummaries(rows: InstallSummaryRow[]): Promise<void>;
  /** Summaries whose first day (on that basis) is in [fromDay, toDay]. */
  installSummaries(basis: 'utc' | 'local', fromDay: number, toDay: number): Promise<InstallSummaryRow[]>;
  getWatermark(name: string): Promise<number>;
  setWatermark(name: string, value: number): Promise<void>;
  /** Sharing turned off: the id's summary and offset go with its events. */
  deleteInstall(install: string): Promise<void>;
  pruneInstalls(firstBefore: number): Promise<number>;

  /** Account deletion: referrals either way and the player's shared replays. */
  deletePlayer(playerId: string): Promise<void>;
}

// ------------------------------------------------------------------ memory

interface MemoryGrowthState {
  referrals: ReferralRow[];
  replays: SharedReplayRow[];
  tz: Record<string, number>;
  installs: Record<string, InstallSummaryRow>;
  watermarks: Record<string, number>;
}

type MemoryHost = { growthState?: MemoryGrowthState; statsRows?: { install: string; name: string; at: number; props: Record<string, unknown>; arm: string; receivedAt: number }[] };

const copy = <T>(v: T): T => structuredClone(v);

class MemoryGrowthRepo implements GrowthRepo {
  constructor(private readonly host: MemoryHost) {
    host.growthState ??= { referrals: [], replays: [], tz: {}, installs: {}, watermarks: {} };
  }
  /** Read every time: a memory transaction may put back an earlier copy of the field. */
  private get s(): MemoryGrowthState {
    return this.host.growthState!;
  }
  async addReferral(r: ReferralRow) {
    if (this.s.referrals.some((x) => x.recruitId === r.recruitId)) return false;
    this.s.referrals.push(copy(r));
    return true;
  }
  async referralOf(recruitId: string) {
    return copy(this.s.referrals.find((x) => x.recruitId === recruitId) ?? null);
  }
  async referralsBy(inviterId: string) {
    return copy(this.s.referrals.filter((x) => x.inviterId === inviterId).sort((a, b) => a.at - b.at));
  }
  async updateReferral(recruitId: string, patch: Partial<ReferralRow>) {
    const r = this.s.referrals.find((x) => x.recruitId === recruitId);
    if (r) Object.assign(r, patch);
  }
  async inviterRewardsSince(inviterId: string, since: number) {
    return this.s.referrals.filter((x) => x.inviterId === inviterId && x.inviterRewardedAt !== null && x.inviterRewardedAt >= since).length;
  }
  async addSharedReplay(r: SharedReplayRow) {
    if (this.s.replays.some((x) => x.id === r.id)) return false;
    this.s.replays.push(copy(r));
    return true;
  }
  async getSharedReplay(id: string, now: number, view: boolean) {
    const r = this.s.replays.find((x) => x.id === id && x.expiresAt > now);
    if (!r) return null;
    if (view) r.views++;
    return copy(r);
  }
  async sharedReplaysOf(ownerId: string, since: number) {
    return copy(this.s.replays.filter((x) => x.ownerId === ownerId && x.at >= since).sort((a, b) => b.at - a.at));
  }
  async deleteSharedReplay(id: string, ownerId: string) {
    const n = this.s.replays.length;
    this.s.replays = this.s.replays.filter((x) => !(x.id === id && x.ownerId === ownerId));
    return this.s.replays.length < n;
  }
  async pruneSharedReplays(before: number) {
    const n = this.s.replays.length;
    this.s.replays = this.s.replays.filter((x) => x.expiresAt >= before);
    return n - this.s.replays.length;
  }
  async setInstallTz(install: string, tz: number) {
    this.s.tz[install] = tz;
  }
  async statsTouched(after: number, limit: number) {
    const last = new Map<string, number>();
    for (const r of this.host.statsRows ?? []) if (r.receivedAt > after) last.set(r.install, Math.max(last.get(r.install) ?? 0, r.receivedAt));
    const picked = [...last].sort((a, b) => a[1] - b[1]).slice(0, limit);
    return { installs: picked.map(([i]) => i), maxReceived: picked.length ? picked[picked.length - 1][1] : after };
  }
  async statsEventsOf(installs: string[]) {
    const want = new Set(installs);
    return (this.host.statsRows ?? []).filter((r) => want.has(r.install)).map((r) => ({ install: r.install, name: r.name, at: r.at, props: copy(r.props), arm: r.arm }));
  }
  async installTzs(installs: string[]) {
    return new Map(installs.filter((i) => this.s.tz[i] !== undefined).map((i) => [i, this.s.tz[i]]));
  }
  async putInstallSummaries(rows: InstallSummaryRow[]) {
    for (const r of rows) this.s.installs[r.install] = copy(r);
  }
  async installSummaries(basis: 'utc' | 'local', fromDay: number, toDay: number) {
    return copy(
      Object.values(this.s.installs).filter((r) => {
        const d = basis === 'utc' ? r.firstDayUtc : r.firstDayLocal;
        return d >= fromDay && d <= toDay;
      }),
    );
  }
  async getWatermark(name: string) {
    return this.s.watermarks[name] ?? 0;
  }
  async setWatermark(name: string, value: number) {
    this.s.watermarks[name] = value;
  }
  async deleteInstall(install: string) {
    delete this.s.installs[install];
    delete this.s.tz[install];
  }
  async pruneInstalls(firstBefore: number) {
    let n = 0;
    for (const [k, r] of Object.entries(this.s.installs))
      if (r.firstAt < firstBefore) {
        delete this.s.installs[k];
        delete this.s.tz[k];
        n++;
      }
    return n;
  }
  async deletePlayer(playerId: string) {
    this.s.referrals = this.s.referrals.filter((x) => x.recruitId !== playerId && x.inviterId !== playerId);
    this.s.replays = this.s.replays.filter((x) => x.ownerId !== playerId);
  }
}

// ------------------------------------------------------------------ Postgres

interface Queryable {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

const num = (v: unknown) => Number(v ?? 0);
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
const toSummary = (r: Record<string, unknown>): InstallSummaryRow => ({
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

class PgGrowthRepo implements GrowthRepo {
  constructor(private readonly db: Queryable) {}
  async addReferral(r: ReferralRow) {
    const q = await this.db.query(
      'insert into referrals (recruit_id, inviter_id, at, qualified_at, recruit_rewarded_at, inviter_rewarded_at) values ($1,$2,$3,$4,$5,$6) on conflict do nothing',
      [r.recruitId, r.inviterId, r.at, r.qualifiedAt, r.recruitRewardedAt, r.inviterRewardedAt],
    );
    return (q.rowCount ?? 0) > 0;
  }
  async referralOf(recruitId: string) {
    const q = await this.db.query('select * from referrals where recruit_id = $1', [recruitId]);
    return q.rows[0] ? toReferral(q.rows[0]) : null;
  }
  async referralsBy(inviterId: string) {
    return (await this.db.query('select * from referrals where inviter_id = $1 order by at', [inviterId])).rows.map(toReferral);
  }
  async updateReferral(recruitId: string, patch: Partial<ReferralRow>) {
    const cols: [string, unknown][] = [];
    if (patch.qualifiedAt !== undefined) cols.push(['qualified_at', patch.qualifiedAt]);
    if (patch.recruitRewardedAt !== undefined) cols.push(['recruit_rewarded_at', patch.recruitRewardedAt]);
    if (patch.inviterRewardedAt !== undefined) cols.push(['inviter_rewarded_at', patch.inviterRewardedAt]);
    if (!cols.length) return;
    await this.db.query(`update referrals set ${cols.map(([c], i) => `${c} = $${i + 2}`).join(', ')} where recruit_id = $1`, [recruitId, ...cols.map(([, v]) => v)]);
  }
  async inviterRewardsSince(inviterId: string, since: number) {
    return num((await this.db.query('select count(*) as n from referrals where inviter_id = $1 and inviter_rewarded_at >= $2', [inviterId, since])).rows[0]?.n);
  }
  async addSharedReplay(r: SharedReplayRow) {
    const q = await this.db.query(
      'insert into shared_replays (id, owner_id, at, expires_at, rules, data_version, record, views) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing',
      [r.id, r.ownerId, r.at, r.expiresAt, r.rules, r.dataVersion, JSON.stringify(r.record), r.views],
    );
    return (q.rowCount ?? 0) > 0;
  }
  async getSharedReplay(id: string, now: number, view: boolean) {
    const q = view
      ? await this.db.query('update shared_replays set views = views + 1 where id = $1 and expires_at > $2 returning *', [id, now])
      : await this.db.query('select * from shared_replays where id = $1 and expires_at > $2', [id, now]);
    return q.rows[0] ? toReplay(q.rows[0]) : null;
  }
  async sharedReplaysOf(ownerId: string, since: number) {
    return (await this.db.query('select * from shared_replays where owner_id = $1 and at >= $2 order by at desc', [ownerId, since])).rows.map(toReplay);
  }
  async deleteSharedReplay(id: string, ownerId: string) {
    return ((await this.db.query('delete from shared_replays where id = $1 and owner_id = $2', [id, ownerId])).rowCount ?? 0) > 0;
  }
  async pruneSharedReplays(before: number) {
    return (await this.db.query('delete from shared_replays where expires_at < $1', [before])).rowCount ?? 0;
  }
  async setInstallTz(install: string, tz: number, at: number) {
    await this.db.query('insert into stats_install_tz (install, tz, at) values ($1,$2,$3) on conflict (install) do update set tz = excluded.tz, at = excluded.at', [install, tz, at]);
  }
  async statsTouched(after: number, limit: number) {
    const rows = (await this.db.query('select install, max(received_at) as last from stats_events where received_at > $1 group by install order by last limit $2', [after, limit])).rows;
    return { installs: rows.map((r) => String(r.install)), maxReceived: rows.length ? num(rows[rows.length - 1].last) : after };
  }
  async statsEventsOf(installs: string[]) {
    if (!installs.length) return [];
    return (await this.db.query('select install, name, at, props, arm from stats_events where install = any($1::text[])', [installs])).rows.map((r) => ({
      install: String(r.install),
      name: String(r.name),
      at: num(r.at),
      props: (r.props as Record<string, unknown>) ?? {},
      arm: String(r.arm ?? ''),
    }));
  }
  async installTzs(installs: string[]) {
    if (!installs.length) return new Map<string, number>();
    return new Map((await this.db.query('select install, tz from stats_install_tz where install = any($1::text[])', [installs])).rows.map((r) => [String(r.install), num(r.tz)] as [string, number]));
  }
  async putInstallSummaries(rows: InstallSummaryRow[]) {
    for (const r of rows)
      await this.db.query(
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
    return (await this.db.query(`select * from stats_installs where ${col} between $1 and $2`, [fromDay, toDay])).rows.map(toSummary);
  }
  async getWatermark(name: string) {
    return num((await this.db.query('select value from stats_watermarks where name = $1', [name])).rows[0]?.value);
  }
  async setWatermark(name: string, value: number) {
    await this.db.query('insert into stats_watermarks (name, value) values ($1,$2) on conflict (name) do update set value = excluded.value', [name, value]);
  }
  async deleteInstall(install: string) {
    await this.db.query('delete from stats_installs where install = $1', [install]);
    await this.db.query('delete from stats_install_tz where install = $1', [install]);
  }
  async pruneInstalls(firstBefore: number) {
    const n = (await this.db.query('delete from stats_installs where first_at < $1', [firstBefore])).rowCount ?? 0;
    await this.db.query('delete from stats_install_tz t where t.at < $1 and not exists (select 1 from stats_installs s where s.install = t.install)', [firstBefore]);
    return n;
  }
  async deletePlayer(playerId: string) {
    await this.db.query('delete from referrals where recruit_id = $1 or inviter_id = $1', [playerId]);
    await this.db.query('delete from shared_replays where owner_id = $1', [playerId]);
  }
}

/**
 * The growth store for a repo or transaction handle. PgRepo keeps its connection in a private `db`
 * getter (the pool, or the transaction's client); it is read here at run time on purpose, so pgRepo.ts
 * needs no change. Anything without one is the MemoryRepo (or its transaction proxy).
 */
export function growthOf(repo: Repo): GrowthRepo {
  const db = (repo as unknown as { db?: Queryable }).db;
  if (db && typeof db.query === 'function') return new PgGrowthRepo(db);
  return new MemoryGrowthRepo(repo as unknown as MemoryHost);
}
