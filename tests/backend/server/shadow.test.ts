/**
 * Shadow Clans on the server (protocol 4), with the shipped game data:
 * new-player protection, eligible defenders, the population transition,
 * targeted and AI matches, Shadow Rank (real players only), seasons, regions,
 * factions, tournaments and the liquidity metrics.
 */
import { describe, expect, it } from 'vitest';
import { ServerError } from '../../../src/backend/net/ports';
import { PROTOCOL_VERSION } from '../../../src/backend/net/protocol';
import { defaultData } from '../../../src/gameplay/sim/data';
import { applyLootPenalty } from '../../../src/gameplay/sim/matchmaking';
import type { GameData } from '../../../src/gameplay/sim/types';
import { shadowSeason } from '../../../src/gameplay/sim/world/competition';
import { tournamentAt, tournamentBases, tournamentLevels } from '../../../src/gameplay/sim/world/tournament';
import { clanVillage } from '../../../src/gameplay/sim/world/villagegen';
import { HOUR, baseAt, rush, world } from './harness';
import { repoFactories } from './pg';

const DAY = 24 * HOUR;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e.code;
    throw e;
  }
  return 'ok';
}

for (const [label, makeRepo] of repoFactories) {
const W = async (data: GameData = defaultData) => world({ data, repo: await makeRepo() });

describe(`Shadow Clans server on ${label} storage`, () => {
describe('protocol 4', () => {
  it('announces its features and still accepts older clients', async () => {
    const w = await W();
    const h = w.core.hello();
    expect(h.protocol).toBe(PROTOCOL_VERSION);
    expect(h.protocol).toBe(4);
    expect(h.minProtocol).toBe(2);
    for (const f of ['candidates', 'shadow_rank', 'regions', 'factions', 'tournaments', 'metrics']) expect(h.features).toContain(f);
  });
});

describe('new-player protection', () => {
  it('Keep 1-2 never meet real players and are never offered to them', async () => {
    const w = await W();
    const low = await w.player('Low', baseAt(2));
    const mid = await w.player('Mid', baseAt(3));
    w.pastShields();
    expect((await low.match())!.opponent.kind).toBe('bot');
    expect((await low.candidates()).candidates).toEqual([]);
    expect((await mid.match())!.opponent.kind).toBe('bot'); // Keep 3 is opt-in
    expect(await code(mid.matchWith({ target: low.id }))).toBe('not_found');
  });

  it('Keep 3 takes part only after opting in; Keep 4 is standard', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const b = await w.player('Ben', baseAt(3));
    w.pastShields();
    expect((await a.match())!.opponent.kind).toBe('bot');
    const me = await b.setPvp(true);
    expect(me.pvpOptIn).toBe(true);
    expect((await a.match())!.opponent).toMatchObject({ kind: 'player', name: 'Ben' });
  });
});

describe('the rivals board on the server', () => {
  it('offers real players in the share the population and capacity allow, labelled as players', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    for (let i = 0; i < 12; i++) await w.player(`P${i}`, baseAt(4 + (i % 2), 100 + i));
    w.pastShields();
    const r = await a.candidates();
    expect(r.eligible).toBeGreaterThanOrEqual(12);
    // 12 eligible -> table 25%; 13 active x 6 attacks = 78 requests, 12 x 4 = 48 capacity -> min(25%, 61%).
    expect(r.humanShare).toBeCloseTo(0.25, 6);
    expect(r.candidates.length).toBeLessThanOrEqual(defaultData.clans.candidates.count);
    for (const c of r.candidates) {
      expect(c.base.human).toBe(true);
      expect(c.base.clan).toBeUndefined();
      expect(c.shadowRank).toBeNull();
    }
  });

  it('a defender who took the day\'s share of real attacks is no longer offered', async () => {
    const w = await W();
    const d = await w.player('Dee', baseAt(4));
    const attackers = [];
    for (let i = 0; i < 6; i++) attackers.push(await w.player(`A${i}`, baseAt(4, 50 + i)));
    w.pastShields();
    const cap = defaultData.competition.population.maxAttacksPerDefenderPerDay;
    let hits = 0;
    for (const a of attackers) {
      if (hits >= cap) break;
      // Keep the defender unshielded between attacks (a 0-troop attack does no damage).
      const m = await a.matchWith({ target: d.id });
      await a.submitAttack({ ticket: m.ticket, seed: 1, army: {}, deployments: [], endTick: 1 });
      hits++;
    }
    expect(hits).toBe(cap);
    const last = attackers[attackers.length - 1];
    expect(await code(last.matchWith({ target: d.id }))).toBe('conflict');
    w.advance(DAY + HOUR);
    expect(await code(last.matchWith({ target: d.id }))).toBe('ok');
  });

  it('refuses a target that is shielded, recently attacked or in the same Alliance', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const b = await w.player('Ben', baseAt(4, 77));
    expect(await code(a.matchWith({ target: b.id }))).toBe('conflict'); // new-player shield
    w.pastShields();
    const m = await a.matchWith({ target: b.id });
    expect(m.opponent.kind).toBe('player');
    await a.submitAttack({ ticket: m.ticket, seed: 1, army: {}, deployments: [], endTick: 1 });
    expect(await code(a.matchWith({ target: b.id }))).toBe('conflict'); // recent opponent
    const c = await w.player('Cat', baseAt(4, 78));
    w.pastShields();
    const g = await b.createGrove('Hidden Leaf');
    await c.joinGrove(g.id);
    expect(await code(b.matchWith({ target: c.id }))).toBe('conflict');
  });

  it('rebuilds an AI clan village from clan, seed and strength, inside the band only', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const m = await a.matchWith({ ai: { clan: 'iron_serpent', seed: 4242, strength: 3.4 } });
    expect(m.opponent.kind).toBe('bot');
    const expected = applyLootPenalty(clanVillage('iron_serpent', 4242, 3.4, defaultData), 4, defaultData);
    expect(m.base.buildings).toEqual(expected.buildings);
    expect(m.base.clan).toBe('iron_serpent');
    expect(await code(a.matchWith({ ai: { clan: 'iron_serpent', seed: 1, strength: 5.5 } }))).toBe('bad_request');
    expect(await code(a.matchWith({ ai: { clan: 'nobody', seed: 1, strength: 3.4 } }))).toBe('bad_request');
  });
});

describe('Shadow Rank', () => {
  it('moves only for battles between real players', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const b = await w.player('Ben', baseAt(4, 99));
    w.pastShields();
    expect((await a.me()).shadowRank).toBeNull();
    // A generated village: Honor may move, Shadow Rank does not.
    const bot = await a.matchWith({ ai: { clan: 'iron_serpent', seed: 5, strength: 3.5 } });
    const r1 = await a.submitAttack({ ticket: bot.ticket, seed: 1, ...rush(40) });
    expect(r1.rating).toBe(0);
    expect((await a.me()).shadowRank).toBeNull();
    // A real player.
    const m = await a.matchWith({ target: b.id });
    const r2 = await a.submitAttack({ ticket: m.ticket, seed: 1, ...rush(60) });
    const mine = (await a.me()).shadowRank!;
    const theirs = (await b.me()).shadowRank!;
    expect(mine.games).toBe(1);
    expect(mine.rating).toBe(defaultData.competition.shadowRank.start + r2.rating!);
    expect(theirs.defense).toBe(defaultData.competition.shadowRank.start - r2.rating!);
    expect(theirs.rating).toBe(defaultData.competition.shadowRank.start);
    // Rank and defense boards list rated players only.
    const board = await a.leaderboard(10, 'rank');
    expect(board.board).toBe('rank');
    expect(board.players.map((p) => p.name).sort()).toEqual(['Ann', 'Ben']);
  });

  it('a new season pulls ratings halfway back and remembers the last one', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    w.setTime(defaultData.competition.shadowRank.epoch + 3 * DAY);
    await w.repo.updatePlayer(a.id, { rating: 1400, defenseRating: 1200, ratedGames: 20, ratingSeason: 0 });
    expect((await a.me()).shadowRank!.rating).toBe(1400);
    w.advance(defaultData.competition.shadowRank.seasonDays * DAY);
    const me = await a.me();
    expect(shadowSeason(w.now(), defaultData)).toBe(1);
    expect(me.shadowRank).toMatchObject({ rating: 1200, defense: 1100, season: 1 });
    expect(me.lastSeason).toEqual({ season: 0, rating: 1400 });
  });
});

describe('regions, factions and the world', () => {
  it('fills a regional instance, then opens a new one', async () => {
    const small: GameData = { ...defaultData, competition: { ...defaultData.competition, regions: { capacity: 2 } } };
    const w = await W(small);
    const ps = [await w.player('A'), await w.player('B'), await w.player('C')];
    const regions = await Promise.all(ps.map(async (p) => (await p.me()).region));
    expect(regions[0]).toBe(regions[1]);
    expect(regions[2]).not.toBe(regions[0]);
    const info = await ps[2].world();
    expect(info.region).toMatchObject({ players: 1, capacity: 2 });
  });

  it('counts real players per AI faction, and humans lead only with enough active members', async () => {
    const w = await W();
    const ps = [];
    for (const n of ['Aki', 'Ben', 'Cal']) ps.push(await w.player(n, baseAt(4, n.charCodeAt(0))));
    const foe = await w.player('Foe', baseAt(4, 7));
    w.pastShields();
    await ps[0].setFaction('crimson_fang');
    await ps[1].setFaction('crimson_fang');
    let info = await ps[0].world();
    expect(info.factions.crimson_fang).toEqual({ humans: 2, leader: null });
    await ps[2].setFaction('crimson_fang');
    // Ben wins a real battle (recorded directly): the only contributor, so Ben leads.
    const won = { stars: 2, destruction: 70, hallDestroyed: true, loot: {}, used: {}, ticks: 100, endReason: 'time' as const, hash: 'x' };
    await w.repo.addAttack({ id: 'win1', at: w.now(), attackerId: ps[1].id, attackerName: 'Ben', defenderId: foe.id, seed: 1, army: {}, base: baseAt(4), deployments: [], result: won, attackerTrophies: 20, defenderTrophies: -20 });
    info = await ps[0].world();
    expect(info.factions.crimson_fang.humans).toBe(3);
    expect(info.factions.crimson_fang.leader).toBe('Ben');
    expect(await code(ps[0].setFaction('not_a_clan'))).toBe('bad_request');
    expect((await ps[0].setFaction(null)).faction).toBeNull();
  });
});

describe('normalized tournaments', () => {
  it('scores re-simulated battles at standard levels, keeps the best and ranks totals', async () => {
    const w = await W();
    const t = defaultData.competition.tournament;
    w.setTime(t.epoch + 4 * t.periodDays * DAY + HOUR);
    const a = await w.player('Ann', baseAt(4));
    const b = await w.player('Ben', baseAt(4, 3));
    const id = tournamentAt(w.now(), defaultData).id;
    const army = { hedgehog_roller: 60, frog_lobber: 40 };
    const deployments = Array.from({ length: 100 }, (_, i) => ({ tick: i, troop: i < 60 ? 'hedgehog_roller' : 'frog_lobber', x: 1, y: 2 + (i % 30) }));
    const r1 = await a.submitTournament({ tournament: id, index: 0, seed: 3, army, deployments });
    expect(r1.best).toBe(r1.score);
    const r2 = await a.submitTournament({ tournament: id, index: 0, seed: 3, army, deployments: [] });
    expect(r2.best).toBe(r1.score);
    expect(r2.total).toBe(r1.score);
    await b.submitTournament({ tournament: id, index: 1, seed: 3, army, deployments: deployments.slice(0, 5) });
    const board = await a.tournament();
    expect(board.tournament).toBe(id);
    expect(board.top[0].score).toBeGreaterThanOrEqual(board.top[board.top.length - 1].score);
    expect(board.me?.score).toBe(r1.score);
    // Same fortress and levels as the client builds.
    expect(tournamentBases(id, defaultData)[0].hallLevel).toBe(t.hall);
    expect(tournamentLevels(defaultData).hedgehog_roller).toBe(t.troopLevel);
    expect(await code(a.submitTournament({ tournament: id, index: 0, seed: 3, army: { beetle_brute: 999 }, deployments }))).toBe('bad_request');
    w.advance(t.durationDays * DAY);
    expect(await code(a.submitTournament({ tournament: id, index: 0, seed: 3, army, deployments }))).toBe('conflict');
  });
});

describe('matchmaking liquidity metrics', () => {
  it('reports eligible defenders, demand, target share and real vs generated matches per band', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    for (let i = 0; i < 3; i++) await w.player(`P${i}`, baseAt(4, 300 + i));
    w.pastShields();
    await a.matchWith({ ai: { clan: 'iron_serpent', seed: 9, strength: 3.5 } });
    const m = await a.metrics();
    expect(m.bands).toHaveLength(defaultData.hall.levels.length);
    const b4 = m.bands.find((b) => b.hall === 4)!;
    expect(b4.eligible).toBe(4);
    // Demand = players seen in the last day x attacks per player (only Ann was seen since the shields ran out).
    expect(b4.active).toBe(1);
    expect(b4.attackRequestsPerDay).toBe(defaultData.competition.population.attacksPerPlayerPerDay);
    expect(b4.humanShare).toBeCloseTo(0.1, 6);
    expect(m.bands.find((b) => b.hall === 1)!.eligible).toBe(0);
    expect(m.matches24h.bot).toBe(1);
  });
});
});
}
