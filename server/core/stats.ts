/**
 * Shared play statistics (state-of-the-game report, section 5 step 5, growth 1): the events adult
 * players chose to share, and the daily table the operators judge a launch by.
 *
 * - `postStats` keeps a batch after `cleanStatsBatch` (the shared allowlist: only the listed
 *   events and fields). No token, no player id, no IP address: the batch carries only its random
 *   statistics id, so nothing here can be joined to an account.
 * - `deleteStats` forgets everything one statistics id sent (the player turned sharing off).
 * - `rollupStats` (hourly, leased: server/main.ts) rebuilds `stats_daily` for the last 40 install
 *   days (since the growth batch 2026-11-14 from per-id summaries updated incrementally, `statsLocal.ts`
 *   `rollupIncremental`; this full re-read stays as `rollupStats` for tools and comparison): per install day and experiment arm, how many new installs, how many came back on day 1,
 *   7 and 30, finished the tutorial, fought a first raid within 7 days and paid within 7 days.
 * - `statsReport` is the staff view (`GET /admin/v1/stats`).
 * Events are kept STATS_RETENTION_DAYS, then pruned (`retention.ts`).
 */
import { cleanStatsBatch, INSTALL_ID } from '../../src/backend/net/stats';
import type { StatsResponse } from '../../src/backend/net/protocol';
import type { StatsDailyRow, StatsInstallSummary } from '../repo';
import { growthOf } from '../growthRepo';
import { HOUR, type ServerContext } from './context';
import { fail } from './errors';

export const DAY_MS = 24 * HOUR;
/** Raw shared events are kept this long (a year and a month: D30 of a year-old cohort, year-on-year). */
export const STATS_RETENTION_DAYS = 400;
/** Install days the rollup rebuilds each run (D30 needs 30, plus late uploads from offline phones). */
export const ROLLUP_DAYS = 40;
/** An event's own time is believed only within this window before arrival (a phone offline for weeks). */
const OLDEST_EVENT_MS = 30 * DAY_MS;
const FUTURE_EVENT_MS = HOUR;

export const utcDay = (t: number) => Math.floor(t / DAY_MS);

export async function postStats(ctx: ServerContext, body: unknown): Promise<StatsResponse> {
  const b = cleanStatsBatch(body);
  if ('error' in b) throw fail(400, 'bad_request', 'stats.refused', { detail: b.error });
  const now = ctx.now();
  // A wrong phone clock must not plant events years away; out of range means "when it arrived".
  const events = b.events.map((e) => ({ ...e, at: e.at < now - OLDEST_EVENT_MS || e.at > now + FUTURE_EVENT_MS ? now : e.at }));
  if (events.length) await ctx.repo.addStatsEvents(b.install, b.build, b.arm ?? '', events, now);
  // Growth batch 2026-11-14: the offset for local-day counting (statsLocal.ts), kept per statistics id.
  if (events.length && b.tz !== undefined) await growthOf(ctx.repo).setInstallTz(b.install, b.tz, now);
  ctx.metrics.count('tk_stats_events_total', {}, events.length);
  return { accepted: events.length };
}

export async function deleteStats(ctx: ServerContext, install: unknown): Promise<{ deleted: number }> {
  if (typeof install !== 'string' || !INSTALL_ID.test(install)) throw fail(400, 'bad_request', 'stats.bad_id');
  await growthOf(ctx.repo).deleteInstall(install.toLowerCase());
  return { deleted: await ctx.repo.deleteStats(install.toLowerCase()) };
}

/** The daily rows for these installs (pure; exported for tests and tools). */
export function cohortRows(installs: StatsInstallSummary[], computedAt: number): StatsDailyRow[] {
  const by = new Map<string, StatsDailyRow>();
  for (const i of installs) {
    const key = `${i.firstDay}|${i.arm}`;
    let r = by.get(key);
    if (!r) by.set(key, (r = { day: i.firstDay, arm: i.arm, installs: 0, d1: 0, d7: 0, d30: 0, tutorialDone: 0, raided7: 0, payers7: 0, computedAt }));
    const days = new Set(i.days);
    r.installs++;
    if (days.has(i.firstDay + 1)) r.d1++;
    if (days.has(i.firstDay + 7)) r.d7++;
    if (days.has(i.firstDay + 30)) r.d30++;
    if (i.tutorialDone) r.tutorialDone++;
    if (i.firstRaidAt !== null && i.firstRaidAt - i.firstAt <= 7 * DAY_MS) r.raided7++;
    if (i.firstPurchaseAt !== null && i.firstPurchaseAt - i.firstAt <= 7 * DAY_MS) r.payers7++;
  }
  return [...by.values()].sort((a, b) => a.day - b.day || a.arm.localeCompare(b.arm));
}

export async function rollupStats(ctx: ServerContext): Promise<{ days: number; rows: number }> {
  const now = ctx.now();
  const to = utcDay(now);
  const from = to - ROLLUP_DAYS;
  const rows = cohortRows(await ctx.repo.statsInstalls(from, to), now);
  await ctx.repo.putStatsDaily(from, to, rows);
  return { days: ROLLUP_DAYS + 1, rows: rows.length };
}

export interface StatsReportRow extends StatsDailyRow {
  /** "2026-11-06". */
  date: string;
  /** Share of the day's installs (0..1); null until that day has passed for the cohort. */
  d1Rate: number | null;
  d7Rate: number | null;
  d30Rate: number | null;
  tutorialRate: number;
  raided7Rate: number | null;
  payers7Rate: number | null;
}

/** The staff view: the last `days` install days (default 60), newest first, with rates where they are known. */
export async function statsReport(ctx: ServerContext, days: unknown): Promise<{ rows: StatsReportRow[]; today: string }> {
  const n = Math.min(400, Math.max(1, Math.floor(Number(days) || 60)));
  const today = utcDay(ctx.now());
  const rate = (k: number, of: number, after: number, day: number) => (day + after < today && of > 0 ? Math.round((k / of) * 1000) / 1000 : null);
  const rows = (await ctx.repo.statsDaily(today - n, today)).map((r) => ({
    ...r,
    date: new Date(r.day * DAY_MS).toISOString().slice(0, 10),
    d1Rate: rate(r.d1, r.installs, 1, r.day),
    d7Rate: rate(r.d7, r.installs, 7, r.day),
    d30Rate: rate(r.d30, r.installs, 30, r.day),
    tutorialRate: r.installs ? Math.round((r.tutorialDone / r.installs) * 1000) / 1000 : 0,
    raided7Rate: rate(r.raided7, r.installs, 7, r.day),
    payers7Rate: rate(r.payers7, r.installs, 7, r.day),
  }));
  return { rows: rows.sort((a, b) => b.day - a.day || a.arm.localeCompare(b.arm)), today: new Date(today * DAY_MS).toISOString().slice(0, 10) };
}
