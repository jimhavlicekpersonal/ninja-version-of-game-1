import { describe, expect, it } from 'vitest';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { shieldHoursFor, simulateOfflineRaids, villageToBase } from '../../../src/gameplay/sim/defense';
import { computeOfflineProgress } from '../../../src/gameplay/sim/offline';
import { leagueChest, leagueFor, lossTrophies, rollSeasons, seasonOf, winTrophies } from '../../../src/gameplay/sim/ranks';
import { collectorAmount } from '../../../src/gameplay/sim/resources';
import { migrate } from '../../../src/gameplay/sim/save';
import { advance } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { data, find, must, newGame } from './helpers';

/** A small built-up village with no shield, ready to be raided. */
function raidable(): { state: VillageState; t0: number } {
  const g = newGame({ acorns: 1500, dew: 1500 });
  let s = must(g.state, { type: 'place', buildingType: 'acorn_orchard', x: 10, y: 12 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'acorn_silo', x: 25, y: 14 }, g.clock.now());
  g.clock.advanceSeconds(10);
  s = advance(s, g.clock.now(), data).state;
  s = { ...s, shieldUntil: 0, resources: { ...s.resources, acorns: 2000 } };
  return { state: s, t0: g.clock.now() };
}

describe('raidable loot', () => {
  it('20% of stored and 50% of uncollected resources are on offer', () => {
    const { state, t0 } = raidable();
    const t = t0 + 4 * 3_600_000; // orchard holds 800
    const base = villageToBase(state, t, data);
    const total = (k: 'acorns' | 'dew') => base.buildings.reduce((sum, b) => sum + (b.loot?.[k] ?? 0), 0);
    const orchard = base.buildings.find((b) => b.type === 'acorn_orchard')!;
    expect(orchard.loot?.acorns).toBe(Math.floor(collectorAmount(find(state, 'acorn_orchard')[0], t, data) * 0.5));
    const storedAcorns = total('acorns') - (orchard.loot?.acorns ?? 0);
    expect(storedAcorns).toBeLessThanOrEqual(Math.ceil(2000 * 0.2));
    expect(storedAcorns).toBeGreaterThanOrEqual(Math.floor(2000 * 0.2) - 3);
    expect(total('dew')).toBeLessThanOrEqual(Math.ceil(state.resources.dew * 0.2));
  });
});

describe('offline bot raids', () => {
  it('none while shielded (new players start with a shield)', () => {
    const g = newGame();
    const { raids } = simulateOfflineRaids(g.state, g.clock.now() + 20 * 3_600_000, data);
    expect(raids).toHaveLength(0);
  });

  it('raids are deterministic, with losses, trophies, log entries and exact replays', () => {
    const { state, t0 } = raidable();
    const away = { ...state, trophies: 300, lastSeenAt: t0, raidCheckAt: t0 };
    const now = t0 + 10 * 3_600_000;
    const a = simulateOfflineRaids(away, now, data);
    const b = simulateOfflineRaids(away, now, data);
    expect(a.state).toEqual(b.state);
    // Across many different villages, some get raided.
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) total += simulateOfflineRaids({ ...away, seed }, now, data).raids.length;
    expect(total).toBeGreaterThan(5);
    expect(total).toBeLessThanOrEqual(60);
    for (const r of a.raids) {
      const rec = r.record;
      expect(rec.kind).toBe('defense');
      expect(a.state.defenseLog.map((d) => d.id)).toContain(rec.id);
      expect(runBattle(rec.setup, rec.deployments, data).result.hash).toBe(rec.result.hash);
    }
    expect(a.state.raidCheckAt).toBe(now);
  });

  it('losing 30% or more grants a shield (longer for heavier damage) and blocks later raids', () => {
    const { state, t0 } = raidable();
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const away = { ...state, seed, lastSeenAt: t0, raidCheckAt: t0 };
      const out = simulateOfflineRaids(away, t0 + 20 * 3_600_000, data);
      const big = out.raids.find((r) => r.record.result.destruction >= 30);
      if (!big) continue;
      found = true;
      expect(out.state.shieldUntil).toBeGreaterThanOrEqual(big.record.at + shieldHoursFor(big.record.result.destruction, data) * 3_600_000);
      const later = out.raids.filter((r) => r.record.at > big.record.at && r.record.at < big.record.at + 12 * 3_600_000);
      expect(later).toHaveLength(0);
    }
    expect(found).toBe(true);
  });

  it('a raid takes resources out of storage and collectors', () => {
    const { state, t0 } = raidable();
    for (let seed = 1; seed <= 40; seed++) {
      const away = { ...state, seed, lastSeenAt: t0, raidCheckAt: t0 };
      const out = simulateOfflineRaids(away, t0 + 20 * 3_600_000, data);
      const stolen = out.raids.reduce((sum, r) => sum + (r.fromStorage.acorns ?? 0), 0);
      if (stolen > 0) {
        expect(out.state.resources.acorns).toBeLessThanOrEqual(2000 - stolen);
        return;
      }
    }
    throw new Error('expected at least one raid to steal acorns');
  });

  it('offline progress reports raids in the welcome-back summary', () => {
    const { state, t0 } = raidable();
    for (let seed = 1; seed <= 20; seed++) {
      const { summary } = computeOfflineProgress({ ...state, seed, lastSeenAt: t0, raidCheckAt: t0 }, t0 + 12 * 3_600_000, data);
      if (summary.raids.length) {
        expect(summary.raids[0].kind).toBe('defense');
        return;
      }
    }
    throw new Error('expected a raid');
  });
});

describe('leaf ranks', () => {
  it('leagues by trophies', () => {
    expect(leagueFor(0, data).id).toBe('sprout');
    expect(leagueFor(399, data).id).toBe('sprout');
    expect(leagueFor(400, data).id).toBe('fern');
    expect(leagueFor(1500, data).id).toBe('oak');
    expect(leagueFor(2400, data).id).toBe('elder');
  });

  it('beating a stronger player is worth more', () => {
    expect(winTrophies(500, 700, data)).toBeGreaterThan(winTrophies(500, 300, data));
    expect(lossTrophies(500, 700, data)).toBeLessThan(lossTrophies(500, 300, data));
    expect(winTrophies(0, 100000, data)).toBe(data.ranks.attackWin.max);
  });

  it('monthly reset gives the league chest and softens trophies', () => {
    const { state } = newGame();
    const s = { ...state, trophies: 1200, season: seasonOf(Date.UTC(2026, 0, 15)) };
    const rewards = rollSeasons(s, Date.UTC(2026, 2, 2), data);
    expect(rewards).toHaveLength(2);
    expect(rewards[0].league).toBe('oak');
    // Chest resources are sized to the player's Elder Toadstool level (here 1); Moonstones are not.
    expect(rewards[0].chest).toEqual(leagueChest(data.ranks.leagues[2], 1, data));
    expect(rewards[0].chest.moonstones).toBe(data.ranks.leagues[2].chest.moonstones);
    expect(rewards[0].chest.acorns!).toBeLessThan(data.ranks.leagues[2].chest.acorns!);
    expect(rewards[0].trophiesAfter).toBe(400 + 400);
    expect(s.trophies).toBe(400 + 200);
    expect(s.season).toBe(seasonOf(Date.UTC(2026, 2, 2)));
  });

  it('attacks change trophies and end the shield', () => {
    const { state, clock } = newGame();
    const s0 = { ...state, army: { hedgehog_roller: 15 }, trophies: 100 };
    const base = { name: 'Dummy', hallLevel: 1, trophies: 120, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 }] };
    const deps = Array.from({ length: 12 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const s1 = must(s0, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s0.army }, deployments: deps } }, clock.now());
    expect(s1.trophies).toBe(100 + winTrophies(100, 120, data));
    expect(s1.battleLog[0].trophies).toBe(winTrophies(100, 120, data));
    expect(s1.shieldUntil).toBeLessThanOrEqual(clock.now());
    // One Shinobi that never reaches anything (a battle with no warrior deployed is practice, balance audit 2026-11-08).
    const s2 = must(s1, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s1.army }, deployments: [{ tick: 0, troop: 'hedgehog_roller', x: 0, y: 0 }], endTick: 1 } }, clock.now());
    expect(s2.trophies).toBe(s1.trophies - lossTrophies(s1.trophies, 120, data));
  });
});

describe('traps', () => {
  it('stay hidden until ground troops step near, then hurt them', () => {
    const base = {
      name: 'Trap test', hallLevel: 3,
      buildings: [
        { id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 },
        { id: 't', type: 'thorn_snare', level: 4, x: 24, y: 19 },
      ],
    };
    const { sim } = runBattle({ seed: 2, base, army: { hedgehog_roller: 1 } }, [{ tick: 0, troop: 'hedgehog_roller', x: 28, y: 19 }], data, 120);
    const trap = sim.buildings[1];
    expect(trap.hidden).toBe(false);
    expect(trap.destroyed).toBe(true);
    expect(sim.troops[0].dead).toBe(true); // 60 hp vs 90 damage
    // Traps never count toward destruction.
    expect(sim.countable).toBe(1);
  });

  it('flyers do not set off traps', () => {
    const base = { name: 'Trap test', hallLevel: 3, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 }, { id: 't', type: 'thorn_snare', level: 4, x: 24, y: 19 }] };
    const { sim } = runBattle({ seed: 2, base, army: { owl_bomber: 1 } }, [{ tick: 0, troop: 'owl_bomber', x: 28, y: 19 }], data, 200);
    expect(sim.buildings[1].hidden).toBe(true);
  });
});

describe('save migration v2 -> v3', () => {
  it('adds rank fields', () => {
    const v2 = { version: 2, savedAt: 5, village: { createdAt: 1, lastSeenAt: 5, resources: { acorns: 1, dew: 1, nightsap: 0, moonstones: 0 }, buildings: [], nextId: 1, army: {}, training: [], battleLog: [], seed: 1, nextSeed: 1 } };
    const m = migrate(v2);
    expect(m.village.trophies).toBe(0);
    expect(m.village.defenseLog).toEqual([]);
    expect(m.village.shieldUntil).toBeGreaterThan(5);
  });
});
