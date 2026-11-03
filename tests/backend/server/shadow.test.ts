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
import { maxOffenseAtHall } from '../../../src/gameplay/sim/world/power';
import { HOUR, baseAt, rush, world } from './harness';
import { InProcessServerAdapter } from '../../../server/inProcess';
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

  it('puts the fairest matchup first: defense measured against the attacker\'s offense', async () => {
    const allHuman: GameData = { ...defaultData, competition: { ...defaultData.competition, population: { ...defaultData.competition.population, humanShareByEligible: [{ min: 0, share: 1 }] } } };
    const w = await W(allHuman);
    const a = await w.player('Ann', baseAt(4));
    const low = await w.player('Low', baseAt(3, 31));
    await low.setPvp(true);
    await w.player('High', baseAt(5, 51));
    w.pastShields();
    const weak = await a.candidates(maxOffenseAtHall(3, defaultData));
    expect(weak.candidates.map((c) => c.name)[0]).toBe('Low');
    const strong = await a.candidates(maxOffenseAtHall(5, defaultData));
    expect(strong.candidates.map((c) => c.name)[0]).toBe('High');
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
    expect(info.factions.crimson_fang).toMatchObject({ humans: 2, leader: null });
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

describe('alternate accounts', () => {
  it('accounts registered from one install never meet in PvP', async () => {
    const w = await W();
    const reg = async (name: string, device: string, seed: number) => {
      const c = new InProcessServerAdapter(w.core);
      const r = await c.register(name, device);
      await c.uploadBase({ base: baseAt(4, seed) });
      return Object.assign(c, { id: r.playerId });
    };
    const main = await reg('Main', 'install-aaaaaaaa', 1);
    const alt = await reg('Alt', 'install-aaaaaaaa', 2);
    await reg('Other', 'install-bbbbbbbb', 3);
    w.pastShields();
    expect(await code(main.matchWith({ target: alt.id }))).toBe('conflict');
    for (let i = 0; i < 5; i++) {
      const m = await main.match();
      expect(m!.opponent.name).not.toBe('Alt');
    }
  });
});

describe('measured demand, stored combat rating and army snapshots', () => {
  it('counts searches per band and uses them when they exceed the estimate', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    w.pastShields();
    const per = defaultData.competition.population.attacksPerPlayerPerDay;
    for (let i = 0; i < per * 3; i++) await a.candidates();
    const b4 = (await a.metrics()).bands.find((b) => b.hall === 4)!;
    expect(b4.searches24h).toBe(per * 3);
    expect(b4.attackRequestsPerDay).toBe(per * 3);
  });

  it('stores a combat rating from the uploaded village and army, and prefers candidates in its band', async () => {
    const allHuman: GameData = { ...defaultData, competition: { ...defaultData.competition, population: { ...defaultData.competition.population, humanShareByEligible: [{ min: 0, share: 1 }], ratingBand: 30 } } };
    const w = await W(allHuman);
    const a = await w.player('Ann');
    await a.uploadBase({ base: baseAt(4, 41), offense: maxOffenseAtHall(4, defaultData) });
    const near = await w.player('Near');
    await near.uploadBase({ base: baseAt(4, 42), offense: maxOffenseAtHall(4, defaultData) });
    const far = await w.player('Far');
    await far.uploadBase({ base: baseAt(5, 43), offense: maxOffenseAtHall(6, defaultData) });
    w.pastShields();
    const ra = (await w.repo.getPlayer(a.id))!.combatRating!;
    const rf = (await w.repo.getPlayer(far.id))!.combatRating!;
    expect(ra).toBeGreaterThan(0);
    expect(rf).toBeGreaterThan(ra);
    const r = await a.candidates();
    expect(r.candidates[0].name).toBe('Near');
  });

  it('a report may not bring more warriors than the army snapshot taken at match time', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const m = await a.matchWith({ ai: { clan: 'iron_serpent', seed: 3, strength: 3.5 }, army: { hedgehog_roller: 10 }, levels: { hedgehog_roller: 1 } });
    expect(await code(a.submitAttack({ ticket: m.ticket, seed: 1, ...rush(20) }))).toBe('bad_request');
    const m2 = await a.matchWith({ ai: { clan: 'iron_serpent', seed: 3, strength: 3.5 }, army: { hedgehog_roller: 20 }, levels: { hedgehog_roller: 1 } });
    expect(await code(a.submitAttack({ ticket: m2.ticket, seed: 1, ...rush(20) }))).toBe('ok');
  });
});

describe('shared territory in a region', () => {
  it('the first real player to take a settlement holds it; others can win it in a real-player battle', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const b = await w.player('Ben', baseAt(4, 9));
    w.pastShields();
    expect((await a.claimSettlement('bamboo_vale:shrine1')).holder.name).toBe('Ann');
    expect((await b.claimSettlement('bamboo_vale:shrine1')).holder.name).toBe('Ann');
    expect(await code(b.claimSettlement('nowhere:shrine9'))).toBe('bad_request');
    const info = await b.world();
    expect(info.claims).toEqual([{ settlement: 'bamboo_vale:shrine1', playerId: a.id, name: 'Ann', since: expect.any(Number) }]);
    expect(await code(b.matchWith({ target: a.id, settlement: 'iron_pass:village1' }))).toBe('not_found');
    const m = await b.matchWith({ target: a.id, settlement: 'bamboo_vale:shrine1' });
    const r = await b.submitAttack({ ticket: m.ticket, seed: 1, ...rush(80) });
    expect(r.settlement?.id).toBe('bamboo_vale:shrine1');
    if (r.result.stars >= defaultData.world.conquestStars) {
      expect(r.settlement?.conquered).toBe(true);
      expect((await a.world()).claims?.[0]).toMatchObject({ playerId: b.id, name: 'Ben' });
    } else {
      expect(r.settlement?.conquered).toBe(false);
    }
    // Releasing (an AI clan took it back in the holder's world) frees it.
    const holder = (await a.world()).claims![0].playerId === a.id ? a : b;
    await holder.releaseSettlement('bamboo_vale:shrine1');
    expect((await a.world()).claims).toEqual([]);
  });
});

describe('faction leaders choose the war target', () => {
  it('only the current human leader can set it, and the world shows it', async () => {
    const w = await W();
    const ps = [];
    for (const n of ['Aki', 'Ben', 'Cal']) {
      const p = await w.player(n, baseAt(4, n.charCodeAt(0)));
      await p.setFaction('iron_serpent');
      ps.push(p);
    }
    const won = { stars: 2, destruction: 70, hallDestroyed: true, loot: {}, used: {}, ticks: 100, endReason: 'time' as const, hash: 'x' };
    await w.repo.addAttack({ id: 'w1', at: w.now(), attackerId: ps[0].id, attackerName: 'Aki', defenderId: ps[1].id, seed: 1, army: {}, base: baseAt(4), deployments: [], result: won, attackerTrophies: 20, defenderTrophies: -20 });
    expect(await code(ps[1].setFactionTarget('thunder_lotus'))).toBe('conflict');
    expect(await code(ps[0].setFactionTarget('iron_serpent'))).toBe('bad_request');
    const info = await ps[0].setFactionTarget('thunder_lotus');
    expect(info.factions.iron_serpent).toMatchObject({ leader: 'Aki', leaderId: ps[0].id, target: 'thunder_lotus' });
  });
});

describe('war formats and the Alliance board', () => {
  it('small Alliances fight an AI clan war band; Alliances of five or more meet each other', async () => {
    const w = await W();
    const small = [await w.player('S1', baseAt(4, 1)), await w.player('S2', baseAt(4, 2))];
    const g1 = await small[0].createGrove('Small Leaf');
    await small[1].joinGrove(g1.id);
    const bigA = [];
    const bigB = [];
    for (let i = 0; i < 5; i++) bigA.push(await w.player(`A${i}`, baseAt(4, 10 + i)));
    for (let i = 0; i < 5; i++) bigB.push(await w.player(`B${i}`, baseAt(4, 20 + i)));
    const ga = await bigA[0].createGrove('Hidden Mist');
    for (const p of bigA.slice(1)) await p.joinGrove(ga.id);
    const gb = await bigB[0].createGrove('Iron Lotus');
    for (const p of bigB.slice(1)) await p.joinGrove(gb.id);
    w.intoRaid(1);
    // Both big Alliances were seen recently (pairing only considers active Alliances).
    await bigB[0].me();
    const r1 = await small[0].raid();
    expect(r1.opponent).toMatchObject({ kind: 'bot' });
    expect(r1.opponent!.name).toMatch(/\(AI\)$/);
    expect(r1.opponent!.members.every((m) => /\(AI\)$/.test(m.name))).toBe(true);
    const r2 = await bigA[0].raid();
    expect(r2.opponent).toMatchObject({ kind: 'grove', name: 'Iron Lotus' });
    expect(r2.opponent!.members).toHaveLength(5);
  });

  it('ranks Alliances by war results and territory', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const g = await a.createGrove('Moon Veil');
    await a.claimSettlement('iron_pass:village1');
    const board = await a.allianceBoard();
    expect(board.weeks).toBe(defaultData.competition.allianceBoard.weeks);
    expect(board.alliances[0]).toMatchObject({ name: 'Moon Veil', territory: 1, points: defaultData.competition.allianceBoard.perSettlement });
    expect(board.mine).toEqual({ rank: 1, points: defaultData.competition.allianceBoard.perSettlement });
    expect(g.id).toBeTruthy();
  });
});

describe('fairness and participation metrics', () => {
  it('reports expected vs actual scores of rated battles and clan participation', async () => {
    const w = await W();
    const a = await w.player('Ann', baseAt(4));
    const b = await w.player('Ben', baseAt(4, 77));
    w.pastShields();
    await a.setFaction('bamboo');
    const m = await a.matchWith({ target: b.id });
    await a.submitAttack({ ticket: m.ticket, seed: 1, ...rush(60) });
    const met = await a.metrics();
    expect(met.fairness!.battles).toBe(1);
    expect(met.fairness!.meanExpected).toBeCloseTo(0.5, 6);
    expect(met.fairness!.buckets.reduce((x, k) => x + k.battles, 0)).toBe(1);
    expect(met.participation!.active).toBeGreaterThanOrEqual(1);
    expect(met.participation!.factionShare).toBeGreaterThan(0);
  });
});
});
}
