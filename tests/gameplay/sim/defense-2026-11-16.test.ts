/**
 * Phase 2 of the 2026-11-16 pass (docs/audit/understand-2026-11-16/defense-raids.md): defense is a decision with a
 * payoff. Stars decide what a bot raider carries; every star denied pays; raiders come from the defender's Keep.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { raidVillage } from '../../../src/gameplay/sim/defense';
import { attackerFor } from '../../../src/gameplay/sim/matchmaking';
import { capacity } from '../../../src/gameplay/sim/resources';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, createNewVillage, hallLevel } from '../../../src/gameplay/sim/village';
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
  it('a thirty-day absence meets at most maxRaidsPerCatchUp raids', async () => {
    const { simulateOfflineRaids } = await import('../../../src/gameplay/sim/defense');
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
