/**
 * Play statistics, growth 1/3 follow-up (growth batch 2026-11-14): incremental rollup and local days.
 *
 * - Incremental: `rollupStats` used to re-read 40 days of raw events every hour. Now each statistics id
 *   has one summary row (`stats_installs`), rebuilt only when the id sent events written after the
 *   watermark (`stats_watermarks` 'stats-rollup-seq'; rebuilding a summary is idempotent). The UTC daily
 *   table (`stats_daily`, the existing staff view) is then rebuilt from the summaries.
 * - Last gaps 2026-11-14: the watermark is commit-order safe. It used to follow receipt times, which are
 *   taken before an insert commits, so a batch committed late (a slow insert, another instance) with a
 *   receipt time below the watermark was skipped for good; a lag window only narrowed that. Now it follows
 *   the writing transaction's id (`stats_events.txid`, migration 0042) and a run reads only up to
 *   `Repo.statsHorizon` (the oldest transaction still running): everything below has committed or rolled
 *   back, and a later commit is always at or above it. One indexed range read per run; nothing is re-read.
 * - Local days: a game that shares statistics also sends its UTC offset (`StatsBatch.tz`, minutes,
 *   rounded to 15; stored per statistics id, never with a player id). Each summary keeps its days on
 *   both bases, so D1/D7/D30 can be read by the player's own calendar day (`statsLocalReport`); an id
 *   that never sent an offset counts in UTC.
 * - `statsFunnel`: installs in a window, how far they got in the tutorial step by step, first raid and
 *   first purchase within 7 days, and the D1/D7/D30 returns, on either basis (the staff page,
 *   `server/routes/growth.ts` `/admin/stats`).
 * Still adults who opted in only: the client sends nothing otherwise (`analytics/share.ts`).
 */
import type { InstallSummaryRow, StatsBattleCount, StatsDailyRow, StatsEventRow, StatsInstallSummary } from '../repo';
import { battleCountKey } from '../stores/battleCounts';
import type { ServerContext } from './context';
import { cohortRows, DAY_MS, ROLLUP_DAYS, utcDay } from './stats';
export { cleanTz } from '../../src/backend/net/stats';

/** The commit-order watermark (positions, not times; the older time-based 'stats-rollup' row is no longer read). */
export const WATERMARK = 'stats-rollup-seq';
/** Statistics ids summarized per step, and steps per run (the rest waits for the next hour). */
const BATCH = 500;
const MAX_STEPS = 40;

export const localDay = (at: number, tz: number | null) => Math.floor((at + (tz ?? 0) * 60_000) / DAY_MS);

/** One statistics id's summary from its events (pure). */
export function summarize(install: string, events: StatsEventRow[], tz: number | null, now: number): InstallSummaryRow {
  const rows = events.slice().sort((a, b) => a.at - b.at);
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
    // SECR-01: no spread (an argument list past ~125k items throws).
    tutorialMax: steps.reduce((m, x) => Math.max(m, x), 0),
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

/** Rebuild the summaries of every statistics id with events written since the watermark. */
export async function summarizeNew(ctx: ServerContext): Promise<{ installs: number; watermark: number }> {
  const g = ctx.repo;
  let wm = await g.getWatermark(WATERMARK);
  // Taken once, before reading: every event below it is visible now, and none can appear below it later.
  const horizon = await g.statsHorizon();
  let installs = 0;
  let done = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const touched = await g.statsTouched(wm, BATCH, horizon);
    if (touched.installs.length) {
      const events = await g.statsEventsOf(touched.installs);
      const tzs = await g.installTzs(touched.installs);
      const by = new Map<string, StatsEventRow[]>();
      // SECR-01: appended in place (a copy per event made one id with many events quadratic).
      for (const e of events) {
        const list = by.get(e.install);
        if (list) list.push(e);
        else by.set(e.install, [e]);
      }
      const now = ctx.now();
      await g.putInstallSummaries([...by].map(([i, ev]) => summarize(i, ev, tzs.get(i) ?? null, now)));
      installs += by.size;
    }
    if (touched.installs.length < BATCH) {
      done = true;
      break;
    }
    // A full page: continue after its newest position (ids whose newest event is later come next).
    wm = touched.maxSeq;
    await g.setWatermark(WATERMARK, wm);
  }
  // Everything below the horizon has been read: the next run starts there.
  if (done && horizon - 1 > wm) {
    wm = horizon - 1;
    await g.setWatermark(WATERMARK, wm);
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
  const top = sums.reduce((m, s) => Math.max(m, s.tutorialMax), 0);
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


/**
 * Beast Mode OPS-06: battle outcomes from the shared statistics of installs first seen in the last `days` days:
 * per Shadow Trial tier, attempts and clears; per Keep, raids and the share ended by surrender. A staff report;
 * it reads the raw events of those installs (statistics are an opted-in adult sample).
 */
type BattleOutcomes = { tiers: { tier: number; attempts: number; clears: number; clearRate: number }[]; keeps: { keep: number; raids: number; surrenders: number; surrenderShare: number; scoutLeaves: number }[]; graphicsLost: { lost: number; stuck: number } };

export function battleOutcomesOf(events: StatsEventRow[]): BattleOutcomes {
  const counts: StatsBattleCount[] = [];
  for (const e of events) {
    const k = battleCountKey(e.name, e.props);
    if (k) counts.push({ ...k, n: 1 });
  }
  return battleOutcomesFromCounts(counts);
}

/** SECR-01: the report from counted events (`Repo.statsBattleCounts`), so the store never hands over every event. */
function battleOutcomesFromCounts(counts: StatsBattleCount[]): BattleOutcomes {
  const tiers = new Map<number, { attempts: number; clears: number }>();
  const keeps = new Map<number, { raids: number; surrenders: number; scoutLeaves: number }>();
  const graphicsLost = { lost: 0, stuck: 0 };
  const keep = (n: number) => keeps.get(n) ?? { raids: 0, surrenders: 0, scoutLeaves: 0 };
  for (const c of counts) {
    if (c.name === 'trial_end' && c.num !== null) {
      const t = tiers.get(c.num) ?? { attempts: 0, clears: 0 };
      t.attempts += c.n;
      if (c.flag) t.clears += c.n;
      tiers.set(c.num, t);
    } else if (c.name === 'raid_end' && c.num !== null) {
      const k = keep(c.num);
      k.raids += c.n;
      if (c.flag) k.surrenders += c.n;
      keeps.set(c.num, k);
    } else if (c.name === 'scout_leave' && c.num !== null) {
      // Beast Mode OPS-06: a scouted base left before any deployment (the pre-battle quit).
      const k = keep(c.num);
      k.scoutLeaves += c.n;
      keeps.set(c.num, k);
    } else if (c.name === 'webgl_lost') {
      if (c.flag) graphicsLost.stuck += c.n;
      else graphicsLost.lost += c.n;
    }
  }
  const share = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);
  return {
    tiers: [...tiers].sort((a, b) => a[0] - b[0]).map(([tier, v]) => ({ tier, ...v, clearRate: share(v.clears, v.attempts) })),
    keeps: [...keeps].sort((a, b) => a[0] - b[0]).map(([keep, v]) => ({ keep, ...v, surrenderShare: share(v.surrenders, v.raids) })),
    graphicsLost,
  };
}

export async function battleOutcomes(ctx: ServerContext, days: unknown) {
  const n = Math.max(1, Math.min(90, Math.floor(Number(days)) || 30));
  const today = utcDay(ctx.now());
  const installs = (await ctx.repo.installSummaries('utc', today - n, today + 1)).length;
  // SECR-01: counted by the store (it used to read every event and spread them into one array, a RangeError past ~125k).
  return { days: n, installs, ...battleOutcomesFromCounts(await ctx.repo.statsBattleCounts(today - n, today + 1)) };
}
