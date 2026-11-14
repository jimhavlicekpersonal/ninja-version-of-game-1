/**
 * Content batch 2026-11-14: the fifteen non-live defensive counters. Each mechanic works in the battle sim
 * (data/planned.json through `withPreview`), deterministically; none of them is in the shipped data.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, deploy, runBattle, step, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { attackDamage } from '../../../src/gameplay/sim/battle/warriors';
import { burnFactor, conductFactor, springBlocks } from '../../../src/gameplay/sim/battle/previewCounters';
import { defaultData } from '../../../src/gameplay/sim/data';
import { withPreview } from '../../../src/gameplay/sim/plannedContent';
import type { BaseBuilding, BaseLayout } from '../../../src/gameplay/sim/battle/types';

const P = withPreview(defaultData);
const hall: BaseBuilding = { id: 'h', type: 'elder_toadstool', level: 1, x: 40, y: 40 };

function sim(buildings: BaseBuilding[], army: Record<string, number>, data = P): BattleSim {
  const base: BaseLayout = { name: 'Planned counter arena', hallLevel: 15, buildings: [hall, ...buildings] };
  return createBattle({ seed: 11, base, army, levels: {} }, data);
}
/** Put a troop at an exact spot (deploy needs open ground, so place it afterwards). */
function place(s: BattleSim, troop: string, x: number, y: number): number {
  const before = s.troops.length;
  expect(deploy(s, { troop, x: 1, y: 1, tick: s.tick })).toBe(true);
  for (const t of s.troops.slice(before)) { t.x = t.px = x; t.y = t.py = y; }
  return before;
}
const advance = (s: BattleSim, n: number) => { for (let i = 0; i < n; i++) step(s); };
const quiet = (s: BattleSim, ...indexes: number[]) => { for (const i of indexes) s.buildings[i].combat = null; };
const frozen = (s: BattleSim, ...troops: number[]) => { for (const i of troops) s.troops[i].stunnedUntil = 1e9; };
const b = (id: string, type: string, x: number, y: number, level = 1): BaseBuilding => ({ id, type, level, x, y });

describe('Whirling Blade Tower (spin_aoe)', () => {
  it('hits every ground warrior next to it at once, not flyers or anyone standing back', () => {
    const s = sim([b('w', 'whirling_blade_tower', 10, 10)], { beetle_brute: 4, owl_bomber: 1 });
    const near = [place(s, 'beetle_brute', 12.4, 11), place(s, 'beetle_brute', 11, 12.4), place(s, 'beetle_brute', 9.6, 11)];
    const far = place(s, 'beetle_brute', 20, 20);
    const flyer = place(s, 'owl_bomber', 12.4, 11.5);
    frozen(s, ...near, far, flyer);
    const hp = s.troops.map((t) => t.hp);
    step(s);
    const dmg = s.buildings[1].combat!.damage;
    for (const i of near) expect(hp[i] - s.troops[i].hp).toBeCloseTo(dmg, 6);
    expect(s.troops[far].hp).toBe(hp[far]);
    expect(s.troops[flyer].hp).toBe(hp[flyer]);
    // It waits a full interval before the next spin.
    step(s);
    for (const i of near) expect(hp[i] - s.troops[i].hp).toBeCloseTo(dmg, 6);
  });
});

describe('Rain Barrel Tower (extinguish)', () => {
  it('ends poison and burning on buildings in reach after a second, and shrinks a firebomb that lands there', () => {
    const s = sim([b('r', 'rain_barrel_tower', 10, 10), b('k', 'acorn_cannon', 13, 10), b('far', 'acorn_cannon', 30, 30)], { blowgun_hunter: 1 });
    quiet(s, 1, 2, 3);
    const ti = place(s, 'blowgun_hunter', 50, 50);
    frozen(s, ti);
    s.warriorEffects.push({ kind: 'poison', source: ti, target: 2, x: 14.5, y: 11.5, radius: 0, damage: 1, endsTick: 200 });
    s.warriorEffects.push({ kind: 'poison', source: ti, target: 3, x: 31.5, y: 31.5, radius: 0, damage: 1, endsTick: 200 });
    s.warriorEffects.push({ kind: 'burn', source: ti, target: 2, x: 12, y: 12, radius: 2, damage: 1, endsTick: 200 });
    step(s);
    const tps = P.battle.ticksPerSecond;
    const [near, far, burn] = s.warriorEffects;
    expect(near.endsTick).toBeLessThanOrEqual(tps + 1);
    expect(far.endsTick).toBe(200);
    expect(burn.endsTick).toBeLessThanOrEqual(tps + 1);
    expect(burn.radius).toBeCloseTo(2 * (1 - 0.25), 6);
    advance(s, tps + 1);
    expect(s.warriorEffects.filter((e) => e.target === 2)).toHaveLength(0);
    expect(s.warriorEffects.some((e) => e.target === 3)).toBe(true);
  });

  it('wet ground conducts lightning: Thunder Kites and Storm Sovereigns hit buildings in reach harder', () => {
    const s = sim([b('r', 'rain_barrel_tower', 10, 10), b('k', 'acorn_cannon', 13, 10)], { thunder_kite: 1, hedgehog_roller: 1 });
    const kite = place(s, 'thunder_kite', 40, 5);
    const blade = place(s, 'hedgehog_roller', 40, 6);
    expect(conductFactor(s, s.troops[kite], s.buildings[2])).toBeCloseTo(1.25, 9);
    expect(conductFactor(s, s.troops[blade], s.buildings[2])).toBe(1);
  });
});

describe('Listening Jars (detect_underground)', () => {
  it('forces a digger up and stuns it once, and reveals hidden walkers close by', () => {
    const s = sim([b('j', 'listening_jars', 10, 10)], { mole_digger: 1, shadow_stalker: 1 });
    const digger = place(s, 'mole_digger', 11.5, 12.5);
    const stalker = place(s, 'shadow_stalker', 10.5, 11.8);
    step(s);
    const d = s.troops[digger];
    expect(d.surfaced).toBe(true);
    expect(d.stunnedUntil).toBeGreaterThan(s.tick);
    expect(s.buildings[1].hidden).toBe(false);
    expect(s.troops[stalker].revealed).toBe(true);
    const x = d.x;
    step(s);
    expect(d.x).toBe(x); // stunned: it does not move
    const until = d.stunnedUntil!;
    d.x = d.px = 11.5;
    advance(s, P.battle.ticksPerSecond * 2);
    expect(d.stunnedUntil).toBe(until); // once per warrior
  });
});

describe('Living Bamboo Wall (regrow_wall)', () => {
  it('grows back, halves wall-breaking bonuses and cannot be climbed', () => {
    const s = sim([b('wall', 'living_bamboo_wall', 10, 10), b('stone', 'bramble_hedge', 20, 20)], { ram_crew: 1, wall_climber: 1, mole_digger: 1 });
    const wall = s.buildings[1];
    wall.hp = wall.maxHp / 2;
    advance(s, P.battle.ticksPerSecond);
    expect(wall.hp).toBeCloseTo(wall.maxHp / 2 + wall.maxHp * 0.03, 6);
    const ram = s.troops[place(s, 'ram_crew', 9, 9)];
    const onBamboo = attackDamage(s, ram, wall);
    const onStone = attackDamage(s, ram, s.buildings[2]);
    expect(onStone / ram.damage).toBeCloseTo(4, 9);
    expect(onBamboo / ram.damage).toBeCloseTo(2.5, 9);
    expect(springBlocks(s.troops[place(s, 'wall_climber', 30, 30)], wall)).toBe(true);
    expect(springBlocks(s.troops[place(s, 'mole_digger', 31, 31)], wall)).toBe(false);
    expect(springBlocks(s.troops[0], s.buildings[2])).toBe(false);
  });
});

describe('Straw Scarecrow (beast_decoy)', () => {
  it('stands in plain sight and draws beasts within 3 tiles; others ignore it', () => {
    const s = sim([b('sc', 'straw_scarecrow', 10, 10), b('k', 'acorn_cannon', 14, 10)], { hound_handler: 1, hedgehog_roller: 1 });
    quiet(s, 2);
    expect(s.buildings[1].hidden).toBe(false);
    const hound = place(s, 'hound_handler', 13, 13.5);
    const blade = place(s, 'hedgehog_roller', 13, 13.5);
    step(s);
    expect(s.troops[hound].target).toBe(1);
    expect(s.troops[hound + 1].target).toBe(1); // its hounds too
    expect(s.troops[blade].target).not.toBe(1);
  });

  it('scares Crane Gliders off what it guards, and burns twice as hot', () => {
    const s = sim([b('sc', 'straw_scarecrow', 10, 10), b('near', 'acorn_silo', 13, 10), b('far', 'acorn_silo', 30, 30)], { crane_glider: 1 });
    const crane = place(s, 'crane_glider', 16, 11);
    step(s);
    expect(s.troops[crane].target).toBe(3);
    expect(burnFactor(s.buildings[1])).toBe(2);
    const plain = sim([b('near', 'acorn_silo', 13, 10), b('far', 'acorn_silo', 30, 30)], { crane_glider: 1 });
    const c2 = place(plain, 'crane_glider', 16, 11);
    step(plain);
    expect(plain.troops[c2].target).toBe(1);
  });
});

describe('Bronze Mirror Screen (reflect_projectiles)', () => {
  it('sends every third projectile back at its thrower', () => {
    const s = sim([b('m', 'mirror_screen', 10, 10)], { frog_lobber: 1 });
    const ti = place(s, 'frog_lobber', 30, 30);
    frozen(s, ti);
    const mirror = s.buildings[1];
    const t = s.troops[ti];
    const shot = () => s.projectiles.push({ id: 900 + s.tick, kind: 'pebble', fromX: 30, fromY: 30, toX: 11, toY: 11, total: 1, left: 1, damage: 10, splash: 0, targetTroop: -1, targetBuilding: 1, hitsAir: false, hitsGround: false, arc: true, sourceTroop: ti });
    const hp = t.hp;
    shot(); step(s);
    shot(); step(s);
    expect(mirror.maxHp - mirror.hp).toBeCloseTo(20, 6);
    expect(t.hp).toBe(hp);
    shot(); step(s);
    expect(mirror.maxHp - mirror.hp).toBeCloseTo(20, 6);
    expect(hp - t.hp).toBeCloseTo(10, 6);
  });
});

describe('Sand Bucket Post (smother_splash)', () => {
  it('cuts splash and embers on buildings in reach, and defuses two planted charges', () => {
    const s = sim([b('p', 'sand_bucket_post', 10, 10), b('k', 'acorn_cannon', 13, 10), b('far', 'acorn_cannon', 30, 30)], { fuse_master: 1 });
    quiet(s, 2, 3);
    const ti = place(s, 'fuse_master', 50, 50);
    frozen(s, ti);
    for (let i = 0; i < 3; i++) s.warriorEffects.push({ kind: 'charge', source: ti, target: 2, x: 14.5, y: 11.5, radius: 0, damage: 100, endsTick: 500 });
    s.warriorEffects.push({ kind: 'charge', source: ti, target: 3, x: 31.5, y: 31.5, radius: 0, damage: 100, endsTick: 500 });
    step(s);
    expect(s.buildings[2].smother).toBeCloseTo(0.3, 9);
    expect(s.buildings[3].smother).toBe(0);
    expect(burnFactor(s.buildings[2])).toBeCloseTo(0.7, 9);
    expect(s.buildings[1].uses).toBe(0);
    expect(s.warriorEffects.filter((e) => e.target === 2)).toHaveLength(1);
    expect(s.warriorEffects.filter((e) => e.target === 3)).toHaveLength(1);
  });
});

describe('Discipline Banner (focus_aura)', () => {
  const setup = (banner: boolean) => {
    const s = sim([...(banner ? [b('d', 'discipline_banner', 10, 10)] : []), b('k', 'acorn_cannon', 12, 10)], { bell_warden: 1, hedgehog_roller: 1 });
    const tower = s.buildings.length - 1;
    const bell = place(s, 'bell_warden', 18, 11.5);
    const blade = place(s, 'hedgehog_roller', 16, 11.5);
    frozen(s, bell, blade);
    step(s);
    return { target: s.buildings[tower].targetTroop, bell, blade };
  };
  it('lets covered defenses ignore a Bell Warden\'s taunt', () => {
    const plain = setup(false);
    expect(plain.target).toBe(plain.bell);
    const focused = setup(true);
    expect(focused.target).toBe(focused.blade);
  });
});

describe("Spotter's Perch (instant_retarget)", () => {
  const setup = (perch: boolean) => {
    const s = sim([...(perch ? [b('sp', 'spotter_perch', 10, 10)] : []), b('k', 'acorn_cannon', 12, 10)], { hedgehog_roller: 1, wind_step_assassin: 1 });
    const tower = s.buildings.length - 1;
    const blade = place(s, 'hedgehog_roller', 16, 11.5);
    const dasher = place(s, 'wind_step_assassin', 18, 11.5);
    frozen(s, blade, dasher);
    step(s);
    return { target: s.buildings[tower].targetTroop, blade, dasher };
  };
  it('makes covered defenses switch onto a dasher in range', () => {
    const plain = setup(false);
    expect(plain.target).toBe(plain.blade);
    const spotted = setup(true);
    expect(spotted.target).toBe(spotted.dasher);
  });
});

describe('Steam Vent (no_projectile_aoe)', () => {
  it('scalds hidden warriors in its circle and blows smoke away', () => {
    const s = sim([b('v', 'steam_vent', 10, 10)], { shadow_stalker: 1 });
    const ti = place(s, 'shadow_stalker', 11.5, 12.2);
    frozen(s, ti);
    s.smokes.push({ id: 1, x: 11.5, y: 11.5, radius: 2, startTick: 0, endsTick: 80 });
    s.smokes.push({ id: 2, x: 30.5, y: 30.5, radius: 2, startTick: 0, endsTick: 80 });
    const hp = s.troops[ti].hp;
    step(s);
    expect(s.troops[ti].revealed).toBe(false);
    expect(s.troops[ti].hp).toBeCloseTo(Math.max(0, hp - s.buildings[1].combat!.damage), 6);
    expect(s.smokes.map((c) => c.id)).toEqual([2]);
  });
});

describe('Sleep Dart Tower (sleep)', () => {
  it('puts a warrior to sleep once, then prefers warriors still awake', () => {
    const s = sim([b('s', 'sleep_dart_tower', 10, 10)], { beetle_brute: 2 });
    const a = place(s, 'beetle_brute', 15, 11);
    const c = place(s, 'beetle_brute', 16, 11);
    frozen(s, c);
    s.troops[a].stunnedUntil = undefined;
    s.troops[a].target = 0;
    let slept = -1;
    for (let i = 0; i < 60 && slept < 0; i++) {
      step(s);
      slept = s.troops.findIndex((t) => t.slept);
    }
    expect(slept).toBe(a);
    const t = s.troops[a];
    expect(t.stunnedUntil).toBeGreaterThan(s.tick);
    const x = t.x;
    step(s);
    expect(t.x).toBe(x);
    // The next dart goes for the warrior still awake.
    s.troops[c].stunnedUntil = undefined;
    for (let i = 0; i < 40 && !s.troops[c].slept; i++) step(s);
    expect(s.troops[c].slept).toBe(true);
  });
});

describe('Rolling Log Chute (line_crush)', () => {
  it('crushes every ground warrior in its lane (not splash), and no one beside it', () => {
    const s = sim([b('log', 'rolling_log_chute', 10, 10)], { beetle_brute: 4 });
    const trigger = place(s, 'beetle_brute', 10.5, 11.2);
    const inLane = place(s, 'beetle_brute', 10.5, 14);
    const beside = place(s, 'beetle_brute', 12.5, 13);
    const behind = place(s, 'beetle_brute', 10.5, 5);
    frozen(s, trigger, inLane, beside, behind);
    const dmg = P.buildings.rolling_log_chute.levels[0].damage!;
    step(s);
    expect(s.buildings[1].destroyed).toBe(true);
    for (const i of [trigger, inLane]) expect(s.troops[i].hp).toBeCloseTo(Math.max(0, s.troops[i].maxHp - dmg), 6);
    for (const i of [beside, behind]) expect(s.troops[i].hp).toBe(s.troops[i].maxHp);
  });
});

describe('Moonlit Gravel Garden (arrival_stun)', () => {
  it('stuns a Void Walker that lands on it, once; ordinary warriors walk over it', () => {
    const s = sim([b('g', 'moonlit_gravel', 10, 10)], { void_walker: 1, hedgehog_roller: 1 });
    const walker = place(s, 'void_walker', 10.8, 11);
    const blade = place(s, 'hedgehog_roller', 11.2, 11);
    step(s);
    expect(s.troops[walker].stunnedUntil).toBeGreaterThan(s.tick);
    expect(s.troops[blade].stunnedUntil).toBeUndefined();
    const until = s.troops[walker].stunnedUntil;
    advance(s, 20);
    s.troops[walker].x = 10.8; s.troops[walker].y = 11;
    step(s);
    expect(s.troops[walker].stunnedUntil).toBe(until);
  });
});

describe('Ink Seal Post (no_revive)', () => {
  const run = (post: boolean) => {
    const s = sim([...(post ? [b('ink', 'ink_seal_post', 10, 10)] : [])], { hedgehog_roller: 1, spirit_caller: 1 });
    const victim = place(s, 'hedgehog_roller', 11.5, 12.5);
    const caller = place(s, 'spirit_caller', 12, 13);
    frozen(s, victim);
    s.projectiles.push({ id: 999, kind: 'acorn', fromX: 20, fromY: 20, toX: 11.5, toY: 12.5, total: 1, left: 1, damage: 1e6, splash: 0, targetTroop: victim, targetBuilding: -1, hitsAir: false, hitsGround: true, arc: false });
    step(s);
    expect(s.troops[victim].dead).toBe(true);
    s.troops[victim].stunnedUntil = undefined;
    advance(s, 3);
    return { s, victim, caller };
  };
  it('seals a warrior who falls in reach so a Spirit Caller cannot revive it', () => {
    const plain = run(false);
    expect(plain.s.troops[plain.victim].revived).toBe(true);
    const sealed = run(true);
    expect(sealed.s.troops[sealed.victim].sealed).toBe(true);
    expect(sealed.s.troops[sealed.victim].dead).toBe(true);
    expect(sealed.s.troops[sealed.victim].revived).toBe(false);
  });
});

describe('Lightning Rod Tower (absorb_lightning)', () => {
  it('takes Thunder Kite strikes meant for buildings in reach, and fires the charge back', () => {
    const s = sim([b('rod', 'lightning_rod_pagoda', 10, 10), b('k', 'acorn_cannon', 12, 10)], { thunder_kite: 1 });
    quiet(s, 2);
    s.buildings[1].effect = { ...s.buildings[1].effect!, capacity: 1e-6 };
    const kite = place(s, 'thunder_kite', 15.2, 11.5);
    const hp = s.troops[kite].hp;
    let absorbed = false;
    for (let i = 0; i < 80; i++) {
      step(s);
      if (s.events.some((e) => e.k === 'counter' && e.what === 'discharge')) absorbed = true;
    }
    expect(absorbed).toBe(true);
    expect(s.buildings[2].hp).toBe(s.buildings[2].maxHp);
    expect(s.troops[kite].hp).toBeLessThan(hp);
  });
});

describe('determinism', () => {
  it('a battle against every planned counter replays exactly', () => {
    const base: BaseLayout = {
      name: 'All planned', hallLevel: 15, buildings: [
        b('h', 'elder_toadstool', 20, 20, 13), b('w', 'whirling_blade_tower', 16, 16, 5), b('r', 'rain_barrel_tower', 25, 16, 5), b('j', 'listening_jars', 18, 26, 3),
        b('bw1', 'living_bamboo_wall', 14, 22, 5), b('bw2', 'living_bamboo_wall', 14, 23, 5), b('sc', 'straw_scarecrow', 28, 24, 3), b('m', 'mirror_screen', 22, 13, 4),
        b('sb', 'sand_bucket_post', 24, 26, 3), b('db', 'discipline_banner', 12, 18, 3), b('sp', 'spotter_perch', 28, 19, 3), b('sv', 'steam_vent', 18, 12, 3),
        b('sd', 'sleep_dart_tower', 12, 12, 3), b('lg', 'rolling_log_chute', 22, 28, 3), b('mg', 'moonlit_gravel', 26, 30, 2), b('ink', 'ink_seal_post', 30, 14, 2),
        b('rod', 'lightning_rod_pagoda', 31, 22, 2), b('k', 'acorn_cannon', 26, 21, 10),
      ],
    };
    const army = { hedgehog_roller: 10, thunder_kite: 4, hound_handler: 3, frog_lobber: 6, mole_digger: 4, void_walker: 3, spirit_caller: 2, bell_warden: 2, fire_monk: 3 };
    const deployments = Object.keys(army).flatMap((troop, i) => Array.from({ length: army[troop as keyof typeof army] }, (_, j) => ({ tick: i * 7 + j, troop, x: 3 + j, y: 3 + i })));
    const setup = { seed: 5, base, army, levels: {} };
    const a = runBattle(setup, deployments, P).result;
    const c = runBattle(setup, deployments, P).result;
    expect(a).toEqual(c);
    expect(a.ticks).toBeGreaterThan(0);
  });
});

describe('the live game never meets them', () => {
  it('a base without them carries no planned kinds', () => {
    expect(sim([b('k', 'acorn_cannon', 12, 10)], { hedgehog_roller: 1 }, defaultData).previewKinds).toBeUndefined();
    expect(sim([b('k', 'acorn_cannon', 12, 10)], { hedgehog_roller: 1 }).previewKinds).toBeUndefined();
  });
});
