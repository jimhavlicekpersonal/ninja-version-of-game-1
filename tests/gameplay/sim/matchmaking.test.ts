/** Scouting (#1, #2), trophy-based matchmaking (#3), trophy equilibrium (#4) and the loot penalty. */
import { describe, expect, it } from 'vitest';
import { totalLoot } from '../../../src/gameplay/sim/battle/basegen';
import { attackerStrength, matchStrength, opponentFor, opponentForRank, strengthFor } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { lossTrophies, winTrophies } from '../../../src/gameplay/sim/ranks';
import { createRng, next } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, leagueWinBonus, scoutFee } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

function seedOf(r: ReturnType<typeof applyCommand>): number {
  if (!r.ok) throw new Error(r.message);
  const e = r.events.find((x) => x.kind === 'scout');
  return e && e.kind === 'scout' ? e.seed : -1;
}

function atHall(state: VillageState, hall: number): VillageState {
  return { ...state, buildings: state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: hall } : b)) };
}

const avgLoot = (hall: number) => {
  const r = data.battle.generatedLootByHall[hall - 1];
  return (r.min + r.max) / 2;
};

describe('scouting (#1, #2)', () => {
  it('leaving and pressing Attack again shows the same opponent; only Next rerolls, for the fee', () => {
    const { state, clock } = newGame({ acorns: 2000 });
    const first = applyCommand(state, { type: 'scout', paid: false }, clock.now(), data);
    const s1 = (first as { state: VillageState }).state;
    // "Home", then "Attack" again: same base, nothing paid.
    const again = applyCommand(s1, { type: 'scout', paid: false }, clock.now(), data);
    expect(seedOf(again)).toBe(seedOf(first));
    expect((again as { state: VillageState }).state.resources.acorns).toBe(2000);
    // Next costs the fee and gives a new base, which then sticks too.
    const next = applyCommand(s1, { type: 'scout', paid: true }, clock.now(), data);
    const s2 = (next as { state: VillageState }).state;
    expect(seedOf(next)).not.toBe(seedOf(first));
    expect(s2.resources.acorns).toBe(2000 - scoutFee(s1, data));
    expect(seedOf(applyCommand(s2, { type: 'scout', paid: false }, clock.now(), data))).toBe(seedOf(next));
  });

  it('after an attack, the next look is free and new', () => {
    const { state, clock } = newGame();
    const s0 = { ...state, army: { hedgehog_roller: 5 } };
    const r = applyCommand(s0, { type: 'scout', paid: false }, clock.now(), data);
    const s1 = (r as { state: VillageState }).state;
    const base = opponentFor(seedOf(r), s1, data);
    const s2 = must(s1, { type: 'battleEnd', record: { at: clock.now(), opponentName: base.name, setup: { seed: 1, base, army: s1.army }, deployments: [] } }, clock.now());
    expect(s2.scout).toBeNull();
    expect(seedOf(applyCommand(s2, { type: 'scout', paid: false }, clock.now(), data))).not.toBe(seedOf(r));
  });

  it('the Next fee is a steady share of the loot on offer at every hall', () => {
    const { state } = newGame();
    for (let h = 1; h <= data.hall.levels.length; h++) {
      const share = scoutFee(atHall(state, h), data) / avgLoot(h);
      expect(share, `hall ${h}`).toBeGreaterThanOrEqual(0.02);
      expect(share, `hall ${h}`).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('matchmaking by trophies (#3)', () => {
  it('more trophies bring stronger opponents with more loot', () => {
    const { state } = newGame();
    const s = atHall(state, 6);
    const avg = (trophies: number) => {
      let hall = 0;
      let loot = 0;
      let lvl = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const b = opponentFor(seed * 7919, { ...s, trophies }, data);
        hall += b.hallLevel;
        const l = totalLoot(b);
        loot += (l.acorns ?? 0) + (l.dew ?? 0);
        const cannons = b.buildings.filter((x) => x.type === 'acorn_cannon');
        lvl += cannons.reduce((n, x) => n + x.level, 0) / Math.max(1, cannons.length);
      }
      return { hall: hall / 20, loot: loot / 20, lvl: lvl / 20 };
    };
    const low = avg(1500);
    const high = avg(2050);
    expect(high.hall).toBeGreaterThan(low.hall);
    expect(high.loot).toBeGreaterThan(low.loot);
    const top = avg(2050);
    const midHall6 = avg(1900);
    expect(top.lvl).toBeGreaterThan(midHall6.lvl - 0.01);
  });

  it('opponents stay within one hall below and one above, and their trophies follow their strength', () => {
    const { state } = newGame();
    for (const hall of [1, 3, 6]) {
      for (const trophies of [0, 500, 1200, 3000]) {
        for (let i = 0; i < 15; i++) {
          const m = matchStrength(createRng(i * 31 + trophies), trophies, hall, data);
          expect(m.hall).toBeGreaterThanOrEqual(Math.max(1, hall - 1));
          expect(m.hall).toBeLessThanOrEqual(Math.min(data.hall.levels.length, hall + 1));
          const s = m.hall - 1 + m.bias;
          expect(Math.abs(m.trophies - s * data.ranks.matchmaking.trophiesPerHall)).toBeLessThanOrEqual(data.ranks.matchmaking.trophyJitter + 1);
        }
      }
    }
    void state;
  });

  it('beating a lower Elder Toadstool pays less loot', () => {
    // At these trophies both a hall 2 and a hall 3 player meet the same hall 2 base.
    const trophies = Math.round(1.4 * data.ranks.matchmaking.trophiesPerHall);
    for (const seed of [4242, 99, 1234]) {
      const full = opponentForRank(seed, trophies, 2, data);
      const penalised = opponentForRank(seed, trophies, 3, data);
      expect(full.hallLevel).toBe(2);
      expect(penalised.buildings.map((b) => [b.type, b.level, b.x, b.y])).toEqual(full.buildings.map((b) => [b.type, b.level, b.x, b.y]));
      expect(totalLoot(penalised).acorns!).toBeLessThan(totalLoot(full).acorns!);
    }
  });

  it('higher leagues add a bonus to won attacks', () => {
    expect(leagueWinBonus(0, 3, data)).toEqual({});
    expect(leagueWinBonus(2100, 0, data)).toEqual({});
    const elder = leagueWinBonus(2100, 3, data);
    expect(elder.acorns!).toBeGreaterThan(leagueWinBonus(1100, 3, data).acorns!);
    expect(leagueWinBonus(2100, 1, data).acorns).toBe(Math.floor(elder.acorns! / 3));
  });
});

describe('trophy equilibrium (#4)', () => {
  /**
   * Simulate many attacks with a player who wins against bases up to a
   * strength and loses above it (with some noise), through the real
   * matchmaking and trophy formulas.
   */
  function settle(ownHall: number, beatsUpTo: number, attacks = 600): number {
    let trophies = 0;
    const rng = createRng(ownHall * 1000 + Math.round(beatsUpTo * 10));
    for (let i = 0; i < attacks; i++) {
      const m = matchStrength(rng, trophies, ownHall, data);
      const s = m.hall - 1 + m.bias;
      const pWin = 1 / (1 + Math.exp((s - beatsUpTo) * 4));
      const won = next(rng) < pWin;
      trophies = Math.max(0, trophies + (won ? winTrophies(trophies, m.trophies, data) : -lossTrophies(trophies, m.trophies, data)));
    }
    return trophies;
  }

  it('trophies settle near what the army can beat instead of climbing forever', () => {
    const tph = data.ranks.matchmaking.trophiesPerHall;
    // An army that can beat bases up to strength 2.5 settles around 2.5 * tph.
    const mid = settle(3, 2.5);
    expect(mid).toBeGreaterThan(1.8 * tph);
    expect(mid).toBeLessThan(3.2 * tph);
  });

  it('a hall 1 village cannot reach the Elder League even if it wins far above its level', () => {
    // Its opponents are at most hall 2, so once its trophies run ahead of
    // them, wins pay almost nothing and losses cost a lot.
    const t = settle(1, 2.6);
    expect(t).toBeLessThan(data.ranks.leagues.find((l) => l.id === 'elder')!.min);
    expect(t).toBeLessThan(3.5 * data.ranks.matchmaking.trophiesPerHall);
  });

  it('strength is trophies over trophiesPerHall', () => {
    expect(strengthFor(data.ranks.matchmaking.trophiesPerHall * 2, data)).toBe(2);
  });
});

describe('matchmaking follows earned power, not only honor (audit F22)', () => {
  it('a Keep 15 attacker with maxed research meets Keep 15 bases even while its honor lags a Keep behind', () => {
    const { state } = newGame();
    const village = atHall(state, 15);
    const lagging = { ...village, trophies: 14 * data.ranks.matchmaking.trophiesPerHall - 200 };
    const fresh = opponentFor(7, { ...lagging, army: { hedgehog_roller: 10 } }, data);
    const maxed = opponentFor(7, { ...lagging, army: { hedgehog_roller: 10 }, research: { levels: { hedgehog_roller: troopLevelCapAt(15, data, 'hedgehog_roller') }, active: [] } }, data);
    expect(attackerStrength({ ...lagging, army: { hedgehog_roller: 10 } }, data)).toBeCloseTo(14, 5);
    expect(fresh.hallLevel).toBeLessThanOrEqual(14);
    expect(maxed.hallLevel).toBe(15);
    // Same Keep: no loot penalty.
    expect(totalLoot(maxed).acorns!).toBeGreaterThan(0);
  });

  it('swapping in a newly unlocked tier at level 1 does not lower the floor (the old Keep 7 hole)', () => {
    // A new tier's level 1 is as strong as an older warrior at 1 + levelCapOffset.
    const village = atHall(newGame().state, 7);
    const old = { ...village, army: { hedgehog_roller: 10 }, research: { levels: { hedgehog_roller: troopLevelCapAt(6, data, 'hedgehog_roller') }, active: [] } };
    const fresh = { ...village, army: { wind_step_assassin: 10 }, research: { levels: {}, active: [] } };
    expect(data.troops.wind_step_assassin.levelCapOffset).toBeGreaterThan(0);
    expect(attackerStrength(fresh, data)).toBeGreaterThanOrEqual(attackerStrength(old, data) - 1e-9);
    expect(attackerStrength(fresh, data)).toBeGreaterThan(6.5);
    // Fully researched new tier: the top of Keep 7.
    const maxed = { ...fresh, research: { levels: { wind_step_assassin: troopLevelCapAt(7, data, 'wind_step_assassin') }, active: [] } };
    expect(attackerStrength(maxed, data)).toBeCloseTo(7, 5);
    // So Keep 7 attackers meet Keep 7 bases, not the Keep 6 bases they used to flatten.
    for (let seed = 1; seed <= 20; seed++) expect(opponentFor(seed, { ...fresh, trophies: 0 }, data).hallLevel).toBe(7);
  });
});

