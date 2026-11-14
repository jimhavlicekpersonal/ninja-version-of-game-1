/**
 * Regression tests for the settlement, timer and scouting bugs found by the
 * gameplay audit (F07-F10, F14-F17, F21). Each test reproduces the audit's
 * failing case and checks the fixed behaviour.
 */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { createBattle, deploy, runBattle, step } from '../../../src/gameplay/sim/battle/battle';
import { scoutReport } from '../../../src/gameplay/sim/battle/scout';
import type { BaseLayout, BattleRecord } from '../../../src/gameplay/sim/battle/types';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { receiveDonations } from '../../../src/gameplay/sim/net';
import { computeOfflineProgress } from '../../../src/gameplay/sim/offline';
import { currentTasks, dayIndex } from '../../../src/gameplay/sim/pass';
import { seasonOf } from '../../../src/gameplay/sim/ranks';
import { capacity, collectorAmount } from '../../../src/gameplay/sim/resources';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, battleLoadout, createNewVillage, dailyChestOverflowRisk, hallLevel, passTierReward, rewardOverflow } from '../../../src/gameplay/sim/village';

const NOW = Date.UTC(2026, 0, 5, 8);

function village(): VillageState {
  return createNewVillage(NOW, data);
}

describe('F07: online raids take collector loot from the collector', () => {
  it('a destroyed collector pays from its own stock, not from storage', () => {
    const s = village();
    s.resources.acorns = 1000;
    const orchard = { id: 'mint', type: 'acorn_orchard', level: 1, x: 6, y: 6, upgrade: null, collector: { stored: 800, accrueFrom: NOW } };
    s.buildings.push(orchard);
    // The base the server stored: this village's own building ids, with the raidable loot on each.
    const base: BaseLayout = {
      name: 'Your village',
      hallLevel: 1,
      buildings: [
        { id: orchard.id, type: orchard.type, level: 1, x: 6, y: 6, loot: { acorns: 400 } },
        { id: 'far-hall', type: 'elder_toadstool', level: 1, x: 32, y: 32 },
      ],
    };
    const setup = { seed: 3, base, army: { hedgehog_roller: 20 }, levels: {} };
    const deployments = Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 2, y: 2 }));
    const { result } = runBattle(setup, deployments, data);
    expect(result.loot.acorns).toBe(400);
    const record: BattleRecord = { id: 'def-1', kind: 'defense', at: NOW, opponentName: 'Rival', setup, deployments, result };
    const r = applyCommand(s, { type: 'applyDefense', record, lost: result.loot, trophies: s.trophies, shieldUntil: 0 }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.resources.acorns).toBe(1000);
    expect(Math.round(collectorAmount(r.state.buildings.find((b) => b.id === 'mint')!, NOW, data))).toBe(400);
  });

  it('loot with no traceable collector comes from storage, never below zero', () => {
    const s = village();
    s.resources.acorns = 300;
    const record: BattleRecord = { id: 'def-2', kind: 'defense', at: NOW, opponentName: 'Rival', setup: { seed: 1, base: { name: 'x', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }] }, army: {} }, deployments: [], result: { stars: 0, destruction: 0, hallDestroyed: false, loot: { acorns: 500 }, used: {}, ticks: 1, endReason: 'time', hash: '0' } };
    const r = applyCommand(s, { type: 'applyDefense', record, lost: { acorns: 500 }, trophies: 0, shieldUntil: 0 }, NOW, data);
    expect(r.ok && r.state.resources.acorns).toBe(0);
  });

  // Quality 33: an untraceable raid used to swallow the error and take everything out of storage.
  const untraceable = (rules: number | undefined, buildings: { id: string; type: string; level: number; x: number; y: number }[]): BattleRecord => ({
    id: 'def-3', kind: 'defense', at: NOW, opponentName: 'Rival', ...(rules !== undefined ? { rules } : {}),
    setup: { seed: 1, base: { name: 'x', hallLevel: 1, buildings }, army: {} }, deployments: [],
    result: { stars: 0, destruction: 0, hallDestroyed: false, loot: { acorns: 500 }, used: {}, ticks: 1, endReason: 'time', hash: '0' },
  });

  it('a raid under battle rules this build does not play takes nothing, and says so', () => {
    const s = village();
    s.resources.acorns = 300;
    const r = applyCommand(s, { type: 'applyDefense', record: untraceable(99, [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }]), lost: { acorns: 500 }, trophies: 0, shieldUntil: 0 }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.resources.acorns).toBe(300);
    expect(r.events).toEqual([{ kind: 'defense_untraced', id: 'def-3', lost: { acorns: 500 }, reason: 'rules_99' }]);
    expect(r.state.defenseLog.some((d) => d.id === 'def-3')).toBe(true);
  });

  it('a raid whose simulation throws takes nothing, and says so', () => {
    const s = village();
    s.resources.acorns = 300;
    const r = applyCommand(s, { type: 'applyDefense', record: untraceable(undefined, [{ id: 'q', type: 'no_such_building', level: 1, x: 30, y: 30 }]), lost: { acorns: 500 }, trophies: 0, shieldUntil: 0 }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.resources.acorns).toBe(300);
    expect(r.events[0]?.kind).toBe('defense_untraced');
  });
});

describe('F08 / F17: timers and seasons settle while the game stays open', () => {
  async function start(clock: FakeClock) {
    return (await GameController.start({ clock, store: new MemorySaveStore(), analytics: new Analytics(new MemoryEventStore(), clock, 'test'), data })).controller;
  }

  it('research finishes on tick() without any other command', async () => {
    const clock = new FakeClock(NOW);
    const c = await start(clock);
    c.state.research.active = [{ troop: 'hedgehog_roller', toLevel: 2, startedAt: clock.now(), endsAt: clock.now() + 1000, cost: { dew: 4000 } }];
    clock.advance(2000);
    c.tick();
    expect(c.state.research.active).toEqual([]);
    expect(c.state.research.levels.hedgehog_roller).toBe(2);
  });

  it('a league season that ends while the game is open pays its chest once, with an event', async () => {
    const clock = new FakeClock(Date.UTC(2026, 0, 31, 23, 59));
    const c = await start(clock);
    const seen: string[] = [];
    c.onEvents((events) => events.forEach((e) => e.kind === 'reward' && seen.push(e.source)));
    const before = c.state.season;
    clock.advance(2 * 60_000);
    c.tick();
    expect(c.state.season).toBe(seasonOf(clock.now()));
    expect(c.state.season).toBe(before + 1);
    expect(c.state.seasonLog).toHaveLength(1);
    expect(seen.filter((x) => x.startsWith('season:'))).toHaveLength(1);
    c.tick();
    expect(c.state.seasonLog).toHaveLength(1);
  });

  it('advance() rolls a season the village is behind on, and offline progress still reports it', () => {
    const s = village();
    s.season -= 1;
    expect(advance(s, NOW, data).state.season).toBe(seasonOf(NOW));
    const away = village();
    away.season -= 1;
    const { summary } = computeOfflineProgress(away, NOW + 60_000, data);
    expect(summary.seasons).toHaveLength(1);
  });

  it('a new task day starts on tick() even with no timers running', async () => {
    const clock = new FakeClock(Date.UTC(2026, 0, 5, 23, 59));
    const c = await start(clock);
    const day = c.state.tasks.day;
    clock.advance(2 * 60_000);
    c.tick();
    expect(c.state.tasks.day).toBe(day + 1);
  });
});

describe('F09: donated troops keep their level', () => {
  function withLodge(): VillageState {
    const s = village();
    s.buildings.push({ id: 'lodge', type: 'grove_lodge', level: 1, x: 0, y: 0, upgrade: null, collector: null });
    return s;
  }

  it('a level-20 donation fights at level 20 while your own troops fight at your research', () => {
    const s = withLodge();
    s.army.hedgehog_roller = 2;
    receiveDonations(s, [{ id: 'd1', troop: 'hedgehog_roller', count: 1, level: 20, fromName: 'Ally' }], data);
    const loadout = battleLoadout(s, data);
    expect(loadout.reinforcements).toEqual({ hedgehog_roller: { count: 1, level: 20 } });
    const sim = createBattle({ seed: 1, base: { name: 'x', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }] }, ...loadout }, data);
    for (let i = 0; i < 3; i++) deploy(sim, { troop: 'hedgehog_roller', x: 1, y: 1, tick: 0 });
    expect(sim.troops.map((t) => t.level)).toEqual([20, 1, 1]);
  });

  it('a low-level donation is not boosted by the receiver research, and mixing keeps the lower level', () => {
    const s = withLodge();
    s.research.levels.hedgehog_roller = 5;
    receiveDonations(s, [{ id: 'd1', troop: 'hedgehog_roller', count: 1, level: 2, fromName: 'Ally' }], data);
    receiveDonations(s, [{ id: 'd2', troop: 'hedgehog_roller', count: 1, level: 9, fromName: 'Ally 2' }], data);
    expect(battleLoadout(s, data).reinforcements).toEqual({ hedgehog_roller: { count: 2, level: 2 } });
  });

  it('a battle that claims a higher donated level than the Lodge holds is refused, and spending empties the Lodge first', () => {
    const s = withLodge();
    s.army.hedgehog_roller = 2;
    receiveDonations(s, [{ id: 'd1', troop: 'hedgehog_roller', count: 1, level: 20, fromName: 'Ally' }], data);
    const base: BaseLayout = { name: 'x', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }] };
    const forged = { seed: 1, base, ...battleLoadout(s, data), reinforcements: { hedgehog_roller: { count: 1, level: 30 } } };
    expect(applyCommand(s, { type: 'battleEnd', record: { at: NOW, opponentName: 'x', setup: forged, deployments: [] } }, NOW, data).ok).toBe(false);
    const setup = { seed: 1, base, ...battleLoadout(s, data) };
    const r = applyCommand(s, { type: 'battleEnd', record: { at: NOW, opponentName: 'x', setup, deployments: [{ tick: 0, troop: 'hedgehog_roller', x: 1, y: 1 }] } }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.grove.reinforcements.hedgehog_roller).toBeUndefined();
    expect(r.state.grove.reinforcementLevels.hedgehog_roller).toBeUndefined();
    expect(r.state.army.hedgehog_roller).toBe(2);
  });
});

describe('F10 / F21: buildings being upgraded take no part in battle or scouting', () => {
  const hall = { id: 'h', type: 'elder_toadstool', level: 15, x: 30, y: 30 };

  it.each([false, true])('Bitter Incense Burner (upgrading %s)', (upgrading) => {
    const sim = createBattle({ seed: 7, base: { name: 'x', hallLevel: 15, buildings: [hall, { id: 'inc', type: 'bitter_incense_burner', level: 10, x: 10, y: 10, upgrading }] }, army: { hedgehog_roller: 1 }, levels: {} }, data);
    deploy(sim, { troop: 'hedgehog_roller', x: 1, y: 1, tick: 0 });
    sim.troops[0].x = 11;
    sim.troops[0].y = 12.5;
    step(sim);
    expect(sim.troops[0].auraCut > 0).toBe(!upgrading);
    expect(sim.troops[0].healCut > 0).toBe(!upgrading);
  });

  it('scouting does not count an upgrading defense or counter', () => {
    const base: BaseLayout = { name: 'x', hallLevel: 15, buildings: [hall, { id: 'aa', type: 'firefly_tower', level: 10, x: 10, y: 10, upgrading: true }, { id: 'inc', type: 'bitter_incense_burner', level: 5, x: 20, y: 10, upgrading: true }] };
    const r = scoutReport(base, data);
    expect(r.defenses).toEqual({});
    expect(r.counters).toEqual({});
    expect(r.hasAntiAir).toBe(false);
  });
});

describe('F14: the results screen gets explicit banked and overflow amounts', () => {
  const base: BaseLayout = { name: 'Overflow', hallLevel: 1, buildings: [{ id: 'hall', type: 'elder_toadstool', level: 1, x: 10, y: 10, loot: { acorns: 100, dew: 100 } }] };
  const setup = { seed: 42, base, army: { hedgehog_roller: 20 }, levels: { hedgehog_roller: 1 } };
  const deployments = Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 2, y: 2 }));

  it.each([false, true])('full storage %s', (full) => {
    const s = village();
    s.army = { hedgehog_roller: 20 };
    s.trophies = 400;
    const cap = capacity(s, data);
    s.resources.acorns = full ? cap.acorns : 0;
    s.resources.dew = full ? cap.dew : 0;
    const r = applyCommand(s, { type: 'battleEnd', record: { at: NOW, opponentName: base.name, setup, deployments } }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = r.state.battleLog.at(-1)!;
    expect(rec.result.stars).toBe(3);
    expect(rec.result.loot).toEqual({ acorns: 100, dew: 100 }); // the battle's own loot, unchanged
    if (full) {
      expect(rec.banked).toEqual({});
      expect(rec.overflow?.acorns).toBeGreaterThanOrEqual(100);
    } else {
      expect(rec.overflow).toBeUndefined();
      // What the army carries (diversity, sim/carry.ts) plus the bonuses.
      expect(rec.banked!.acorns).toBe(Math.floor(100 * (rec.carry ?? 1)) + (rec.leagueBonus?.acorns ?? 0) + (rec.eventBonus?.acorns ?? 0));
    }
  });
});

describe('F15: rewards report what was really received', () => {
  it('a daily chest into full storage reports no coins, lists the overflow, and was warned about', () => {
    const s = village();
    const cap = capacity(s, data);
    s.resources.acorns = cap.acorns;
    s.resources.dew = cap.dew;
    expect(Object.keys(dailyChestOverflowRisk(s, NOW, data)).length).toBeGreaterThan(0);
    const r = applyCommand(s, { type: 'openDailyChest' }, NOW, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = r.events.find((x) => x.kind === 'daily_chest');
    expect(e && e.kind === 'daily_chest' && (e.grants.acorns ?? 0)).toBe(0);
    expect(r.state.resources.acorns).toBe(cap.acorns);
    expect(e && e.kind === 'daily_chest' && Object.values(e.overflow ?? {}).some((v) => (v ?? 0) > 0)).toBe(true);
  });

  it('rewardOverflow previews exactly what would not fit', () => {
    const s = village();
    const cap = capacity(s, data);
    s.resources.acorns = cap.acorns - 50;
    expect(rewardOverflow(s, { acorns: 80, moonstones: 5 }, data)).toEqual({ acorns: 30 });
  });
});

describe('F16: overnight completions count toward the day they finished in', () => {
  const withCamp = () => {
    const s = village();
    s.buildings.push({ id: 'camp', type: 'army_camp', level: 1, x: 2, y: 2, upgrade: null, collector: null });
    return s;
  };

  it('training that finished after midnight counts for the new day', () => {
    const s = withCamp();
    s.training = [{ troop: 'hedgehog_roller', startedAt: NOW, endsAt: NOW + 20 * 3_600_000, cost: { dew: 20 } }];
    const next = advance(s, NOW + 24 * 3_600_000, data).state;
    expect(next.stats.troopsTrained).toBe(1);
    expect(next.stats.troopsTrained - next.tasks.dayBaseline.troopsTrained).toBe(1);
  });

  it('training that finished before midnight counts for the old day only', () => {
    const s = withCamp();
    s.training = [{ troop: 'hedgehog_roller', startedAt: NOW, endsAt: NOW + 10 * 3_600_000, cost: { dew: 20 } }];
    const next = advance(s, NOW + 24 * 3_600_000, data).state;
    expect(dayIndex(NOW + 10 * 3_600_000, data)).toBe(dayIndex(NOW, data));
    expect(next.stats.troopsTrained - next.tasks.dayBaseline.troopsTrained).toBe(0);
  });

  it('periods never roll backwards', () => {
    const s = village();
    const later = advance(s, NOW + 3 * 86_400_000, data).state;
    const again = advance(later, NOW, data).state;
    expect(again.tasks.day).toBe(later.tasks.day);
    expect(currentTasks(again, 1, data).length).toBeGreaterThan(0);
  });
});

describe('F31: Season Scroll rewards scale with the Keep', () => {
  it('a late Keep gets a bigger resource reward from the same tier; Jade is not scaled', () => {
    const tier = data.pass.tiers.find((t) => (t.free.acorns ?? t.free.dew ?? 0) > 0)!;
    const low = village();
    const high = village();
    high.buildings.find((b) => b.type === 'elder_toadstool')!.level = 12;
    expect(hallLevel(high, data)).toBe(12);
    const a = passTierReward(low, tier.tier, 'free', data)!;
    const b = passTierReward(high, tier.tier, 'free', data)!;
    const k = (tier.free.acorns ?? 0) > 0 ? 'acorns' : 'dew';
    expect(b[k]!).toBeGreaterThan(a[k]!);
    if (tier.free.moonstones) expect(b.moonstones).toBe(a.moonstones);
  });
});
