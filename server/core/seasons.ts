/**
 * League seasons on the server (roadmap step 55). A season is a UTC month
 * (sim/ranks.ts seasonOf). When one ends, the server closes it once (any
 * instance; the `seasons` row is the lock): the Honor leaderboard's top 100 is
 * archived, and every player's Honor is softened by the game's own rule
 * (`seasonResetTrophies`), so the game's local season roll and the server
 * agree. League chests are the game's (`rollSeasons` gives them from the Honor
 * the season ended with; a village kept on the server gets its chest when the
 * server replays its next command).
 */
import { seasonOf } from '../../src/gameplay/sim/ranks';
import type { SeasonLeaderboardResponse } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { ApiError, type ServerContext } from './context';

export const SEASON_ARCHIVE_SIZE = 100;

/** Close every season that ended and is not closed yet (from the first one this server saw). Returns those closed now. */
export async function closeSeasons(ctx: ServerContext): Promise<number[]> {
  const current = seasonOf(ctx.now());
  const last = await ctx.repo.lastClosedSeason();
  // A server that never closed a season (new, or just updated) marks the one that just ended as
  // closed without archiving or resetting it: it did not see that season end, and a reset in the
  // middle of a month would surprise players. Seasons are closed for real from then on.
  const from = last === null ? current - 1 : last + 1;
  const closed: number[] = [];
  for (let s = from; s < current; s++) {
    const first = last === null;
    const r = await ctx.repo.closeSeason(s, ctx.now(), first ? 0 : SEASON_ARCHIVE_SIZE, first ? 2_000_000_000 : ctx.data.ranks.seasonResetFloor);
    if (!r.closed) continue;
    closed.push(s);
    ctx.log('info', 'season closed', { season: s, honorReset: r.reset });
  }
  if (closed.length) await ctx.board.rebuild(ctx.repo);
  return closed;
}

/** The archived top of a past season (default: the last closed one), and the caller's place. */
export async function seasonLeaderboard(ctx: ServerContext, me: Player, rawSeason: unknown, rawLimit: unknown): Promise<SeasonLeaderboardResponse> {
  const last = await ctx.repo.lastClosedSeason();
  const season = rawSeason === undefined || rawSeason === '' ? last : Number(rawSeason);
  if (season === null) return { season: null, players: [], me: null };
  if (!Number.isInteger(season)) throw new ApiError(400, 'bad_request', 'Unknown season.');
  const limit = Math.max(1, Math.min(SEASON_ARCHIVE_SIZE, Number(rawLimit) || 50));
  const mine = await ctx.repo.seasonEntry(season, me.id);
  return {
    season,
    players: (await ctx.repo.seasonBoard(season, limit)).map((e) => ({ rank: e.rank, name: e.name, honor: e.honor, hallLevel: e.keep })),
    me: mine ? { rank: mine.rank, honor: mine.honor } : null,
  };
}
