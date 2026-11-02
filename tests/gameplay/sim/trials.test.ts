/** Shadow Trials: the endless difficulty ladder (gameplay/sim/trials.ts, data/trials.json). */
import { describe, expect, it } from 'vitest';
import { createBattle, deploy, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { LAYOUTS } from '../../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, Deployment } from '../../../src/gameplay/sim/battle/types';
import { trialBase, trialInfo, trialReward } from '../../../src/gameplay/sim/trials';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { migrate, SAVE_VERSION, serialize } from '../../../src/gameplay/sim/save';
import { data, newGame } from './helpers';

/** Rough defensive strength: sum over defenses of HP x damage per tick. */
function strength(base: BaseLayout): number {
  const sim = createBattle({ seed: 1, base, army: {} }, data);
  return sim.buildings.reduce((t, b) => (b.kind === 'defense' && b.combat ? t + b.maxHp * (b.combat.damage / b.combat.fireIntervalTicks) : t), 0);
}

const lastHallTier = data.hall.levels.length * data.trials.tiersPerHall;

describe('Shadow Trials ladder', () => {
  it('is deterministic and carries no building loot', () => {
    const a = trialBase(7, data);
    expect(trialBase(7, data)).toEqual(a);
    expect(a.buildings.every((b) => !b.loot)).toBe(true);
    expect(a.name).toBe('Shadow Trial 7');
    expect(a.practice).toBe(LAYOUTS[6 % LAYOUTS.length].name);
    expect(a.trialTier).toBe(7);
  });

  it('rotates through every layout archetype', () => {
    const seen = new Set(Array.from({ length: LAYOUTS.length }, (_, i) => trialBase(i + 1, data).practice));
    expect(seen.size).toBe(LAYOUTS.length);
  });

  it('walks every Clan Keep level, then keeps growing without end', () => {
    expect(trialInfo(1, data).hall).toBe(1);
    expect(trialInfo(lastHallTier, data).hall).toBe(data.hall.levels.length);
    expect(trialInfo(lastHallTier, data).power).toBe(1);
    for (let t = 1; t < 300; t++) {
      const a = trialInfo(t, data);
      const b = trialInfo(t + 1, data);
      expect(b.hall).toBeGreaterThanOrEqual(a.hall);
      // Modifiers come and go, so compare the base growth without them.
      const strip = (i: typeof a) => i.power / i.modifiers.reduce((m, x) => m * (x.power ?? 1), 1);
      expect(strip(b)).toBeGreaterThanOrEqual(strip(a));
    }
    const far = trialInfo(1_000_000, data);
    expect(Number.isFinite(far.power)).toBe(true);
    expect(far.power).toBeLessThanOrEqual(data.trials.maxPower * 1.2);
  });

  it('every few tiers the fortress is clearly stronger', () => {
    for (const t of [1, 5, 9, 17, lastHallTier - 3, lastHallTier + 1, lastHallTier + 21]) {
      expect(strength(trialBase(t + data.trials.tiersPerHall, data))).toBeGreaterThan(strength(trialBase(t, data)));
    }
  });

  it('adds modifiers on their tiers', () => {
    expect(trialInfo(5, data).modifiers.map((m) => m.id)).toEqual(['ironclad']);
    expect(trialInfo(10, data).modifiers.map((m) => m.id).sort()).toEqual(['elite', 'ironclad']);
    expect(trialBase(5, data).wallPower).toBe(2);
    expect(trialInfo(7, data).modifiers).toEqual([]);
  });

  it('rewards grow slowly (logarithmically) and Jade comes every 10 tiers', () => {
    const r25 = trialReward(lastHallTier + 1, data).acorns!;
    const r100 = trialReward(lastHallTier + 100, data).acorns!;
    expect(r100).toBeGreaterThan(r25);
    expect(r100 / r25).toBeLessThan(1.5);
    expect(trialReward(10, data).moonstones).toBe(data.trials.jadeReward);
    expect(trialReward(11, data).moonstones).toBeUndefined();
  });
});

describe('Shadow Trial rewards', () => {
  /** A village with a big army that flattens tier 1. */
  function ready() {
    const { clock, state } = newGame();
    state.army = { beetle_brute: 6, hedgehog_roller: 40 };
    state.resources = { ...state.resources, acorns: 0, dew: 0 };
    return { clock, state };
  }
  const flatten = (n = 40): Deployment[] => [
    ...Array.from({ length: 6 }, (_, i) => ({ tick: i, troop: 'beetle_brute', x: 1, y: 14 + i })),
    ...Array.from({ length: n }, (_, i) => ({ tick: 10 + i, troop: 'hedgehog_roller', x: 1 + (i % 2) * 38, y: 10 + (i % 20) })),
  ];

  it('pays once, on the first clear, and only for the next tier', () => {
    const { clock, state } = ready();
    const setup = { seed: 3, base: trialBase(1, data), army: { ...state.army } };
    const sim = runBattle(setup, flatten(), data);
    expect(sim.result.stars).toBeGreaterThanOrEqual(data.trials.starsToClear);

    // Tier 2 is locked until tier 1 is cleared.
    expect(applyCommand(state, { type: 'trialEnd', tier: 2, record: { at: clock.now(), opponentName: 'x', setup: { ...setup, base: trialBase(2, data) }, deployments: flatten() } }, clock.now(), data).ok).toBe(false);

    const r1 = applyCommand(state, { type: 'trialEnd', tier: 1, record: { at: clock.now(), opponentName: 'x', setup, deployments: flatten() } }, clock.now(), data);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const e = r1.events.find((x) => x.kind === 'trial_end');
    expect(e && e.kind === 'trial_end' && e.firstClear).toBe(true);
    expect(r1.state.trials.best).toBe(1);
    const coins = r1.state.resources.acorns;
    expect(coins).toBeGreaterThan(0);
    expect(r1.state.army.hedgehog_roller ?? 0).toBeLessThan(40); // troops were spent

    // Clearing tier 1 again is allowed as practice but pays nothing.
    const s2 = { ...r1.state, army: { beetle_brute: 6, hedgehog_roller: 40 } };
    const r2 = applyCommand(s2, { type: 'trialEnd', tier: 1, record: { at: clock.now(), opponentName: 'x', setup, deployments: flatten() } }, clock.now(), data);
    expect(r2.ok && r2.state.resources.acorns).toBe(coins);
    expect(r2.ok && r2.state.trials.best).toBe(1);
  });

  it('ignores a forged base: the tier rebuilds its own fortress', () => {
    const { clock, state } = ready();
    const fake: BaseLayout = { name: 'Paper fort', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 2, y: 2 }] };
    const deps: Deployment[] = [{ tick: 0, troop: 'hedgehog_roller', x: 10, y: 3 }];
    const r = applyCommand(state, { type: 'trialEnd', tier: 1, record: { at: clock.now(), opponentName: 'x', setup: { seed: 1, base: fake, army: { hedgehog_roller: 1 } }, deployments: deps } }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.trials.best).toBe(0); // one Shinobi can't clear the real tier 1
    expect(r.state.battleLog.at(-1)!.setup.base.name).toBe('Shadow Trial 1');
  });

  it('a failed attempt pays nothing and does not advance', () => {
    const { clock, state } = ready();
    const deps: Deployment[] = [{ tick: 0, troop: 'hedgehog_roller', x: 1, y: 10 }];
    const r = applyCommand(state, { type: 'trialEnd', tier: 1, record: { at: clock.now(), opponentName: 'x', setup: { seed: 1, base: trialBase(1, data), army: { hedgehog_roller: 1 } }, deployments: deps } }, clock.now(), data);
    expect(r.ok && r.state.trials.best).toBe(0);
    expect(r.ok && r.state.resources.acorns).toBe(0);
  });

  it('smoke and sabotage work against trial fortresses (trial bases are ordinary bases)', () => {
    const base = trialBase(lastHallTier + 10, data);
    const sim = createBattle({ seed: 2, base, army: { saboteur: 2, hedgehog_roller: 10 } }, data);
    expect(sim.charges.smoke_bomb).toBeGreaterThan(0);
    expect(deploy(sim, { tick: 0, troop: 'smoke_bomb', x: 20, y: 20 })).toBe(true);
  });
});

describe('save v10', () => {
  it('adds Shadow Trials progress to older saves', () => {
    const { clock, state } = newGame();
    const file = serialize(state, clock.now()) as unknown as { version: number; village: Record<string, unknown> };
    file.version = 9;
    delete file.village.trials;
    const out = migrate(file, data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.village.trials).toEqual({ best: 0 });
  });
});
