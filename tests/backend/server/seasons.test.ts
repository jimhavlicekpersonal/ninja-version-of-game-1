/**
 * League seasons on the server (roadmap step 55): when a month ends, its Honor
 * top is archived and every player's Honor is softened by the game's own rule,
 * once, however many instances try.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { seasonOf, seasonResetTrophies } from '../../../src/gameplay/sim/ranks';
import { baseAt, world } from './harness';
import { repoFactories } from './pg';

for (const [label, makeRepo] of repoFactories) {
  describe(`seasons on ${label} storage`, () => {
    it('archives the ladder and softens Honor once, with the game\'s rule', async () => {
      const w = world({ repo: await makeRepo(), start: Date.UTC(2026, 3, 20) });
      const ann = await w.player('Ann', baseAt(2));
      const bob = await w.player('Bob', baseAt(2, 9));
      const cy = await w.player('Cyd'); // no base: not ranked, still reset
      await w.repo.updatePlayer(cy.id, { trophies: 5000 });
      // The first run only marks the month that just ended (no archive, no reset in mid-month).
      expect(await w.core.closeSeasons()).toEqual([seasonOf(w.now()) - 1]);
      expect((await cy.me()).trophies).toBe(5000);
      expect((await ann.seasonLeaderboard()).players).toEqual([]);
      await w.repo.updatePlayer(ann.id, { trophies: 2400 });
      await w.repo.updatePlayer(bob.id, { trophies: 350 });
      await w.repo.updatePlayer(cy.id, { trophies: 901 });
      w.setTime(Date.UTC(2026, 4, 1, 0, 30)); // April ended
      const april = seasonOf(Date.UTC(2026, 3, 20));
      expect(await w.core.closeSeasons()).toEqual([april]);
      expect(await w.core.closeSeasons()).toEqual([]); // once
      expect((await ann.me()).trophies).toBe(seasonResetTrophies(2400, data));
      expect((await bob.me()).trophies).toBe(350); // below the floor
      expect((await cy.me()).trophies).toBe(seasonResetTrophies(901, data));
      const lb = await ann.seasonLeaderboard();
      expect(lb.season).toBe(april);
      expect(lb.players.map((p) => [p.name, p.honor])).toEqual([
        ['Ann', 2400],
        ['Bob', 350],
      ]);
      expect(lb.me).toEqual({ rank: 1, honor: 2400 });
      expect((await cy.seasonLeaderboard()).me).toBeNull();
      // The live ladder shows the softened Honor.
      expect((await ann.leaderboard(5)).players[0].trophies).toBe(seasonResetTrophies(2400, data));
    });
  });
}
