/**
 * Being raided: when raids happen (#9), who raids you (#8), how much they can
 * take (#17) and how long the shield lasts (#18).
 */
import { describe, expect, it } from 'vitest';
import { maxHousingAtHall, armyHousing } from '../../../src/gameplay/sim/army';
import { raidTimes, shieldHoursFor, simulateOfflineRaids, storageLootCap, villageToBase } from '../../../src/gameplay/sim/defense';
import { attackerFor, lootPenalty, strengthFor } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

const HOUR = 3_600_000;

function raidable(): { state: VillageState; t0: number } {
  const g = newGame({ acorns: 1500, dew: 1500 });
  let s = must(g.state, { type: 'place', buildingType: 'acorn_orchard', x: 10, y: 12 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'acorn_silo', x: 25, y: 14 }, g.clock.now());
  g.clock.advanceSeconds(10);
  s = advance(s, g.clock.now(), data).state;
  // Past the gentler first raids (raids.newPlayerRaids, tested in reaudit-design.test.ts): full raiders from here.
  const stats = { ...s.stats, defensesFaced: data.raids.newPlayerRaids?.count ?? 0 };
  return { state: { ...s, stats, shieldUntil: 0, resources: { ...s.resources, acorns: 2000 } }, t0: g.clock.now() };
}

describe('raid schedule (#9)', () => {
  it('raids sit at fixed times on the clock, from the village seed', () => {
    const t0 = Date.UTC(2026, 3, 1);
    const day = raidTimes(77, t0, t0 + 24 * HOUR, data);
    // Asking about two halves of the day gives the same raids as asking about the whole day.
    expect([...raidTimes(77, t0, t0 + 12 * HOUR, data), ...raidTimes(77, t0 + 12 * HOUR, t0 + 24 * HOUR, data)]).toEqual(day);
    // About chancePerSlot raids per slot over a long stretch.
    const month = raidTimes(77, t0, t0 + 30 * 24 * HOUR, data).length;
    const slots = (30 * 24 * 60) / data.raids.slotMinutes;
    expect(month).toBeGreaterThan(slots * data.raids.chancePerSlot * 0.6);
    expect(month).toBeLessThan(slots * data.raids.chancePerSlot * 1.4);
  });

  it('checking in every 29 minutes does not dodge raids', () => {
    // The old rule only rolled for raids after 30+ minutes away, so short
    // check-ins meant never being raided.
    const { state, t0 } = raidable();
    let continuous = 0;
    let checkingIn = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const start = { ...state, seed, lastSeenAt: t0, raidCheckAt: t0 };
      continuous += simulateOfflineRaids(start, t0 + 24 * HOUR, data).raids.length;
      let s = start;
      for (let t = t0 + 29 * 60_000; t <= t0 + 24 * HOUR; t += 29 * 60_000) {
        const out = simulateOfflineRaids(s, t, data);
        checkingIn += out.raids.length;
        s = { ...out.state, lastSeenAt: t };
      }
    }
    expect(continuous).toBeGreaterThan(10);
    // Only the short grace after each visit is safe.
    expect(checkingIn).toBeGreaterThanOrEqual(Math.floor(continuous * 0.7));
  });

  it('a long absence brings more raids than a short one', () => {
    const { state, t0 } = raidable();
    let short = 0;
    let long = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const start = { ...state, seed, lastSeenAt: t0, raidCheckAt: t0 };
      short += simulateOfflineRaids(start, t0 + 8 * HOUR, data).raids.length;
      long += simulateOfflineRaids(start, t0 + 7 * 24 * HOUR, data).raids.length;
    }
    expect(long).toBeGreaterThan(short * 2);
  });

  it('no raids while the game is open', () => {
    const { state, t0 } = raidable();
    const s = { ...state, seed: 5, lastSeenAt: t0 + 10 * HOUR, raidCheckAt: t0 };
    // The player was here until t0 + 10h; only time after that (plus the grace) counts.
    const out = simulateOfflineRaids(s, t0 + 10 * HOUR + 60_000, data);
    expect(out.raids).toHaveLength(0);
  });
});

describe('shields (#18)', () => {
  it('heavier damage gives a longer shield', () => {
    expect(shieldHoursFor(10, data)).toBe(0);
    expect(shieldHoursFor(30, data)).toBe(12);
    expect(shieldHoursFor(65, data)).toBe(14);
    expect(shieldHoursFor(95, data)).toBe(16);
  });
});

describe('storage loot cap (#17)', () => {
  it('raiders take 20% of storage, but never more than the hall level cap', () => {
    const { state, t0 } = raidable();
    const rich = { ...state, resources: { ...state.resources, acorns: 4000 } };
    const loot = (d: typeof data) => villageToBase(rich, t0, d).buildings.filter((b) => b.type !== 'acorn_orchard').reduce((sum, b) => sum + (b.loot?.acorns ?? 0), 0);
    // Uncapped: 20% of what is stored.
    expect(loot(data)).toBeGreaterThanOrEqual(4000 * data.economy.raidableStoredFraction - 3);
    // With a cap below that, the cap wins.
    const capped = structuredClone(data);
    capped.raids.storageLootCapByHall[0] = 500;
    expect(storageLootCap(1, capped)).toBe(500);
    expect(loot(capped)).toBeLessThanOrEqual(500);
    expect(loot(capped)).toBeGreaterThanOrEqual(497);
  });

  it('caps grow with the hall level', () => {
    for (let h = 2; h <= data.hall.levels.length; h++) expect(storageLootCap(h, data)).toBeGreaterThan(storageLootCap(h - 1, data));
  });

  it('a raider from a higher hall gets less', () => {
    expect(lootPenalty(3, 3, data)).toBe(1);
    // Raiding a Keep above pays a little less (balance audit 2026-11-08: lagging a Keep behind no longer pays).
    expect(lootPenalty(2, 3, data)).toBe(data.ranks.lootPenaltyUpByHallDiff![1]);
    expect(lootPenalty(4, 3, data)).toBeLessThan(1);
    expect(lootPenalty(6, 3, data)).toBeLessThan(lootPenalty(4, 3, data));
    const { state, t0 } = raidable();
    const full = villageToBase(state, t0, data);
    const less = villageToBase(state, t0, data, 'x', lootPenalty(3, 1, data));
    const sum = (b: typeof full) => b.buildings.reduce((n, x) => n + (x.loot?.acorns ?? 0), 0);
    expect(sum(less)).toBeLessThan(sum(full));
  });
});

describe('bot raiders (#8)', () => {
  it('are matched by trophies and bring a full army at their hall research level', () => {
    const { state } = raidable();
    for (const trophies of [0, 400, 900, 1500, 2000]) {
      for (let i = 0; i < 10; i++) {
        const a = attackerFor(createRng(i + trophies), { ...state, trophies }, data);
        // Within one hall level of the defender (a hall 1 village here).
        expect(a.hall).toBeLessThanOrEqual(2);
        const housing = armyHousing(a.army, data);
        expect(housing).toBeGreaterThanOrEqual(Math.floor(maxHousingAtHall(a.hall, data) * 0.85) - 5);
        expect(housing).toBeLessThanOrEqual(maxHousingAtHall(a.hall, data));
        for (const lvl of Object.values(a.levels)) expect(lvl).toBeLessThanOrEqual(troopLevelCapAt(a.hall, data));
      }
    }
  });

  it('get stronger as the defender climbs (attackers mirror the player’s own matchmaking)', () => {
    const { state } = raidable();
    const hall6 = { ...state, buildings: state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 6 } : b)) };
    const avgHousing = (trophies: number) => {
      let sum = 0;
      for (let i = 0; i < 20; i++) sum += armyHousing(attackerFor(createRng(i), { ...hall6, trophies }, data).army, data);
      return sum / 20;
    };
    expect(strengthFor(1800, data)).toBeGreaterThan(5);
    expect(avgHousing(1900)).toBeGreaterThan(avgHousing(1200));
    // Even a hall 6 village at very low trophies is raided by hall 5+ armies.
    expect(avgHousing(0)).toBeGreaterThanOrEqual(maxHousingAtHall(5, data) * 0.85);
  });
});
