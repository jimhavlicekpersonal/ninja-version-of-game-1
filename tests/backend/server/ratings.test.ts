/**
 * Ranking on the server (roadmap steps 28-31): ratings move with real battles
 * (never with bots), matchmaking picks the fairest base, a defender's daily
 * honor loss is capped, a rebuilt layout starts its Base Rating over, and the
 * Power Ranking lists rated players.
 */
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { newRating } from '../../../src/gameplay/sim/rating';
import type { GameData } from '../../../src/gameplay/sim/types';
import { baseAt, HOUR, rush, world, startSeed } from './harness';
import { repoFactories } from './pg';

const def = defaultData.ranks.rating;

function withRating(over: Partial<GameData['ranks']['rating']>): GameData {
  return { ...defaultData, ranks: { ...defaultData.ranks, rating: { ...def, ...over } } };
}

for (const [label, makeRepo] of repoFactories) {
  describe(`ratings on ${label} storage`, () => {
    it('moves the attacker’s Attack Rating and the defender’s Base Rating, never against a bot', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann', baseAt(1));
      w.pastShields();
      const bot = (await ann.match())!;
      expect(bot.opponent.kind).toBe('bot');
      await ann.submitAttack({ ticket: bot.ticket, seed: await startSeed(ann, bot.ticket), ...rush(20) });
      expect((await w.repo.getPlayer(ann.id))!.ratings).toBeUndefined();
      const dot = await w.player('Dot', baseAt(1, 77));
      await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
      w.advance(HOUR + 1); // the bot is no longer "recent"; Dot is
      const m = (await ann.match())!;
      expect(m.opponent.name).toBe('Dot');
      const r = await ann.submitAttack({ ticket: m.ticket, seed: await startSeed(ann, m.ticket), ...rush(20) });
      const a = (await w.repo.getPlayer(ann.id))!.ratings!;
      const d = (await w.repo.getPlayer(dot.id))!.ratings!;
      expect(a.attack.battles).toBe(1);
      expect(d.base.battles).toBe(1);
      expect(Math.sign(a.attack.rating - def.initial)).toBe(-Math.sign(d.base.rating - def.initial));
      expect(Math.abs(a.attack.rating - def.initial)).toBeGreaterThan(0);
      expect(r.result).toBeTruthy();
    });

    it('caps the honor a defender loses in one UTC day', async () => {
      // Staked honor (balance audit 2026-11-08) makes a lost defence free by default; the cap still holds where a share is lost.
      const capped = withRating({ defenderDailyHonorLossCap: 10 });
      const w = world({ repo: await makeRepo(), data: { ...capped, ranks: { ...capped.ranks, defenseHonorLossShare: 1 } }, start: Date.UTC(2026, 3, 6, 1) });
      // No defenses, so the raids win and the defender loses honor.
      const open = baseAt(1, 77);
      open.buildings = open.buildings.filter((b) => defaultData.buildings[b.type].category !== 'defense');
      const dot = await w.player('Dot', open);
      const raiders = [await w.player('Ann', baseAt(1)), await w.player('Ben', baseAt(1, 5))];
      const g = await raiders[0].createGrove('Pair');
      await raiders[1].joinGrove(g.id); // so the two raiders never match each other
      w.pastShields();
      const raid = async (who: (typeof raiders)[number]) => {
        await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
        const m = (await who.match())!;
        expect(m.opponent.name).toBe('Dot');
        return who.submitAttack({ ticket: m.ticket, seed: await startSeed(who, m.ticket), ...rush(20) });
      };
      await w.repo.updatePlayer(dot.id, { trophies: 500 }); // honor to lose
      const start = (await dot.me()).trophies;
      const first = await raid(raiders[0]);
      expect(first.trophies).toBeGreaterThan(0); // a win, so the defender loses honor
      expect(start - (await dot.me()).trophies).toBe(Math.min(10, first.trophies));
      const second = await raid(raiders[1]);
      expect(second.trophies).toBeGreaterThan(0); // the attacker still gains
      expect(start - (await dot.me()).trophies).toBe(10); // the defender has lost all it can today
      expect((await dot.defenses(0)).defenses.map((x) => x.trophies)).toEqual([-Math.min(10, first.trophies), Math.min(10, first.trophies) - 10]);
    });

    it('pairs an attacker with the base nearest the target expected score', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann', baseAt(1));
      const easy = await w.player('Easy', baseAt(1, 7));
      const fair = await w.player('Fair', baseAt(1, 9));
      w.pastShields();
      const t = w.now();
      const rated = (r: number) => ({ attack: newRating(t, def), base: { rating: r, rd: def.minRd, battles: 30, at: t } });
      await w.repo.updatePlayer(ann.id, { ratings: { attack: { rating: 1700, rd: def.minRd, battles: 30, at: t }, base: newRating(t, def) } });
      await w.repo.updatePlayer(easy.id, { ratings: rated(1100) });
      await w.repo.updatePlayer(fair.id, { ratings: rated(1680) });
      for (let i = 0; i < 3; i++) {
        const m = (await ann.match())!;
        expect(m.opponent.name).toBe('Fair');
        w.advance(6 * 60_000); // let the lock go
      }
    });

    it('starts the Base Rating over when the layout changes a lot', async () => {
      const w = world({ repo: await makeRepo() });
      const base = baseAt(2, 3);
      const ann = await w.player('Ann', base);
      const t = w.now();
      await w.repo.updatePlayer(ann.id, { ratings: { attack: { rating: 1600, rd: 80, battles: 20, at: t }, base: { rating: 1900, rd: 80, battles: 20, at: t } } });
      const nudged = structuredClone(base);
      await ann.uploadBase({ base: nudged });
      expect((await w.repo.getPlayer(ann.id))!.ratings!.base.rating).toBe(1900);
      const other = baseAt(2, 99); // a different layout
      await ann.uploadBase({ base: other });
      const after = (await w.repo.getPlayer(ann.id))!.ratings!;
      expect(after.base).toMatchObject({ rating: def.initial, rd: def.initialRd, battles: 0 });
      expect(after.attack.rating).toBe(1600); // the attacker's skill is untouched
    });

    it('lists the Power Ranking: rated players by skill plus Keep', async () => {
      const w = world({ repo: await makeRepo() });
      const t = w.now();
      const players = [await w.player('Low', baseAt(1)), await w.player('High', baseAt(3)), await w.player('New', baseAt(5))];
      await w.repo.updatePlayer(players[0].id, { ratings: { attack: { rating: 1800, rd: 60, battles: 10, at: t }, base: newRating(t, def) } });
      await w.repo.updatePlayer(players[1].id, { ratings: { attack: { rating: 1600, rd: 60, battles: 10, at: t }, base: newRating(t, def) } });
      const board = await players[0].powerLeaderboard(10);
      // High: 1600 + 2β = 1900 beats Low: 1800 + 0; New has no rated attacks yet.
      expect(board.players.map((p) => [p.name, p.power])).toEqual([
        ['High', 1600 + 2 * def.powerWeight],
        ['Low', 1800],
      ]);
      expect(board.me).toEqual({ rank: 2, power: 1800, battles: 10 });
      expect((await players[2].powerLeaderboard(10)).me).toBeNull();
    });
  });
}
