/** Persistent AI clans: event-driven catch-up, bands, rebuilding and revenge (sim/world/clans.ts). */
import { describe, expect, it } from 'vitest';
import { simulateOfflineRaids } from '../../../src/gameplay/sim/defense';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance } from '../../../src/gameplay/sim/village';
import { advanceClans, clanCap, defeatClan, retaliatingClan } from '../../../src/gameplay/sim/world/clans';
import { clanDef } from '../../../src/gameplay/sim/world/villagegen';
import { createWorld } from '../../../src/gameplay/sim/world/world';
import { data, must, newGame } from '../sim/helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('event-driven clan progression', () => {
  it('the result does not depend on how often the player looks', () => {
    const t0 = Date.UTC(2026, 2, 1);
    const once = createWorld(99, t0, 3, data);
    const often = structuredClone(once);
    advanceClans(once, t0 + 20 * DAY, 3, data);
    for (let t = t0; t <= t0 + 20 * DAY; t += 5 * HOUR) advanceClans(often, t, 3, data);
    advanceClans(often, t0 + 20 * DAY, 3, data);
    expect(often.clans).toEqual(once.clans);
  });

  it('clans grow, but never past their Keep range or the player band, even after months away', () => {
    const t0 = Date.UTC(2026, 2, 1);
    const w = createWorld(5, t0, 2, data);
    const before = Object.fromEntries(Object.values(w.clans).map((c) => [c.id, c.strength]));
    // maxStepsPerCatchUp bounds the work; do several catch-ups to cover 200 days.
    for (let d = 30; d <= 200; d += 30) advanceClans(w, t0 + d * DAY, 2, data);
    for (const def of data.clans.clans) {
      const c = w.clans[def.id];
      expect(c.strength).toBeLessThanOrEqual(clanCap(def, 2, data) + 1e-9);
      // Never above the band, unless the clan's own Keep range starts higher (endgame clans wait at their floor).
      expect(c.strength).toBeLessThanOrEqual(Math.max(def.halls[0] - 1, 2 + data.clans.bands.above));
      if (before[def.id] < clanCap(def, 2, data) - 0.01) expect(c.strength).toBeGreaterThan(before[def.id]);
    }
    // Endgame clans wait at the bottom of their range for a Keep 2 player.
    expect(w.clans.shadow_emperor.strength).toBeLessThan(5);
  });

  it('a beaten clan rebuilds for a while, then grows again', () => {
    const t0 = Date.UTC(2026, 2, 1);
    const w = createWorld(7, t0, 4, data);
    advanceClans(w, t0 + 10 * DAY, 4, data);
    const s0 = w.clans.iron_serpent.strength;
    defeatClan(w, 'iron_serpent', t0 + 10 * DAY, data);
    expect(w.clans.iron_serpent.status).toBe('rebuilding');
    expect(w.clans.iron_serpent.strength).toBeCloseTo(Math.max(clanDef(data, 'iron_serpent').halls[0] - 1, s0 - data.clans.sim.defeatStrengthLoss), 6);
    const s1 = w.clans.iron_serpent.strength;
    advanceClans(w, t0 + 10 * DAY + (data.clans.sim.rebuildHours - 12) * HOUR, 4, data);
    expect(w.clans.iron_serpent.strength).toBe(s1);
    advanceClans(w, t0 + 20 * DAY, 4, data);
    expect(w.clans.iron_serpent.status).not.toBe('rebuilding');
    expect(w.clans.iron_serpent.strength).toBeGreaterThan(s1);
    expect(w.news.some((n) => n.text.includes('Iron Serpent has rebuilt'))).toBe(true);
  });
});

describe('revenge raids', () => {
  function raidable(): VillageState {
    const g = newGame({ acorns: 1500, dew: 1500 });
    let s = must(g.state, { type: 'place', buildingType: 'acorn_orchard', x: 10, y: 12 }, g.clock.now());
    s = must(s, { type: 'place', buildingType: 'acorn_silo', x: 25, y: 14 }, g.clock.now());
    g.clock.advanceSeconds(10);
    return { ...advance(s, g.clock.now(), data).state, shieldUntil: 0 };
  }

  it('every simulated raider belongs to an AI clan and is flagged as simulated', () => {
    const s = raidable();
    const out = simulateOfflineRaids({ ...s, raidCheckAt: s.lastSeenAt }, s.lastSeenAt + 3 * DAY, data);
    expect(out.raids.length).toBeGreaterThan(0);
    for (const r of out.raids) {
      expect(r.record.simulated).toBe(true);
      expect(data.clans.clans.map((c) => c.id)).toContain(r.record.clan);
      expect(r.record.opponentName).toContain(clanDef(data, r.record.clan!).name);
    }
  });

  it('a clan that swore revenge sends the next raid in its window, in its own style, then stops', () => {
    // Find a seed where the aggressive Crimson Fang swears revenge and a raid lands in the window.
    for (let seed = 1; seed < 200; seed++) {
      const s = { ...raidable(), seed };
      const t = s.lastSeenAt;
      s.world = createWorld(seed, t, 1, data);
      const { revenge } = defeatClan(s.world, 'crimson_fang', t, data);
      if (!revenge) continue;
      const due = s.world.clans.crimson_fang.retaliateAt;
      expect(retaliatingClan(s.world, due, data)).toBe('crimson_fang');
      const out = simulateOfflineRaids({ ...s, raidCheckAt: t }, due + data.clans.sim.retaliationWindowHours * HOUR, data);
      const inWindow = out.raids.filter((r) => r.record.at >= due);
      if (!inWindow.length) continue;
      const r = inWindow[0].record;
      expect(r.clan).toBe('crimson_fang');
      expect(r.revenge).toBe(true);
      expect(r.opponentName).toContain('revenge');
      // Crimson Fang fights with fast assassins (Shinobi first).
      expect(Object.keys(r.setup.army)).toContain('hedgehog_roller');
      expect(out.state.world.clans.crimson_fang.retaliateAt).toBe(0);
      expect(out.raids.filter((x) => x.record.revenge)).toHaveLength(1);
      return;
    }
    throw new Error('no seed produced a revenge raid');
  });
});
