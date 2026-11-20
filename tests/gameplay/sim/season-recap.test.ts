/** P5-10: season names and the rollover recap. */
import { describe, expect, it } from 'vitest';
import { passSeason, seasonName } from '../../../src/gameplay/sim/pass';
import { advance } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const DAY = 86_400_000;

describe('season identity (P5-10)', () => {
  it('twelve names, one per season number, the same list for Scroll and league seasons', () => {
    expect(data.pass.seasonNames).toHaveLength(12);
    expect(new Set(data.pass.seasonNames).size).toBe(12);
    expect(seasonName(13, data)).toBe(seasonName(1, data));
    expect(seasonName(0, data)).not.toBe(seasonName(1, data));
  });

  it('the rollover writes a recap: tiers reached, the league, and the raids and stars of the season', () => {
    const { state } = newGame();
    const t0 = data.pass.epoch + 10 * data.pass.seasonDays * DAY + DAY;
    let s = advance({ ...state, lastSeenAt: t0 }, t0, data).state;
    expect(s.pass.startStats).toBeDefined();
    s = { ...s, stats: { ...s.stats, raidsWon: s.stats.raidsWon + 7, starsEarned: s.stats.starsEarned + 15 }, pass: { ...s.pass, points: data.pass.pointsPerTier * 3 } };
    const next = data.pass.epoch + (passSeason(t0, data) + 1) * data.pass.seasonDays * DAY + 1;
    s = advance(s, next, data).state;
    expect(s.pass.lastSeason).toMatchObject({ season: passSeason(t0, data), tiers: 3, raidsWon: 7, stars: 15 });
    expect(data.ranks.leagues.map((l) => l.id)).toContain(s.pass.lastSeason!.league);
  });
});
