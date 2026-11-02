/**
 * Unified opponent selection, the AI-to-human population transition, Shadow
 * Rank, war formats, catch-up and faction leadership (sim/world/*).
 */
import { describe, expect, it } from 'vitest';
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';
import { opponentFor } from '../../../src/gameplay/sim/matchmaking';
import type { GameData } from '../../../src/gameplay/sim/types';
import { applyCommand, upgradeQuote } from '../../../src/gameplay/sim/village';
import {
  battleScore,
  catchUpFactor,
  defenderEligibility,
  expectedScore,
  factionLeader,
  humanShare,
  humanShareTarget,
  humanSlots,
  liquidityShare,
  pvpEnabled,
  pvpStatus,
  rateBattle,
  seasonReset,
  shadowSeason,
  shadowTier,
  warFormat,
  type AttackerInfo,
  type DefenderInfo,
} from '../../../src/gameplay/sim/world/competition';
import { aiCandidates, mergeCandidates, type RivalCandidate } from '../../../src/gameplay/sim/world/opponents';
import { clanPower, combatRating, matchupLabel, normalizedInputs } from '../../../src/gameplay/sim/world/power';
import { data, must, newGame } from '../sim/helpers';

const DAY = 86_400_000;

describe('the rivals board (one selection system for AI and humans)', () => {
  it('a brand-new leader first meets the Bamboo training outpost, then three AI candidates', () => {
    const g = newGame({}, { starter: true });
    const first = aiCandidates(1, g.state, data);
    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe('first');
    expect(first[0].label).toContain('AI');
    const s = { ...g.state, world: { ...g.state.world, firstRaidDone: true }, trophies: 500 };
    s.buildings.find((b) => b.type === 'elder_toadstool')!.level = 3;
    const board = aiCandidates(1234, s, data);
    expect(board.map((c) => c.kind)).toEqual(['matched', 'rival', 'challenge']);
    for (const c of board) {
      expect(c.source).toBe('ai');
      expect(c.label).toMatch(/AI/);
      expect(c.base.clan).toBe(c.clan);
    }
    // The matched rival is exactly the opponent the balance model fights.
    expect(board[0].base).toEqual(opponentFor(1234, s, data));
    // The same scout seed gives the same board; the challenge is the strongest.
    expect(aiCandidates(1234, s, data)).toEqual(board);
    expect(board[2].strength).toBeGreaterThan(board[0].strength);
    expect(board[2].defense).toBeGreaterThan(board[0].defense);
    // Candidates stay inside the band: no more than one Keep above the player's.
    for (const c of board) expect(c.base.hallLevel).toBeLessThanOrEqual(3 + data.clans.bands.challengeAbove);
  });

  it('real players take slots first and are labelled as players', () => {
    const fake = (name: string, src: 'ai' | 'human'): RivalCandidate => ({ kind: src === 'human' ? 'player' : 'matched', source: src, clan: null, strength: 2.5, base: { name, hallLevel: 3, buildings: [] }, label: src === 'human' ? 'Real player' : 'AI', defense: 1 });
    const merged = mergeCandidates([fake('a', 'ai'), fake('b', 'ai'), fake('c', 'ai')], [fake('p', 'human')], data);
    expect(merged.map((c) => c.base.name)).toEqual(['p', 'a', 'b']);
  });

  it('the matchup label compares offense with defense', () => {
    const g = newGame();
    const base = opponentFor(5, { ...g.state, trophies: 700 }, data);
    expect(matchupLabel(1, base, data).label).toBe('Very hard');
    expect(matchupLabel(1e9, base, data).label).toBe('Easy');
  });
});

describe('population transition', () => {
  it('follows the eligible-human table', () => {
    expect([0, 1, 9, 10, 49, 50, 199, 200, 999, 1000, 5000].map((n) => humanShareTarget(n, data))).toEqual([0, 0.1, 0.1, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 0.9, 0.9]);
  });

  it('caps the share by defender capacity: f = min(1, D x C / A)', () => {
    // The worked example: 6,000 attacks, 500 defenders, 4 attacks each -> one third.
    expect(liquidityShare(6000, 500, data)).toBeCloseTo(1 / 3, 6);
    expect(liquidityShare(100, 500, data)).toBe(1);
    expect(liquidityShare(0, 0, data)).toBe(0);
    // 200 defenders would take 15 attacks a day each at a 50% share: capped instead.
    expect(humanShare(200, 6000, data)).toBeCloseTo((200 * 4) / 6000, 6);
    expect(humanShare(1000, 2000, data)).toBe(0.9);
    expect(humanShare(0, 10, data)).toBe(0);
  });

  it('turns a share into human slots, never more than are available', () => {
    expect(humanSlots(0.5, 5, [0.1, 0.6, 0.4])).toBe(2);
    expect(humanSlots(1, 1, [0, 0, 0])).toBe(1);
    expect(humanSlots(0, 9, [0, 0, 0])).toBe(0);
  });

  it('checks every eligibility rule for a real defender', () => {
    const now = Date.UTC(2026, 5, 1);
    const att: AttackerInfo = { id: 'a', hall: 4, groveId: 'g1', recentTargets: ['r'] };
    const ok: DefenderInfo = { id: 'd', hall: 4, pvpOptIn: false, shieldUntil: 0, attacksLastDay: 0, groveId: null };
    expect(defenderEligibility(ok, att, now, data)).toEqual({ ok: true });
    const why = (d: Partial<DefenderInfo>, a: Partial<AttackerInfo> = {}) => {
      const r = defenderEligibility({ ...ok, ...d }, { ...att, ...a }, now, data);
      return r.ok ? 'ok' : r.reason;
    };
    expect(why({ id: 'a' })).toBe('self');
    expect(why({ ownerKey: 'k' }, { ownerKey: 'k' })).toBe('self');
    expect(why({ hall: 6 })).toBe('band');
    expect(why({ hall: 3 })).toBe('pvp');
    expect(why({ hall: 3, pvpOptIn: true })).toBe('ok');
    expect(why({ shieldUntil: now + 1 })).toBe('shield');
    expect(why({ attacksLastDay: data.competition.population.maxAttacksPerDefenderPerDay })).toBe('busy');
    expect(why({ id: 'r' })).toBe('recent');
    expect(why({ groveId: 'g1' })).toBe('alliance');
  });

  it('protects new players: Keep 1-2 AI only, Keep 3 optional, Keep 4 standard', () => {
    expect([1, 2, 3, 4, 6].map((h) => pvpStatus(h, data))).toEqual(['locked', 'locked', 'optional', 'standard', 'standard']);
    expect(pvpEnabled(3, false, data)).toBe(false);
    expect(pvpEnabled(3, true, data)).toBe(true);
    expect(pvpEnabled(2, true, data)).toBe(false);
  });
});

describe('Shadow Rank (real players only)', () => {
  it('beating a stronger defense earns more than beating a weaker one', () => {
    const me = { rating: 1200, games: 30 };
    const strong = rateBattle(me, { rating: 1500, games: 30 }, 3, 100, data);
    const weak = rateBattle(me, { rating: 900, games: 30 }, 3, 100, data);
    expect(strong.attacker).toBeGreaterThan(weak.attacker);
    expect(strong.attacker).toBeGreaterThan(0);
    expect(strong.defender).toBeLessThan(0);
    // A clear loss against a weaker defense costs rating.
    expect(rateBattle(me, { rating: 900, games: 30 }, 0, 10, data).attacker).toBeLessThan(0);
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 9);
    expect(battleScore(3, 100, data)).toBeCloseTo(1, 9);
    expect(battleScore(0, 0, data)).toBe(0);
    expect(battleScore(1, 50, data)).toBeGreaterThan(battleScore(0, 99, data));
  });

  it('new players move faster, and nobody drops below the floor', () => {
    const opp = { rating: 1000, games: 50 };
    expect(rateBattle({ rating: 1000, games: 0 }, opp, 3, 100, data).attacker).toBeGreaterThan(rateBattle({ rating: 1000, games: 50 }, opp, 3, 100, data).attacker);
    const low = { rating: data.competition.shadowRank.floor, games: 50 };
    expect(rateBattle(low, { rating: 2000, games: 50 }, 0, 0, data).attacker).toBe(0);
  });

  it('seasons last four weeks and pull ratings halfway back', () => {
    const r = data.competition.shadowRank;
    expect(shadowSeason(r.epoch, data)).toBe(0);
    expect(shadowSeason(r.epoch + 28 * DAY - 1, data)).toBe(0);
    expect(shadowSeason(r.epoch + 28 * DAY, data)).toBe(1);
    expect(seasonReset(1600, data)).toBe(1300);
    expect(seasonReset(800, data)).toBe(900);
    expect(shadowTier(1750, data).name).toBe('Kage');
    expect(shadowTier(0, data).index).toBe(0);
  });

  it('battles against AI never change Shadow Rank', () => {
    const g = newGame({}, { starter: true });
    let s = g.state;
    s = must(s, { type: 'syncShadowRank', rank: { rating: 1234, defense: 1100, games: 5, season: 0 } }, g.clock.now());
    s = must(s, { type: 'scout', paid: false }, g.clock.now());
    const base = aiCandidates(s.scout!.seed, s, data)[0].base;
    const r = applyCommand(s, { type: 'battleEnd', record: { at: g.clock.now(), opponentName: base.name, setup: { seed: 1, base, army: s.army }, deployments: [] } }, g.clock.now(), data);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.world.rank).toEqual({ rating: 1234, defense: 1100, games: 5, season: 0 });
    // Season rewards pay once.
    const c1 = applyCommand(s, { type: 'claimRankSeason', season: 0, rating: 1234 }, g.clock.now(), data);
    expect(c1.ok).toBe(true);
    if (c1.ok) expect(applyCommand(c1.state, { type: 'claimRankSeason', season: 0, rating: 1234 }, g.clock.now(), data).ok).toBe(false);
  });
});

describe('Clan Power and the combat rating', () => {
  it('Clan Power grows as the village develops', () => {
    const g = newGame({ acorns: 50_000, dew: 50_000 }, { starter: true });
    const p0 = clanPower(g.state, data);
    let s = must(g.state, { type: 'place', buildingType: 'army_camp', x: 4, y: 4 }, g.clock.now());
    g.clock.advanceSeconds(3600);
    s = must(s, { type: 'place', buildingType: 'burrow_barracks', x: 9, y: 4 }, g.clock.now());
    g.clock.advanceSeconds(3600);
    s = must(s, { type: 'upgrade', id: s.buildings.find((b) => b.type === 'acorn_cannon')!.id }, g.clock.now());
    g.clock.advanceSeconds(24 * 3600);
    s = must(s, { type: 'setPvpOptIn', on: false }, g.clock.now());
    expect(s.buildings.find((b) => b.type === 'acorn_cannon')!.level).toBe(2);
    expect(clanPower(s, data)).toBeGreaterThan(p0);
  });

  it('weights defense, offense, Keep and skill 35/30/20/15 on a 0..1000 scale', () => {
    const top = data.hall.levels.length;
    const max = combatRating({ defense: 1e12, offense: 1e12, hall: top, skill: 1 }, data);
    expect(max).toBe(1000);
    expect(combatRating({ defense: 0, offense: 0, hall: 0, skill: 1 }, data)).toBe(150);
    const n = normalizedInputs({ defense: 1e12, offense: 0, hall: 0, skill: 0 }, data);
    expect(n.defense).toBe(1000);
    expect(combatRating({ defense: 1e12, offense: 0, hall: 0, skill: 0 }, data)).toBe(350);
  });
});

describe('clan war formats', () => {
  it('grow with the clan, with a flexible war size', () => {
    expect(warFormat(1, data).id).toBe('ai_missions');
    expect(warFormat(3, data)).toEqual({ id: 'coop_ai_raids', name: 'Cooperative AI raids', warSize: 3 });
    expect(warFormat(7, data).warSize).toBe(7);
    expect(warFormat(15, data).id).toBe('standard_war');
    expect(warFormat(80, data)).toMatchObject({ id: 'territory_war', warSize: 50 });
  });
});

describe('progression catch-up', () => {
  it('changes nothing today', () => {
    for (let h = 1; h <= data.hall.levels.length; h++) expect(catchUpFactor(h, data)).toBe(1);
  });

  it('makes old Keep tiers cheaper and faster once new Keep levels launch', () => {
    // Add four Keep levels (a copy of the top one each time).
    const more: GameData = structuredClone(data);
    for (let i = 0; i < 4; i++) {
      const top = more.hall.levels[more.hall.levels.length - 1];
      more.hall.levels.push({ ...structuredClone(top), level: top.level + 1 });
    }
    expect(catchUpFactor(more.hall.levels.length, more)).toBe(1);
    expect(catchUpFactor(more.hall.levels.length - more.competition.catchUp.levelsBehindTop, more)).toBeCloseTo(1 - 4 * more.competition.catchUp.discountPerNewLevel, 9);
    expect(catchUpFactor(1, more)).toBeGreaterThanOrEqual(1 - more.competition.catchUp.maxDiscount);
    // An upgrade quote for an early Keep tier is discounted.
    const g = newGame({ acorns: 100_000, dew: 100_000 });
    const hall = g.state.buildings.find((b) => b.type === 'elder_toadstool')!;
    const a = upgradeQuote(g.state, hall.id, data, g.clock.now());
    const b = upgradeQuote(g.state, hall.id, more, g.clock.now());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.quote.seconds).toBeLessThan(a.quote.seconds);
      expect(b.quote.cost.acorns!).toBeLessThan(a.quote.cost.acorns!);
    }
  });
});

describe('faction leadership safeguards', () => {
  it('the most active recent contributor leads; inactive or long-serving leaders step aside', () => {
    const now = Date.UTC(2026, 6, 1);
    const m = (id: string, contribution: number, idleDays = 0, termsLed = 0) => ({ id, name: id, lastActiveAt: now - idleDays * DAY, contribution, termsLed });
    expect(factionLeader([m('a', 50), m('b', 10)], now, data)).toBeNull(); // too few humans: the AI leads
    expect(factionLeader([m('a', 50), m('b', 10), m('c', 5)], now, data)!.id).toBe('a');
    expect(factionLeader([m('a', 50, 30), m('b', 10), m('c', 5), m('d', 1)], now, data)!.id).toBe('b');
    expect(factionLeader([m('a', 50, 0, 2), m('b', 10), m('c', 5)], now, data)!.id).toBe('b');
  });
});

describe('honest labels', () => {
  it('every generated rival names its AI clan', () => {
    const g = newGame();
    for (let seed = 1; seed < 20; seed++) {
      const b: BaseLayout = opponentFor(seed, { ...g.state, trophies: seed * 90 }, data);
      expect(b.clan).toBeTruthy();
      expect(b.practice).toMatch(/AI/);
    }
  });
});
