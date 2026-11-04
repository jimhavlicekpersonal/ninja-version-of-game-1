/**
 * The weekly review (roadmap step 54): the numbers to look at every week, with
 * the things that need attention called out. Economy (what came into and left
 * server-held villages, by reason), PvP (battles, desync rate), money
 * (purchases, refund rate), ratings (spread and how settled they are) and the
 * Honor ladder. Fixes go through the data files (src/gameplay/data), never
 * hand edits of player data; staff corrections go through the admin tool.
 */
import type { ReviewStats } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';

export interface Review extends ReviewStats {
  since: number;
  days: number;
  rates: { desync: number; refund: number };
  /** Resources by net change: positive = more came in than went out. */
  economy: { resource: string; in: number; out: number; net: number; biggestSource: string | null; biggestSink: string | null }[];
  attention: string[];
}

const pct = (n: number) => Math.round(n * 10_000) / 100;

export async function weeklyReview(ctx: ServerContext, rawDays: unknown): Promise<Review> {
  const days = rawDays === undefined ? 7 : Number(rawDays);
  if (!Number.isFinite(days) || days < 1 || days > 90) throw new ApiError(400, 'bad_request', 'days must be 1 to 90.');
  const since = ctx.now() - days * 24 * HOUR;
  const s = await ctx.repo.reviewStats(since);
  const desync = s.battles.total ? s.battles.desyncs / s.battles.total : 0;
  const refund = s.purchases.count ? s.purchases.refunds / s.purchases.count : 0;
  const byResource = new Map<string, Review['economy'][number]>();
  for (const l of s.ledger) {
    const e = byResource.get(l.resource) ?? { resource: l.resource, in: 0, out: 0, net: 0, biggestSource: null, biggestSink: null };
    if (l.delta > 0) e.in += l.delta;
    else e.out -= l.delta;
    e.net += l.delta;
    byResource.set(l.resource, e);
  }
  for (const e of byResource.values()) {
    const lines = s.ledger.filter((l) => l.resource === e.resource);
    const top = (sign: 1 | -1) => lines.filter((l) => Math.sign(l.delta) === sign).sort((a, b) => sign * (b.delta - a.delta))[0]?.reason ?? null;
    e.biggestSource = top(1);
    e.biggestSink = top(-1);
  }
  const attention: string[] = [];
  if (s.battles.total >= 50 && desync > 0.01) attention.push(`Desync rate ${pct(desync)}% (over 1%): a build and the server disagree on battle rules; check desyncs by build in the metrics.`);
  if (s.purchases.count >= 20 && refund > 0.05) attention.push(`Refund rate ${pct(refund)}% (over 5%): look for refund abuse or a delivery problem.`);
  if (s.ratings.rated >= 50 && s.ratings.medianRd > ctx.data.ranks.rating.initialRd * 0.6) attention.push(`Ratings are not settling (median deviation ${s.ratings.medianRd}): players fight too few rated battles, or matchmaking falls back to bots too often.`);
  if (s.ratings.rated >= 50 && s.ratings.attackSd < 60) attention.push(`Attack Ratings are bunched (spread ${s.ratings.attackSd}): matchmaking by rating does little; check rating-convergence assumptions.`);
  const moon = byResource.get('moonstones');
  if (moon && moon.in > 0 && moon.out / moon.in < 0.3) attention.push(`Jade piles up: only ${Math.round((moon.out / moon.in) * 100)}% of the Jade that came in was spent.`);
  if (s.players.active && s.players.new / Math.max(1, s.players.active) > 0.8) attention.push('Most active players are new this period: watch early retention and the tutorial.');
  return { ...s, since, days, rates: { desync: pct(desync), refund: pct(refund) }, economy: [...byResource.values()].sort((a, b) => a.resource.localeCompare(b.resource)), attention };
}
