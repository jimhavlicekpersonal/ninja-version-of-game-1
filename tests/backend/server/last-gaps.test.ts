/**
 * Last gaps 2026-11-14 (docs/store/WORLDWIDE_AUDIT.md): the leaderboards in `UNDER13_MODE=offline`, the shared-replay
 * opponent label without a server record, and the commit-order-safe statistics watermark.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { newRating } from '../../../src/gameplay/sim/rating';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import type { ApiError } from '../../../server/core';
import { RedisClient } from '../../../server/redis';
import { RedisLeaderboard } from '../../../server/shared';
import { baseAt, HOUR, world } from './harness';
import { freshPgRepo, hasPg, repoFactories } from './pg';

const DAY = 24 * HOUR;
const MIN = 60_000;

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ApiError).parts?.[0]?.key ?? String(e);
  }
  return 'ok';
}

const redisUrl = process.env.TEST_REDIS_URL;
const clients: RedisClient[] = [];
afterAll(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

/** Ann, Bob and Kid with bases and ratings; Kid has the most honor and power, then states under 13. */
async function boards(w: ReturnType<typeof world>) {
  const t = w.now();
  const rated = (rating: number) => ({ attack: { rating, rd: 60, battles: 10, at: t }, base: newRating(t, defaultData.ranks.rating) });
  const ann = await w.player('Ann', baseAt(1));
  const bob = await w.player('Bob', baseAt(1));
  const kid = await w.player('Kid', baseAt(1));
  await w.repo.updatePlayer(ann.id, { trophies: 300, ratings: rated(1500) });
  await w.repo.updatePlayer(bob.id, { trophies: 200, ratings: rated(1400) });
  await w.repo.updatePlayer(kid.id, { trophies: 900, ratings: rated(1900) });
  await ann.stateAge({ band: 'adult' });
  await bob.stateAge({ band: 'adult' });
  const kidName = (await w.repo.getPlayer(kid.id))!.name;
  return { ann, bob, kid, kidName };
}

for (const [label, makeRepo] of repoFactories) {
  describe(`leaderboards in offline under-13 mode on ${label} storage (last gaps)`, () => {
    it('neither the honor nor the Power Ranking lists an under-13 player, and ranks do not count them', async () => {
      const w = world({ repo: await makeRepo(), shared: { policy: { under13Mode: 'offline' } } });
      const { ann, kid, kidName } = await boards(w);
      expect((await ann.leaderboard(10)).players.map((p) => p.name)).toContain(kidName);
      expect(await refusal(kid.stateAge({ band: 'under13' }))).toBe('age.under13_offline');
      const honor = await ann.leaderboard(10);
      expect(honor.players.map((p) => [p.rank, p.name])).toEqual([
        [1, 'Ann'],
        [2, 'Bob'],
      ]);
      expect(honor.me).toEqual({ rank: 1, trophies: 300 });
      w.advance(HOUR); // past the Power Ranking cache
      const power = await ann.powerLeaderboard(10);
      expect(power.players.map((p) => p.name)).toEqual(['Ann', 'Bob']);
      expect(power.me?.rank).toBe(1);
    });

    it('limited mode keeps them listed under their generated name (no id is served, so no way to find them)', async () => {
      const w = world({ repo: await makeRepo(), shared: { policy: { under13Mode: 'limited' } } });
      const { ann, kid, kidName } = await boards(w);
      await kid.stateAge({ band: 'under13' });
      const honor = await ann.leaderboard(10);
      expect(honor.players[0]).toMatchObject({ rank: 1, name: kidName });
      expect(Object.keys(honor.players[0]!)).not.toContain('id');
      // Friend requests by that name are refused in every mode.
      expect(await refusal(ann.sendFriendRequest({ name: kidName }))).toBe('friend.no_name');
    });
  });

  describe(`shared replay labels on ${label} storage (last gaps)`, () => {
    const battle = (seed: number) => {
      const base = generateOpponent(7, 2, defaultData);
      const army = { hedgehog_roller: 10 };
      const deployments = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i }));
      const setup = { seed, base, army, infiltration: true };
      return { setup, deployments, result: runBattle(setup, deployments, defaultData).result };
    };
    const req = (b: ReturnType<typeof battle>, opponent: 'player' | 'generated' | 'practice') => ({ setup: b.setup, deployments: b.deployments, rules: SIM_RULES, opponent });

    it("says 'real player' only for a battle the server recorded", async () => {
      const w = world({ repo: await makeRepo() });
      const a = await w.player('Ayla');
      await a.stateAge({ band: 'adult' });
      const me = (await w.repo.getPlayer(a.id))!;
      const label = async (b: ReturnType<typeof battle>, asked: 'player' | 'generated' | 'practice') => (await w.core.growth.sharedReplay((await w.core.growth.shareReplay(me, req(b, asked))).code)).opponent;
      // No attack record with this seed (older than the records, or a forged seed): not shown as a real player.
      expect(await label(battle(901), 'player')).toBe('practice');
      expect(await label(battle(902), 'generated')).toBe('generated');
      expect(await label(battle(903), 'practice')).toBe('practice');
      // A raid on Ayla's own base the server recorded (a shared defense): a real player.
      const raider = (await w.repo.getPlayer((await w.player('Rex')).id))!;
      const defense = battle(904);
      await w.repo.addAttack({ id: 'atk-904', at: w.now(), attackerId: raider.id, attackerName: raider.name, defenderId: me.id, seed: 904, army: defense.setup.army, base: defense.setup.base, deployments: defense.deployments, result: defense.result, attackerTrophies: 0, defenderTrophies: 0 });
      expect(await label(defense, 'player')).toBe('player');
      // Records older than the lookback no longer prove it.
      w.advance(32 * DAY);
      expect(await label(defense, 'player')).toBe('practice');
    });
  });

  describe(`statistics watermark on ${label} storage (last gaps)`, () => {
    const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const ID_C = '16fd2706-8baf-433b-82eb-8c7fada847da';
    const ev = (at: number) => ({ name: 'session_start', at, props: {} });

    it('a batch committed after a run read past its receipt time is rolled by the next run', async () => {
      const T0 = Date.UTC(2026, 10, 1, 10);
      const w = world({ repo: await makeRepo(), start: T0 });
      await w.core.postStats({ install: ID_A, build: 't', events: [ev(T0)] });
      w.advance(3 * MIN);
      await w.core.postStats({ install: ID_B, build: 't', events: [ev(w.now())] });
      w.advance(7 * MIN);
      await w.core.rollupStats();
      // Receipt time T0 + 1 min, taken before a slow insert that commits only now (well past any lag window).
      await w.repo.addStatsEvents(ID_C, 't', '', [ev(T0 + MIN)], T0 + MIN);
      w.advance(HOUR);
      await w.core.rollupStats();
      const all = await w.repo.installSummaries('utc', 0, 100_000);
      expect(all.map((s) => s.install).sort()).toEqual([ID_A, ID_B, ID_C].sort());
      // Nothing is read twice.
      w.advance(HOUR);
      expect((await w.core.rollupStats()).installs).toBe(0);
    });
  });
}

describe.skipIf(!hasPg)('statistics watermark against a transaction still open in Postgres (last gaps)', () => {
  it('a run during an open insert leaves it for the next run', async () => {
    const T0 = Date.UTC(2026, 10, 1, 10);
    const repo = await freshPgRepo();
    const w = world({ repo, start: T0 });
    const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const ID_C = '16fd2706-8baf-433b-82eb-8c7fada847da';
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let inserted!: () => void;
    const started = new Promise<void>((r) => (inserted = r));
    const slow = repo.transaction(async (tx) => {
      await tx.addStatsEvents(ID_C, 't', '', [{ name: 'session_start', at: T0, props: {} }], T0);
      inserted();
      await gate;
    });
    await started;
    w.advance(MIN);
    await w.core.postStats({ install: ID_A, build: 't', events: [{ name: 'session_start', at: w.now(), props: {} }] });
    w.advance(10 * MIN);
    expect((await w.core.rollupStats()).installs).toBe(0); // the open transaction holds the horizon below A too
    release();
    await slow;
    w.advance(HOUR);
    expect((await w.core.rollupStats()).installs).toBe(2);
    expect((await repo.installSummaries('utc', 0, 100_000)).map((s) => s.install).sort()).toEqual([ID_A, ID_C].sort());
  });
});

describe.skipIf(!redisUrl)('the Redis honor board in offline under-13 mode (last gaps)', () => {
  it('rebuilds without under-13 players and drops one still in the set when it is read', async () => {
    const c = RedisClient.fromUrl(redisUrl!);
    clients.push(c);
    const key = `test:${process.pid}:${Math.random().toString(36).slice(2)}:board`;
    const w0 = world();
    const board = new RedisLeaderboard(c, key, { repo: w0.repo, rebuildFilter: { hideUnder13: true } });
    const w = world({ repo: w0.repo, shared: { board, policy: { under13Mode: 'offline' } } });
    const { ann, bob, kid } = await boards(w);
    for (const p of [ann, bob, kid]) {
      const row = (await w.repo.getPlayer(p.id))!;
      await board.set(row.id, row.trophies, row.createdAt);
    }
    // Stated before the server went offline-mode: the set still holds the player.
    await w.repo.setAgeBand(kid.id, 'under13', w.now());
    expect((await board.top(10)).map((e) => e.id)).toContain(kid.id);
    expect((await ann.leaderboard(10)).players.map((p) => p.name)).toEqual(['Ann', 'Bob']);
    expect((await board.top(10)).map((e) => e.id)).not.toContain(kid.id);
    await c.command('DEL', key);
    expect(await board.rebuildIfMissing(w.repo)).toBe(2);
    expect((await board.top(10)).map((e) => e.id)).toEqual([ann.id, bob.id]);
    await c.command('DEL', key);
  });
});
