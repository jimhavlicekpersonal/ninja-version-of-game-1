/** Smoke Bomb and Sabotage: the two ninja tactics (battle.json `abilities` and `sabotage`). */
import { describe, expect, it } from 'vitest';
import { BattleSession, drainEvents } from '../../../src/gameplay/control/battleSession';
import { canDeploy, createBattle, deploy, inSmoke, runBattle, sabotageable, smokeCharges, step, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, Deployment } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const SMOKE = data.battle.abilities.smoke_bomb;
const SAB = data.battle.sabotage;

/** Kunai Tower (range 7) centred on (21.5, 21.5); the Clan Keep far away. */
const towerBase = (extra: BaseLayout['buildings'] = []): BaseLayout => ({
  name: 'Dojo test',
  hallLevel: 1,
  buildings: [
    { id: 'k', type: 'acorn_cannon', level: 1, x: 20, y: 20 },
    { id: 'h', type: 'elder_toadstool', level: 1, x: 33, y: 33 },
    ...extra,
  ],
});

/** Hold a troop at a fixed distance west of the tower and step once. */
function holdAndStep(sim: BattleSim, ti: number, distance: number): void {
  const t = sim.troops[ti];
  t.x = 21.5 - distance;
  t.y = 21.5;
  t.path = null;
  step(sim);
  // stepTroop moved it a little toward the tower before the tower looked.
}

describe('Smoke Bomb', () => {
  it('charges come from army housing, are finite, and are not troops', () => {
    expect(smokeCharges({}, data)).toBe(0);
    expect(smokeCharges({ hedgehog_roller: 10 }, data)).toBe(SMOKE.baseCharges);
    expect(smokeCharges({ hedgehog_roller: SMOKE.housingPerCharge }, data)).toBe(SMOKE.baseCharges + 1);
    expect(smokeCharges({ beetle_brute: 1000 }, data)).toBe(SMOKE.maxCharges);

    const sim = createBattle({ seed: 3, base: towerBase(), army: { hedgehog_roller: SMOKE.housingPerCharge } }, data);
    expect(sim.charges.smoke_bomb).toBe(2);
    expect(deploy(sim, { tick: 0, troop: 'smoke_bomb', x: 21, y: 21 })).toBe(true); // over a building is fine
    expect(deploy(sim, { tick: 0, troop: 'smoke_bomb', x: 5, y: 5 })).toBe(true);
    expect(canDeploy(sim, 'smoke_bomb', 8, 8)).toBe(false);
    expect(deploy(sim, { tick: 0, troop: 'smoke_bomb', x: 8, y: 8 })).toBe(false);
    expect(sim.abilitiesUsed.smoke_bomb).toBe(2);
    expect(sim.used.smoke_bomb).toBeUndefined(); // the army bookkeeping never sees abilities
    expect(canDeploy(sim, 'smoke_bomb', -1, 4)).toBe(false);
  });

  it('cuts defensive range inside the cloud, but never below the minimum targeting range', () => {
    const reduced = Math.max(SMOKE.minTargetRange, 7 * SMOKE.rangeFactor);
    expect(SMOKE.minTargetRange).toBeGreaterThan(0);
    expect(reduced).toBeLessThan(5);

    // Without smoke the tower picks up a guardian 5 tiles away.
    const clear = createBattle({ seed: 1, base: towerBase(), army: { beetle_brute: 2 } }, data);
    deploy(clear, { tick: 0, troop: 'beetle_brute', x: 10, y: 21 });
    holdAndStep(clear, 0, 5);
    expect(clear.buildings[0].targetTroop).toBe(0);

    // In smoke it can't, until the troop is inside the reduced range.
    const sim = createBattle({ seed: 1, base: towerBase(), army: { beetle_brute: 2 } }, data);
    deploy(sim, { tick: 0, troop: 'beetle_brute', x: 10, y: 21 });
    deploy(sim, { tick: 0, troop: 'smoke_bomb', x: 17, y: 21 });
    holdAndStep(sim, 0, 5);
    expect(inSmoke(sim, sim.troops[0].x, sim.troops[0].y)).toBe(true);
    expect(sim.buildings[0].targetTroop).toBe(-1);
    holdAndStep(sim, 0, reduced - 0.4);
    expect(sim.buildings[0].targetTroop).toBe(0);
  });

  it('expires after its duration and the defense sees normally again', () => {
    const sim = createBattle({ seed: 1, base: towerBase(), army: { beetle_brute: 2 } }, data);
    deploy(sim, { tick: 0, troop: 'beetle_brute', x: 10, y: 21 });
    deploy(sim, { tick: 0, troop: 'smoke_bomb', x: 17, y: 21 });
    let ended = -1;
    for (let i = 0; i < SMOKE.durationTicks + 5; i++) {
      holdAndStep(sim, 0, 5);
      if (sim.events.some((e) => e.k === 'smokeEnd')) ended = sim.tick;
      if (sim.tick < SMOKE.durationTicks) expect(sim.buildings[0].targetTroop).toBe(-1);
    }
    expect(ended).toBe(SMOKE.durationTicks);
    expect(sim.smokes).toEqual([]);
    expect(sim.buildings[0].targetTroop).toBe(0);
  });
});

describe('Sabotage', () => {
  it('a Saboteur jams the nearest defense, which stays silent, then recovers', () => {
    const sim = createBattle({ seed: 7, base: towerBase(), army: { saboteur: 1 } }, data);
    expect(deploy(sim, { tick: 0, troop: 'saboteur', x: 10, y: 21 })).toBe(true);
    let jamTick = -1;
    let recoveredTick = -1;
    let firedWhileJammed = false;
    for (let i = 0; i < 400 && !sim.ended; i++) {
      step(sim);
      for (const e of sim.events) {
        if (e.k === 'sabotage') jamTick = sim.tick - 1;
        if (e.k === 'recovered') recoveredTick = sim.tick - 1;
        if (e.k === 'fire' && jamTick >= 0 && recoveredTick < 0) firedWhileJammed = true;
      }
      if (recoveredTick >= 0) break;
    }
    expect(jamTick).toBeGreaterThan(0);
    expect(recoveredTick).toBe(jamTick + SAB.disableTicks);
    expect(firedWhileJammed).toBe(false);
    expect(sim.troops[0].charges).toBe(0);
    const tower = sim.buildings[0];
    expect(tower.immuneUntil).toBe(tower.disabledUntil + SAB.immunityTicks);
    expect(sabotageable(sim, tower)).toBe(false);
  });

  it('a second Saboteur goes for a different working defense instead of the jammed one', () => {
    const base = towerBase([{ id: 'k2', type: 'acorn_cannon', level: 1, x: 26, y: 12 }]);
    const sim = createBattle({ seed: 7, base, army: { saboteur: 2 } }, data);
    deploy(sim, { tick: 0, troop: 'saboteur', x: 10, y: 21 });
    for (let i = 0; i < 300 && !sim.events.some((e) => e.k === 'sabotage'); i++) step(sim);
    expect(sim.buildings[0].disabledUntil).toBeGreaterThan(sim.tick);
    deploy(sim, { tick: sim.tick, troop: 'saboteur', x: 10, y: 22 });
    step(sim);
    expect(sim.troops[1].target).toBe(2); // the other Kunai Tower
  });

  it('can never keep one defense disabled indefinitely', () => {
    // Ten Saboteurs queue up on a single tower all battle long.
    const sim = createBattle({ seed: 11, base: towerBase(), army: { saboteur: 10 } }, data);
    for (let i = 0; i < 10; i++) deploy(sim, { tick: 0, troop: 'saboteur', x: 10, y: 15 + i });
    sim.buildings[0].hp = sim.buildings[0].maxHp = 1e9; // it must outlast every Saboteur
    let silent = 0;
    let total = 0;
    while (!sim.ended && sim.tick < 1200) {
      step(sim);
      const b = sim.buildings[0];
      if (b.destroyed) break;
      total++;
      if (sim.tick <= b.disabledUntil) silent++;
    }
    expect(total).toBeGreaterThan(3 * (SAB.disableTicks + SAB.immunityTicks)); // ran several jam cycles
    expect(silent).toBeGreaterThan(SAB.disableTicks); // jammed more than once
    // At most disable / (disable + immunity) of the time, plus one window of slack.
    const cycle = SAB.disableTicks + SAB.immunityTicks;
    expect(silent).toBeLessThanOrEqual(Math.ceil(total / cycle) * SAB.disableTicks + 1);
  });

  it('jammed defenses ignore troops in range and need no new deployment rules', () => {
    const sim = createBattle({ seed: 7, base: towerBase(), army: { saboteur: 1, beetle_brute: 1 } }, data);
    deploy(sim, { tick: 0, troop: 'saboteur', x: 10, y: 21 });
    for (let i = 0; i < 300 && !sim.events.some((e) => e.k === 'sabotage'); i++) step(sim);
    deploy(sim, { tick: sim.tick, troop: 'beetle_brute', x: 16, y: 21 });
    step(sim);
    expect(sim.buildings[0].targetTroop).toBe(-1);
  });
});

describe('tactics replay exactly', () => {
  const opponent = generateOpponent(1234, 3, data);
  const army = { saboteur: 4, beetle_brute: 4, frog_lobber: 20, hedgehog_roller: 20 };

  /** Sabotage first, smoke over the core, then the main attack. */
  const plan: Deployment[] = [
    ...[0, 1, 2, 3].map((i) => ({ tick: i * 3, troop: 'saboteur', x: 1, y: 10 + i * 4 })),
    { tick: 40, troop: 'smoke_bomb', x: 20, y: 20 },
    ...Array.from({ length: 4 }, (_, i) => ({ tick: 45 + i, troop: 'beetle_brute', x: 1, y: 18 + i })),
    ...Array.from({ length: 20 }, (_, i) => ({ tick: 60 + i, troop: 'frog_lobber', x: 1, y: 14 + (i % 10) })),
    ...Array.from({ length: 20 }, (_, i) => ({ tick: 70 + i, troop: 'hedgehog_roller', x: 1, y: 14 + (i % 10) })),
    { tick: 120, troop: 'smoke_bomb', x: 18, y: 22 },
  ];

  it('the same seed and deployments always give the same battle', () => {
    const a = runBattle({ seed: 99, base: opponent, army }, plan, data);
    const b = runBattle({ seed: 99, base: opponent, army }, plan, data);
    expect(a.result).toEqual(b.result);
    expect(a.sim.abilitiesUsed.smoke_bomb).toBe(2);
    expect(a.result.used.smoke_bomb).toBeUndefined();
  });

  it('a live session and its recorded replay agree', () => {
    const live = new BattleSession({ seed: 5, base: opponent, army }, data, 'live');
    const byTick = new Map<number, Deployment[]>();
    for (const d of plan) byTick.set(d.tick, [...(byTick.get(d.tick) ?? []), d]);
    while (!live.sim.ended) {
      for (const d of byTick.get(live.sim.tick) ?? []) live.tryDeploy(d.troop, d.x, d.y);
      live.update(live.msPerTick);
      drainEvents(live);
    }
    const replay = runBattle({ seed: 5, base: opponent, army }, live.deployments, data);
    expect(replay.result.hash).toBe(live.result().hash);
    expect(live.deployments.filter((d) => d.troop === 'smoke_bomb')).toHaveLength(2);
  });
});
