/**
 * Phase 2 of the 2026-11-16 pass (docs/audit/understand-2026-11-16/defense-raids.md): defense is a decision with a
 * payoff. Stars decide what a bot raider carries; every star denied pays; raiders come from the defender's Keep.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { diversityPartOf, raidCarry, trainableRoles } from '../../../src/gameplay/sim/carry';
import { raidVillage, simulateOfflineRaids } from '../../../src/gameplay/sim/defense';
import { rematchReward, rematchStatus } from '../../../src/gameplay/sim/rematch';
import { maxHousingAtHall } from '../../../src/gameplay/sim/army';
import { attackerFor, botArmy, lossStreakSlack, strengthFloor } from '../../../src/gameplay/sim/matchmaking';
import { capacity } from '../../../src/gameplay/sim/resources';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, createNewVillage, hallLevel, leagueBonusOf } from '../../../src/gameplay/sim/village';
import campaignJson from '../../../docs/game-theory/campaign.json';

const campaign = campaignJson as { results: { id: string; byKeep: { keep: number; honor: number; stars: number; loot: number }[] }[] };
import { data } from './helpers';

const NOW = Date.UTC(2026, 5, 1, 12);

function built(keep: number, bias: number, seed: number): VillageState {
  const gen = generateOpponent(seed, keep, data, { levelBias: bias });
  const st = createNewVillage(NOW, data);
  st.buildings = gen.buildings.map((b, i) => ({ id: `b${i + 1}`, type: b.type, level: b.level, x: b.x, y: b.y, upgrade: null, collector: data.buildings[b.type].produces ? { stored: 0, accrueFrom: NOW - 6 * 3_600_000 } : null }));
  st.nextId = st.buildings.length + 1;
  const cap = capacity(st, data);
  st.resources.acorns = Math.floor(cap.acorns / 2);
  st.resources.dew = Math.floor(cap.dew / 2);
  st.shieldUntil = 0;
  st.stats.defensesFaced = 99;
  st.seed = seed;
  return st;
}

describe('P2-01 (DEF-01, DEF-02): stars decide what a raider carries, and every star denied pays', () => {
  it('never leaves a fractional resource, and pays a third of the hold reward per star denied', () => {
    for (let i = 0; i < 6; i++) {
      const st = built(9, 0.5, 300 + i);
      const out = raidVillage(st, NOW, createRng(50 + i), data);
      for (const v of Object.values(st.resources)) expect(Number.isInteger(v)).toBe(true);
      for (const b of st.buildings) if (b.collector) expect(Number.isInteger(b.collector.stored)).toBe(true);
      const stars = out.record.result.stars;
      const min = data.battle.generatedLootByHall[hallLevel(st, data) - 1].min;
      const want = Math.floor(min * data.raids.defenseWin!.shareOfRaidLoot * (3 - stars) / 3);
      const paid = (out.record.banked?.acorns ?? 0) + (out.record.overflow?.acorns ?? 0);
      expect(paid).toBe(stars < 3 ? want : 0);
    }
  });

  it('a real player\'s raid keeps conservation and pays the defender the per-star reward', () => {
    const st = built(9, 0.5, 777);
    const before = st.resources.acorns;
    const record = { id: 'pvp1', at: NOW, kind: 'defense' as const, opponentName: 'Raider', setup: { seed: 1, base: { name: 'x', hallLevel: 9, buildings: [] }, army: {}, infiltration: true }, deployments: [], result: { stars: 1, destruction: 40, loot: {}, used: {}, hash: 'h' } as never, trophies: 0 };
    const r = applyCommand(st, { type: 'applyDefense', record, lost: {}, trophies: st.trophies, shieldUntil: 0, fallen: [] }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const min = data.battle.generatedLootByHall[8].min;
    expect(r.state.resources.acorns - before).toBe(Math.floor(min * data.raids.defenseWin!.shareOfRaidLoot * 2 / 3));
    expect(r.state.defenseLog.at(-1)!.banked?.acorns).toBe(r.state.resources.acorns - before);
  });
});

describe('P2-02 (DEF-04): raiders come from the defender\'s Keep, not its honor', () => {
  it('spreads across Keep-1 to Keep at every honor, and never above the defender\'s Keep', () => {
    for (const keep of [5, 9, 12, 15]) {
      for (const trophies of [0, 1500, 4300, 6000]) {
        const st = built(keep, 0.5, 11);
        st.trophies = trophies;
        // Strength (hall − 1 + bias) is drawn from Keep − 2 to Keep − 1: Keep − 1's raider from its weakest to
        // its strongest, whatever the honor (it used to be a point mass that climbed with honor).
        const strengths: number[] = [];
        for (let i = 0; i < 60; i++) {
          const a = attackerFor(createRng(1000 + i), st, data);
          expect(a.hall, `Keep ${keep} honor ${trophies}`).toBeLessThanOrEqual(keep);
          strengths.push(a.hall - 1 + a.bias);
        }
        expect(Math.min(...strengths)).toBeLessThan(keep - 1.7);
        expect(Math.max(...strengths)).toBeGreaterThan(keep - 1.3);
        expect(Math.max(...strengths)).toBeLessThanOrEqual(keep - 1);
      }
    }
  });
});

describe('P2-05/P2-06 (DEF-06, DEF-11): a long absence cannot empty the treasury', () => {
  it('a thirty-day absence meets at most maxRaidsPerCatchUp raids', () => {
    expect(data.raids.maxRaidsPerCatchUp).toBe(3);
    const v = createNewVillage(0, data);
    const away = simulateOfflineRaids(v, 30 * 24 * 3_600_000, data);
    expect(away.raids.length).toBeLessThanOrEqual(3);
    expect(away.raids.length).toBeGreaterThan(0);
  });

  it('the exhaustion window reaches a raid a day and a half old', () => {
    expect(data.raids.exhaustion!.windowHours).toBeGreaterThanOrEqual(36);
  });
});

describe('P2-07 (DEF-08, ECO-07): Settle the score pays back what the raid took', () => {
  it('pays the larger of the fixed share and recoverShare x stars/3 of the raid\'s take, never more than it took', () => {
    const share = data.raids.rematch!.recoverShare!;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(1);
    const took = { acorns: 900_000, dew: 600_000 };
    const fixed = rematchReward(3, 12, data);
    const three = rematchReward(3, 12, data, took);
    expect(three.acorns).toBe(Math.max(fixed.acorns ?? 0, Math.floor(900_000 * share)));
    expect(three.dew).toBe(Math.max(fixed.dew ?? 0, Math.floor(600_000 * share)));
    expect(three.acorns!).toBeLessThanOrEqual(took.acorns);
    expect(rematchReward(2, 12, data, took).acorns).toBe(Math.max(Math.floor(((fixed.acorns ?? 0) * 2) / 3), Math.floor((900_000 * share * 2) / 3)));
    // A raid that took little still pays at least the old fixed reward.
    expect(rematchReward(3, 12, data, { acorns: 1 })).toEqual(fixed);
    expect(rematchReward(0, 12, data, took)).toEqual({});
  });
});

describe('P2-08 (DEF-09): a declared stake is a skill bet a good player can win', () => {
  it('break-even hit rates are 77% for two stars and 57% for three', () => {
    const by = data.raids.stakes!.byStars;
    expect(1 / by['2']).toBeCloseTo(0.77, 2);
    expect(1 / by['3']).toBeCloseTo(0.57, 2);
    // Four hits in five at two stars gains; the bot plan's 60% does not.
    expect(0.8 * by['2']).toBeGreaterThan(1);
    expect(0.6 * by['2']).toBeLessThan(1);
  });
});

describe('P2-15 (UIS-07): the diversity carry waits until the village has a choice', () => {
  it('the tutorial army carries 100%; a one-role army at Keep 5 still carries 85%', () => {
    const v0 = createNewVillage(0, data);
    // The tutorial's Dojo at level 1: Shinobi only.
    const v: VillageState = { ...v0, buildings: [...v0.buildings, { id: 'dojo', type: 'burrow_barracks', level: 1, x: 2, y: 2, upgrade: null, collector: null } as VillageState['buildings'][number]] };
    const used = { hedgehog_roller: 10 };
    expect(trainableRoles(v, data)).toBe(1);
    expect(raidCarry({ used, stars: 2 }, {}, undefined, data, trainableRoles(v, data))).toBe(1);
    const k5: VillageState = { ...v, buildings: v.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 5 } : b.type === 'burrow_barracks' ? { ...b, level: 5 } : b)) };
    expect(trainableRoles(k5, data)).toBeGreaterThanOrEqual(2);
    expect(raidCarry({ used, stars: 2 }, {}, undefined, data, trainableRoles(k5, data))).toBe(data.raids.diversity!.minShare);
    // The result screen reads the record's carry with the stake taken out.
    expect(diversityPartOf(1.3 * 0.85, 2, 2, data)).toBeCloseTo(0.85, 9);
    expect(diversityPartOf(undefined, undefined, 3, data)).toBe(1);
  });
});

describe('P2-09 (DEF-10, ECO-08): the league win bonus matters at every Keep', () => {
  it('is 5-20% of an average raid\'s banked loot at Keeps 5-15 at the regular model\'s league', () => {
    const regular = campaign.results.find((r) => r.id === 'regular')!;
    for (const k of regular.byKeep.filter((x) => x.keep >= 5)) {
      const league = [...data.ranks.leagues].reverse().find((l) => k.honor >= l.min)!;
      const b = leagueBonusOf(league, 3, k.keep, data);
      // Paid x stars/3 on a win: the model's average stars per raid (0 on a loss) give the expected bonus.
      const perRaid = (((b.acorns ?? 0) + (b.dew ?? 0)) * k.stars) / 3;
      const share = perRaid / k.loot;
      expect(share, `Keep ${k.keep} (${league.id})`).toBeGreaterThanOrEqual(0.05);
      expect(share, `Keep ${k.keep} (${league.id})`).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('P2-10 (DEF-12): a losing streak lowers the opponents, and cannot be farmed', () => {
  // Raids count against the Keep's camps (independent review: not the army brought): a new village's camps hold
  // `camps` warriors, so "10" below means the whole camp.
  const camps = maxHousingAtHall(1, data);
  const army = { hedgehog_roller: camps };
  const raid = (stars: number, sent: number): VillageState['battleLog'][number] =>
    ({ id: `r${stars}${sent}`, kind: 'attack', at: 0, opponentName: 'x', setup: { seed: 1, base: { name: 'x', hallLevel: 5, buildings: [] }, army }, deployments: [], result: { stars, destruction: 0, loot: {}, used: { hedgehog_roller: Math.round((sent * camps) / 10) } }, trophies: 0 }) as unknown as VillageState['battleLog'][number];
  const at = (log: VillageState['battleLog']) => ({ ...createNewVillage(0, data), battleLog: log });
  const cfg = data.ranks.matchmaking.lossStreakSlack!;

  it('adds perLoss per full-army loss up to max, and a win resets it', () => {
    expect(lossStreakSlack(at([]), data)).toBe(0);
    expect(lossStreakSlack(at([raid(0, 10)]), data)).toBe(cfg.perLoss);
    expect(lossStreakSlack(at([raid(0, 10), raid(0, 9), raid(0, 8)]), data)).toBe(3 * cfg.perLoss);
    expect(lossStreakSlack(at(Array.from({ length: 9 }, () => raid(0, 10))), data)).toBe(cfg.max);
    expect(lossStreakSlack(at([raid(0, 10), raid(0, 10), raid(1, 10)]), data)).toBe(0);
    expect(lossStreakSlack(at([raid(1, 10), raid(0, 10)]), data)).toBe(cfg.perLoss);
  });

  it('a one-warrior army sent in full does not count (independent review)', () => {
    const tiny = (): VillageState['battleLog'][number] => ({ ...raid(0, 10), setup: { ...raid(0, 10).setup, army: { hedgehog_roller: 1 } }, result: { ...raid(0, 10).result, used: { hedgehog_roller: 1 } } }) as VillageState['battleLog'][number];
    expect(lossStreakSlack(at([tiny(), tiny(), tiny(), tiny()]), data)).toBe(0);
  });

  it('a loss that sent under 80% of the army neither counts nor resets', () => {
    expect(lossStreakSlack(at([raid(0, 1), raid(0, 1), raid(0, 7)]), data)).toBe(0);
    expect(lossStreakSlack(at([raid(0, 10), raid(0, 1), raid(0, 1)]), data)).toBe(cfg.perLoss);
  });

  it('lowers the strength floor by the streak', () => {
    const v = at([raid(0, 10), raid(0, 10)]);
    expect(strengthFloor(at([]), data) - strengthFloor(v, data)).toBeCloseTo(2 * cfg.perLoss, 9);
  });
});

describe('P2-03 (DEF-05): raiders bring more than one army', () => {
  it('Keeps 7-15 have an air raid and a shadow and siege raid beside today\'s line, all trainable at that Keep', () => {
    for (let k = 7; k <= 15; k++) {
      const alts = data.raids.raiderMixes![k - 1];
      expect(alts.length, `Keep ${k}`).toBeGreaterThanOrEqual(2);
      expect(Object.keys(alts[0]).some((t) => data.troops[t].air), `Keep ${k} air raid`).toBe(true);
      for (const mix of alts) for (const t of Object.keys(mix)) expect(data.troops[t].unlockKeep ?? 1, `${t} at Keep ${k}`).toBeLessThanOrEqual(k);
    }
    for (let k = 1; k <= 6; k++) expect(data.raids.raiderMixes![k - 1]).toEqual([]);
  });

  it('the raid\'s seed picks the line or an alternate, and botArmy is unchanged', () => {
    const v = createNewVillage(0, data);
    const keep9: VillageState = { ...v, stats: { ...v.stats, defensesFaced: 99 }, buildings: v.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 9 } : b)) };
    const armies = new Set<string>();
    for (let i = 0; i < 40; i++) armies.add(Object.keys(attackerFor(createRng(i), keep9, data).army).sort().join(','));
    expect(armies.size).toBeGreaterThanOrEqual(3);
    expect(Object.keys(botArmy(9, 0.5, data)).sort()).toEqual(Object.keys(data.raids.botArmyMix[8]).sort());
  });
});

describe('independent review 2026-11-18: Phase 2 holes', () => {
  it('a forged defense record cannot make Settle the score pay Jade or more than a raid could take', () => {
    const forged = rematchReward(3, 12, data, { moonstones: 123_456, acorns: 1e12, dew: 1e12 } as never);
    expect(forged.moonstones).toBeUndefined();
    expect(forged.acorns!).toBeLessThanOrEqual(2 * data.raids.storageLootCapByHall[11]);
  });

  it('a defense record dated in the future cannot be answered', () => {
    const v = createNewVillage(0, data);
    const rec = { id: 'd1', kind: 'defense', at: 10 * 86_400_000, simulated: true, raider: { seed: 1, hall: 3, bias: 0.5 }, opponentName: 'x', setup: { seed: 1, base: { name: 'x', hallLevel: 3, buildings: [] }, army: {} }, deployments: [], result: { stars: 3, destruction: 100, loot: { acorns: 5 }, used: {} }, trophies: 0 } as unknown as VillageState['defenseLog'][number];
    const s: VillageState = { ...v, defenseLog: [rec] };
    expect(rematchStatus(s, 'd1', 1000, data).ok).toBe(false);
    expect(rematchStatus(s, 'd1', 10 * 86_400_000 + 1000, data).ok).toBe(true);
  });

  it('a real raid pays the hold reward only when the server says so', () => {
    const v = createNewVillage(0, data);
    const record = { id: 'pv1', kind: 'defense', at: 1, opponentName: 'alt', setup: { seed: 1, base: { name: 'x', hallLevel: 1, buildings: [] }, army: {} }, deployments: [], result: { stars: 0, destruction: 5, loot: {}, used: {} }, trophies: 0 } as unknown as VillageState['defenseLog'][number];
    const paid = applyCommand(v, { type: 'applyDefense', record, lost: {}, trophies: 0, shieldUntil: 0 }, 1000, data);
    const unpaid = applyCommand(v, { type: 'applyDefense', record, lost: {}, trophies: 0, shieldUntil: 0, holdReward: false }, 1000, data);
    expect(paid.ok && unpaid.ok).toBe(true);
    if (!paid.ok || !unpaid.ok) return;
    expect(paid.state.defenseLog.at(-1)!.banked).toBeDefined();
    expect(unpaid.state.defenseLog.at(-1)!.banked).toBeUndefined();
  });
});
