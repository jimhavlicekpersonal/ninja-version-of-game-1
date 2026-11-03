/**
 * The five defensive counters that are live in combat: each one measurably
 * answers its warrior family, stays soft (never a lock-out), and replays exactly.
 */
import { describe, expect, it } from 'vitest';
import { airborne, createBattle, deploy, runBattle, step, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { auraStrength, isHidden } from '../../../src/gameplay/sim/battle/warriors';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import type { BaseBuilding, BaseLayout } from '../../../src/gameplay/sim/battle/types';

const hall: BaseBuilding = { id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 };

function sim(buildings: BaseBuilding[], army: Record<string, number>): BattleSim {
  const base: BaseLayout = { name: 'Counter arena', hallLevel: 15, buildings: [hall, ...buildings] };
  return createBattle({ seed: 7, base, army, levels: {} }, data);
}
/** Put a troop at an exact spot (deploy needs open ground, so place it afterwards). */
function place(s: BattleSim, troop: string, x: number, y: number): number {
  expect(deploy(s, { troop, x: 1, y: 1, tick: s.tick })).toBe(true);
  const i = s.troops.length - 1;
  for (const t of s.troops.slice(i)) { t.x = t.px = x; t.y = t.py = y; }
  return i;
}
const advance = (s: BattleSim, n: number) => { for (let i = 0; i < n; i++) step(s); };

describe('live defensive counters are real buildings', () => {
  it.each(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura'])('%s is buildable and unlocks at its catalog Keep', (id) => {
    const def = data.buildings[id];
    expect(def.inShop).toBe(true);
    expect(def.effect).toBeDefined();
    const first = data.hall.levels.findIndex((l) => (l.limits[id]?.count ?? 0) > 0) + 1;
    expect(first).toBeGreaterThan(0);
    // Every later Keep keeps it, and the max level never goes down.
    let prev = 0;
    for (const l of data.hall.levels.slice(first - 1)) {
      expect(l.limits[id].maxLevel).toBeGreaterThanOrEqual(prev);
      prev = l.limits[id].maxLevel;
    }
    expect(prev).toBe(def.levels.length);
  });
});

describe('Paper Lantern Line: stealth detection', () => {
  const lantern: BaseBuilding = { id: 'l', type: 'paper_lantern_line', level: 1, x: 10, y: 10 };
  const tower: BaseBuilding = { id: 'k', type: 'acorn_cannon', level: 1, x: 14, y: 9 };

  it('lights a hidden Shadow Stalker so defenses can shoot it, and lit warriors take extra damage', () => {
    const s = sim([lantern, tower], { shadow_stalker: 1 });
    s.buildings[2].combat = null; // keep the tower quiet so only the lantern acts
    const ti = place(s, 'shadow_stalker', 10.5, 11.5);
    expect(isHidden(s, s.troops[ti])).toBe(true);
    step(s);
    const t = s.troops[ti];
    expect(t.litUntil).toBeGreaterThan(s.tick);
    expect(isHidden(s, t)).toBe(false);
    expect(s.buildings[1].hidden).toBe(false);
    expect(s.buildings[1].destroyed).toBe(false);
    const before = t.hp;
    const lv = data.buildings.paper_lantern_line.levels[0].effect!;
    s.buildings[2].combat = { ...data.buildings.acorn_cannon.combat!, damage: 10 };
    // Direct hit through the battle's damage path: 10 damage becomes 10 × (1 + bonus).
    s.projectiles.push({ id: 999, kind: 'acorn', fromX: 15, fromY: 10, toX: t.x, toY: t.y, total: 1, left: 1, damage: 10, splash: 0, targetTroop: ti, targetBuilding: -1, hitsAir: false, hitsGround: true, arc: false });
    step(s);
    expect(before - t.hp).toBeCloseTo(10 * (1 + lv.vulnerablePct!), 5);
  });

  it('wears off: a stalker that leaves the lanterns is hidden again after the light fades', () => {
    const s = sim([lantern], { shadow_stalker: 1 });
    const ti = place(s, 'shadow_stalker', 10.5, 11.5);
    step(s);
    const t = s.troops[ti];
    t.x = t.px = 25; t.y = t.py = 25; t.target = -1; t.path = null;
    const fade = t.litUntil - s.tick;
    for (let i = 0; i <= fade; i++) { step(s); t.x = 25; t.y = 25; }
    expect(isHidden(s, t)).toBe(t.revealed ? false : true);
  });

  it('ignores ordinary warriors and flyers', () => {
    const s = sim([lantern], { hedgehog_roller: 1, owl_bomber: 1 });
    const a = place(s, 'hedgehog_roller', 10.5, 11.5);
    const b = place(s, 'owl_bomber', 10.5, 11.5);
    step(s);
    expect(s.troops[a].litUntil).toBe(0);
    expect(s.troops[b].litUntil).toBe(0);
    expect(s.buildings[1].hidden).toBe(true);
  });
});

describe('Clockwork Repair Crane: jam recovery', () => {
  const tower: BaseBuilding = { id: 'k', type: 'acorn_cannon', level: 1, x: 10, y: 10 };
  const crane: BaseBuilding = { id: 'c', type: 'clockwork_repairer', level: 1, x: 13, y: 10 };

  function jammed(withCrane: boolean): BattleSim {
    const s = sim(withCrane ? [tower, crane] : [tower], { saboteur: 1 });
    place(s, 'saboteur', 10.5, 9.6);
    for (let i = 0; i < 40 && s.buildings[1].disabledUntil === 0; i++) step(s);
    expect(s.buildings[1].disabledUntil).toBeGreaterThan(s.tick);
    step(s);
    return s;
  }

  it('cuts a jam short and keeps the full recovery immunity afterwards', () => {
    const plain = jammed(false).buildings[1];
    const fixed = jammed(true);
    const b = fixed.buildings[1];
    const lv = data.buildings.clockwork_repairer.levels[0].effect!;
    expect(b.disabledUntil).toBeLessThan(plain.disabledUntil);
    expect(b.immuneUntil - b.disabledUntil).toBe(plain.immuneUntil - plain.disabledUntil);
    expect(fixed.buildings[2].uses).toBe(lv.uses! - 1);
    // Each jam is repaired once.
    step(fixed);
    expect(fixed.buildings[2].uses).toBe(lv.uses! - 1);
  });

  it('runs out of repairs', () => {
    const s = sim([tower, crane], {});
    const b = s.buildings[1];
    const uses = s.buildings[2].uses;
    for (let i = 0; i < uses + 2; i++) {
      b.disabledUntil = s.tick + 60;
      b.immuneUntil = b.disabledUntil + 100;
      step(s);
    }
    expect(s.buildings[2].uses).toBe(0);
    b.disabledUntil = s.tick + 60;
    step(s);
    expect(b.disabledUntil).toBe(s.tick + 59);
  });
});

describe('Bitter Incense Burner: anti-healing', () => {
  const burner: BaseBuilding = { id: 'i', type: 'bitter_incense_burner', level: 10, x: 10, y: 10 };

  function healed(withBurner: boolean): number {
    const s = sim(withBurner ? [burner] : [], { hedgehog_roller: 1, herbalist: 1 });
    const fighter = place(s, 'hedgehog_roller', 11, 12.5);
    place(s, 'herbalist', 11.5, 12.5);
    for (const t of s.troops) t.hp = t.maxHp / 2;
    const start = s.troops[fighter].hp;
    // Hold both in place inside the smoke for a few heal pulses.
    for (let i = 0; i < 30; i++) { step(s); s.troops[fighter].x = 11; s.troops[fighter].y = 12.5; s.troops[1].x = 11.5; s.troops[1].y = 12.5; }
    return s.troops[fighter].hp - start;
  }

  it('cuts healing by the level\'s percentage', () => {
    const cut = data.buildings.bitter_incense_burner.levels[9].effect!.healCutPct!;
    const full = healed(false);
    expect(full).toBeGreaterThan(0);
    expect(healed(true)).toBeCloseTo(full * (1 - cut), 3);
  });

  it('weakens haste and toughness auras, but never removes them', () => {
    const s = sim([burner], { hedgehog_roller: 1, drum_monk: 1 });
    const ti = place(s, 'hedgehog_roller', 11, 12.5);
    place(s, 'drum_monk', 11.5, 12.5);
    const base = auraStrength(s, s.troops[ti], 'haste');
    step(s);
    s.troops[ti].x = 11; s.troops[ti].y = 12.5; s.troops[1].x = 11.5; s.troops[1].y = 12.5;
    const cut = s.troops[ti].auraCut;
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThanOrEqual(0.5);
    expect(auraStrength(s, s.troops[ti], 'haste')).toBeCloseTo(base * (1 - cut));
  });

  it('two burners do not stack', () => {
    const s = sim([burner, { ...burner, id: 'i2', x: 13 }], { hedgehog_roller: 1 });
    const ti = place(s, 'hedgehog_roller', 12.5, 12.5);
    step(s);
    expect(s.troops[ti].healCut).toBe(data.buildings.bitter_incense_burner.levels[9].effect!.healCutPct);
  });
});

describe('Kite-Cutter Ballista: anti-air control', () => {
  const ballista: BaseBuilding = { id: 'b', type: 'kite_cutter_ballista', level: 1, x: 10, y: 10 };
  const cannon: BaseBuilding = { id: 'k', type: 'acorn_cannon', level: 1, x: 10, y: 14 };

  it('grounds a flyer so ground-only defenses can hit it, then lets it go with immunity', () => {
    const s = sim([ballista, cannon], { crane_glider: 1 });
    const ti = place(s, 'crane_glider', 12, 13);
    const t = s.troops[ti];
    t.hp = t.maxHp = 1e9;
    let grounded = -1;
    let cannonHit = false;
    for (let i = 0; i < 80; i++) {
      step(s);
      t.x = 12; t.y = 13;
      if (grounded < 0 && t.groundedUntil > s.tick) grounded = s.tick;
      if (s.events.some((e) => e.k === 'fire' && e.building === 2) && !airborne(s, t)) cannonHit = true;
    }
    expect(grounded).toBeGreaterThan(0);
    expect(cannonHit).toBe(true);
    const tps = data.battle.ticksPerSecond;
    const e = data.buildings.kite_cutter_ballista.effect!;
    expect(t.groundImmuneUntil - t.groundedUntil).toBe(e.immuneSeconds! * tps);
  });

  it('can never keep a flyer down: at most seconds/(seconds + immunity) of the time grounded', () => {
    const e = data.buildings.kite_cutter_ballista.effect!;
    const s = sim([ballista, { ...ballista, id: 'b2', x: 13 }, { ...ballista, id: 'b3', x: 10, y: 7 }], { crane_glider: 1 });
    const ti = place(s, 'crane_glider', 12, 10);
    const t = s.troops[ti];
    t.hp = t.maxHp = 1e9;
    let down = 0;
    const n = 400;
    for (let i = 0; i < n; i++) { step(s); t.x = 12; t.y = 10; if (!airborne(s, t)) down++; }
    expect(down / n).toBeLessThanOrEqual(e.seconds! / (e.seconds! + e.immuneSeconds!) + 0.05);
  });

  it('does not shoot ground warriors', () => {
    const s = sim([ballista], { hedgehog_roller: 1 });
    place(s, 'hedgehog_roller', 12, 12);
    advance(s, 30);
    expect(s.projectiles.length + s.troops.filter((t) => t.hp < t.maxHp).length).toBe(0);
  });
});

describe('Longbow Yagura: artillery counter', () => {
  const yagura: BaseBuilding = { id: 'y', type: 'longbow_yagura', level: 1, x: 20, y: 20 };

  it('outranges every live warrior, Siege Bombardier included', () => {
    const reach = data.buildings.longbow_yagura.combat!.range - data.buildings.longbow_yagura.size / 2;
    for (const [id, t] of Object.entries(data.troops)) expect(reach, id).toBeGreaterThanOrEqual(t.range);
  });

  it('picks the long-range attacker over a closer melee warrior', () => {
    const s = sim([yagura], { hedgehog_roller: 1, siege_bombardier: 1 });
    const melee = place(s, 'hedgehog_roller', 21, 24.5);
    const artillery = place(s, 'siege_bombardier', 21, 32);
    for (const t of s.troops) t.hp = t.maxHp = 1e9;
    step(s);
    expect(s.buildings[1].targetTroop).toBe(artillery);
    expect(s.buildings[1].targetTroop).not.toBe(melee);
  });

  it('cannot hit warriors that get inside its minimum range', () => {
    const s = sim([yagura], { hedgehog_roller: 1 });
    place(s, 'hedgehog_roller', 21, 22.2);
    for (const t of s.troops) t.hp = t.maxHp = 1e9;
    advance(s, 40);
    expect(s.troops[0].hp).toBe(1e9);
  });

  it('picks off bombardiers that siege from outside every other defense\'s range', () => {
    // Bombardiers shell a wall line from range; a Kunai Tower behind the walls can't reach them.
    const walls: BaseBuilding[] = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, type: 'bramble_hedge', level: 8, x: 15 + i, y: 26 }));
    const tower: BaseBuilding = { id: 'k', type: 'acorn_cannon', level: 10, x: 19, y: 20 };
    const setup = (withYagura: boolean) => ({
      seed: 3,
      base: { name: 'Siege', hallLevel: 15, buildings: [hall, ...walls, tower, ...(withYagura ? [{ ...yagura, level: 3, x: 19, y: 24 }] : [])] },
      army: { siege_bombardier: 2 },
      levels: { siege_bombardier: 8 },
    });
    const deploys = [0, 1].map((tick) => ({ tick, troop: 'siege_bombardier', x: 20, y: 37 }));
    const without = runBattle(setup(false), deploys, data, 400).sim;
    const withY = runBattle(setup(true), deploys, data, 400).sim;
    expect(without.troops.filter((t) => t.dead)).toHaveLength(0);
    expect(withY.troops.filter((t) => t.dead).length).toBe(2);
  });
});

describe('counters replay exactly', () => {
  it('same seed and deployments give the same result with every counter on the map', () => {
    const base: BaseLayout = { name: 'All counters', hallLevel: 15, buildings: [
      hall,
      { id: 'l', type: 'paper_lantern_line', level: 3, x: 24, y: 26 },
      { id: 'c', type: 'clockwork_repairer', level: 5, x: 26, y: 24 },
      { id: 'i', type: 'bitter_incense_burner', level: 5, x: 22, y: 24 },
      { id: 'b', type: 'kite_cutter_ballista', level: 5, x: 26, y: 28 },
      { id: 'y', type: 'longbow_yagura', level: 5, x: 22, y: 28 },
      { id: 'k', type: 'acorn_cannon', level: 8, x: 24, y: 22 },
    ] };
    const army = { shadow_stalker: 3, saboteur: 2, herbalist: 2, crane_glider: 2, siege_bombardier: 2, hedgehog_roller: 5 };
    const deployments = Object.entries(army).flatMap(([troop, n], k) => Array.from({ length: n }, (_, i) => ({ tick: k * 5 + i, troop, x: 4 + k, y: 4 })));
    const setup = { seed: 11, base, army, levels: {} };
    const a = runBattle(setup, deployments, data);
    const b = runBattle(setup, deployments, data);
    expect(a.result).toEqual(b.result);
    expect(a.result.destruction).toBeGreaterThan(0);
  });
});
