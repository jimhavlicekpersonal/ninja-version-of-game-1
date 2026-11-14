/**
 * Play statistics, growth 1/3 follow-up (growth batch 2026-11-14): incremental rollup and local days.
 *
 * - Incremental: `rollupStats` used to re-read 40 days of raw events every hour. Now each statistics id
 *   has one summary row (`stats_installs`), rebuilt only when the id sent events received after the
 *   watermark (`stats_watermarks` 'stats-rollup'; receipts up to OVERLAP_MS before the previous run are
 *   read again, so a batch still being written then is not missed; rebuilding a summary is idempotent). The UTC daily table
 *   (`stats_daily`, the existing staff view) is then rebuilt from the summaries.
 * - Local days: a game that shares statistics also sends its UTC offset (`StatsBatch.tz`, minutes,
 *   rounded to 15; stored per statistics id, never with a player id). Each summary keeps its days on
 *   both bases, so D1/D7/D30 can be read by the player's own calendar day (`statsLocalReport`); an id
 *   that never sent an offset counts in UTC.
 * - `statsFunnel`: installs in a window, how far they got in the tutorial step by step, first raid and
 *   first purchase within 7 days, and the D1/D7/D30 returns, on either basis (the staff page,
 *   `server/routes/growth.ts` `/admin/stats`).
 * Still adults who opted in only: the client sends nothing otherwise (`analytics/share.ts`).
 */
import type { InstallSummaryRow, StatsDailyRow, StatsEventRow, StatsInstallSummary } from '../repo';
import type { ServerContext } from './context';
import { cohortRows, DAY_MS, ROLLUP_DAYS, utcDay } from './stats';
export { cleanTz } from '../../src/backend/net/stats';

export const WATERMARK = 'stats-rollup';
const LAST_RUN = 'stats-rollup-run';
/** Receipt times re-read before the watermark each run (writes landing in the same instant). */
export const OVERLAP_MS = 60_000;
/** Statistics ids summarized per step, and steps per run (the rest waits for the next hour). */
const BATCH = 500;
const MAX_STEPS = 40;

export const localDay = (at: number, tz: number | null) => Math.floor((at + (tz ?? 0) * 60_000) / DAY_MS);

/** One statistics id's summary from its events (pure). */
export function summarize(install: string, events: StatsEventRow[], tz: number | null, now: number): InstallSummaryRow {
  const rows = [...events].sort((a, b) => a.at - b.at);
  const first = rows[0];
  const firstOf = (name: string) => rows.find((r) => r.name === name)?.at ?? null;
  const steps = rows.filter((r) => r.name === 'tutorial_step').map((r) => Number(r.props.step) || 0);
  const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
  return {
    install,
    arm: first.arm,
    firstAt: first.at,
    tz,
    firstDayUtc: utcDay(first.at),
    firstDayLocal: localDay(first.at, tz),
    daysUtc: uniq(rows.map((r) => utcDay(r.at))),
    daysLocal: uniq(rows.map((r) => localDay(r.at, tz))),
    tutorialDone: rows.some((r) => r.name === 'tutorial_step' && r.props.done === true),
    tutorialMax: steps.length ? Math.max(...steps) : 0,
    firstRaidAt: firstOf('raid_end'),
    firstPurchaseAt: firstOf('purchase'),
    updatedAt: now,
  };
}

/** A summary seen on one basis, as `cohortRows` reads it. */
export function onBasis(s: InstallSummaryRow, basis: 'utc' | 'local'): StatsInstallSummary {
  return {
    install: s.install,
    arm: s.arm,
    firstDay: basis === 'utc' ? s.firstDayUtc : s.firstDayLocal,
    firstAt: s.firstAt,
    days: basis === 'utc' ? s.daysUtc : s.daysLocal,
    tutorialDone: s.tutorialDone,
    firstRaidAt: s.firstRaidAt,
    firstPurchaseAt: s.firstPurchaseAt,
  };
}

/** Rebuild the summaries of every statistics id with events received since the watermark. */
export async function summarizeNew(ctx: ServerContext): Promise<{ installs: number; watermark: number }> {
  const g = ctx.repo;
  let wm = await g.getWatermark(WATERMARK);
  // A batch still being written when the last run read could carry a receipt time up to OVERLAP_MS before it.
  const lastRun = await g.getWatermark(LAST_RUN);
  let after = Math.max(0, Math.min(wm, lastRun - OVERLAP_MS));
  await g.setWatermark(LAST_RUN, ctx.now());
  let installs = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const touched = await g.statsTouched(after, BATCH);
    const fresh = touched.maxReceived > wm;
    if (touched.installs.length) {
      const events = await g.statsEventsOf(touched.installs);
      const tzs = await g.installTzs(touched.installs);
      const by = new Map<string, StatsEventRow[]>();
      for (const e of events) by.set(e.install, [...(by.get(e.install) ?? []), e]);
      const now = ctx.now();
      await g.putInstallSummaries([...by].map(([i, ev]) => summarize(i, ev, tzs.get(i) ?? null, now)));
      installs += by.size;
    }
    if (!fresh) break;
    wm = after = touched.maxReceived;
    await g.setWatermark(WATERMARK, wm);
    if (touched.installs.length < BATCH) break;
  }
  return { installs, watermark: wm };
}

/** The hourly rollup: new summaries, then the UTC daily table for the last ROLLUP_DAYS install days. */
export async function rollupIncremental(ctx: ServerContext): Promise<{ days: number; rows: number; installs: number }> {
  const { installs } = await summarizeNew(ctx);
  const now = ctx.now();
  const to = utcDay(now);
  const from = to - ROLLUP_DAYS;
  const rows = cohortRows((await ctx.repo.installSummaries('utc', from, to)).map((s) => onBasis(s, 'utc')), now);
  await ctx.repo.putStatsDaily(from, to, rows);
  return { days: ROLLUP_DAYS + 1, rows: rows.length, installs };
}

const span = (days: unknown) => Math.min(400, Math.max(1, Math.floor(Number(days) || 60)));
const rate = (k: number, of: number) => (of > 0 ? Math.round((k / of) * 1000) / 1000 : null);

export interface LocalReportRow extends StatsDailyRow {
  date: string;
  d1Rate: number | null;
  d7Rate: number | null;
  d30Rate: number | null;
}

/** D1/D7/D30 by install day on the chosen basis (computed from the summaries; rates only once the day has passed). */
export async function statsLocalReport(ctx: ServerContext, days: unknown, basisRaw: unknown): Promise<{ basis: 'utc' | 'local'; rows: LocalReportRow[] }> {
  const basis = basisRaw === 'utc' ? 'utc' : 'local';
  const today = utcDay(ctx.now());
  const n = span(days);
  const sums = await ctx.repo.installSummaries(basis, today - n, today + 1);
  const known = (after: number, day: number) => day + after < today;
  const rows = cohortRows(
    sums.map((s) => onBasis(s, basis)),
    ctx.now(),
  ).map((r) => ({
    ...r,
    date: new Date(r.day * DAY_MS).toISOString().slice(0, 10),
    d1Rate: known(1, r.day) ? rate(r.d1, r.installs) : null,
    d7Rate: known(7, r.day) ? rate(r.d7, r.installs) : null,
    d30Rate: known(30, r.day) ? rate(r.d30, r.installs) : null,
  }));
  return { basis, rows: rows.sort((a, b) => b.day - a.day || a.arm.localeCompare(b.arm)) };
}

export interface FunnelView {
  basis: 'utc' | 'local';
  days: number;
  installs: number;
  /** Installs whose highest tutorial step was at least the index (index 0 = sent any step). */
  tutorialReached: { step: number; installs: number }[];
  tutorialDone: number;
  raided7: number;
  payers7: number;
  /** Returns among installs old enough to know (the counts say how many were). */
  d1: { returned: number; of: number };
  d7: { returned: number; of: number };
  d30: { returned: number; of: number };
}

/** The funnel for installs of the last `days` days (pure over summaries). */
export function funnelOf(sums: InstallSummaryRow[], basis: 'utc' | 'local', today: number, days: number): FunnelView {
  const top = Math.max(0, ...sums.map((s) => s.tutorialMax));
  const ret = (after: number) => {
    const old = sums.filter((s) => (basis === 'utc' ? s.firstDayUtc : s.firstDayLocal) + after < today);
    const back = old.filter((s) => (basis === 'utc' ? s.daysUtc : s.daysLocal).includes((basis === 'utc' ? s.firstDayUtc : s.firstDayLocal) + after));
    return { returned: back.length, of: old.length };
  };
  return {
    basis,
    days,
    installs: sums.length,
    tutorialReached: Array.from({ length: top + 1 }, (_, step) => ({ step, installs: sums.filter((s) => s.tutorialMax >= step && (step > 0 || s.tutorialMax > 0 || s.tutorialDone)).length })),
    tutorialDone: sums.filter((s) => s.tutorialDone).length,
    raided7: sums.filter((s) => s.firstRaidAt !== null && s.firstRaidAt - s.firstAt <= 7 * DAY_MS).length,
    payers7: sums.filter((s) => s.firstPurchaseAt !== null && s.firstPurchaseAt - s.firstAt <= 7 * DAY_MS).length,
    d1: ret(1),
    d7: ret(7),
    d30: ret(30),
  };
}

export async function statsFunnel(ctx: ServerContext, days: unknown, basisRaw: unknown): Promise<FunnelView> {
  const basis = basisRaw === 'utc' ? 'utc' : 'local';
  const today = utcDay(ctx.now());
  const n = span(days);
  return funnelOf(await ctx.repo.installSummaries(basis, today - n, today + 1), basis, today, n);
}

