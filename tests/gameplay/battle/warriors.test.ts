import { describe, expect, it } from 'vitest';
import { createBattle, deploy, runBattle, step, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { auraStrength, isHidden } from '../../../src/gameplay/sim/battle/warriors';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { WARRIORS } from '../../../src/gameplay/sim/progression';
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';

const base: BaseLayout = { name: 'Ability arena', hallLevel: 15, buildings: [
  { id: 'a', type: 'acorn_cannon', level: 1, x: 10, y: 10 },
  { id: 'b', type: 'acorn_cannon', level: 1, x: 13, y: 10 },
  { id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 },
  { id: 'w', type: 'bramble_hedge', level: 1, x: 9, y: 12 },
  { id: 't', type: 'thorn_snare', level: 1, x: 9, y: 11 },
  { id: 's', type: 'acorn_silo', level: 1, x: 10, y: 14 },
] };

function arena(...types: string[]): BattleSim {
  const army: Record<string, number> = {};
  for (const t of types) army[t] = (army[t] ?? 0) + 1;
  const sim = createBattle({ seed: 123, base, army }, data);
  for (const b of sim.buildings) { b.hp = b.maxHp = 100000; b.combat = null; }
  for (const type of types) {
    const index = sim.troops.length;
    expect(deploy(sim, { troop: type, x: 1, y: 1, tick: 0 })).toBe(true);
    for (const t of sim.troops.slice(index)) { t.x = t.px = 9.5; t.y = t.py = 10.5; }
  }
  return sim;
}
const advance = (sim: BattleSim, ticks: number) => { for (let i = 0; i < ticks; i++) step(sim); };

describe('all fifty playable warriors', () => {
  it.each(WARRIORS)('$name deploys, fights, and replays deterministically', (w) => {
    const type = w.liveTroop!;
    const setup = { seed: 94, base: { ...base, buildings: base.buildings.filter((b) => b.id !== 't').map((b) => ({ ...b, upgrading: true })) }, army: { [type]: 2 } };
    const deployments = [0, 1].map((tick) => ({ tick, troop: type, x: 6, y: 10 }));
    const a = runBattle(setup, deployments, data);
    const b = runBattle(setup, deployments, data);
    expect(a.result).toEqual(b.result);
    expect(a.sim.warriorEffects).toEqual(b.sim.warriorEffects);
    expect(a.result.used[type]).toBe(2);
    expect(a.sim.buildings.some((building) => building.hp < building.maxHp), w.name).toBe(true);
    expect(a.sim.troops.every((t) => Number.isFinite(t.hp) && Number.isFinite(t.x) && Number.isFinite(t.y))).toBe(true);
  });
});

describe('offensive abilities', () => {
  it('cleaves nearby buildings with reduced secondary damage', () => {
    const sim = arena('twin_fang_dancer');
    step(sim);
    const primary = sim.buildings[0].maxHp - sim.buildings[0].hp;
    const secondary = sim.buildings[1].maxHp - sim.buildings[1].hp;
    expect(primary).toBeCloseTo(sim.troops[0].damage);
    expect(secondary).toBeCloseTo(primary * .65);
  });
  it('applies a triple first hit once per target and a fourth-hit crescent', () => {
    const dash = arena('wind_step_assassin'); step(dash);
    expect(dash.buildings[0].maxHp - dash.buildings[0].hp).toBeCloseTo(dash.troops[0].damage * 3);
    advance(dash, 10);
    expect(dash.buildings[0].maxHp - dash.buildings[0].hp).toBeCloseTo(dash.troops[0].damage * 4);
    const moon = arena('moonblade_master'); advance(moon, 31);
    expect(moon.buildings[0].maxHp - moon.buildings[0].hp).toBeCloseTo(moon.troops[0].damage * 5.5);
  });
  it('poison continues between shots and same-type poison does not stack', () => {
    const sim = arena('blowgun_hunter', 'blowgun_hunter');
    advance(sim, 5);
    expect(sim.warriorEffects.filter((e) => e.kind === 'poison')).toHaveLength(1);
    const hp = sim.buildings[0].hp;
    sim.troops.forEach((t) => { t.cooldown = 100; }); step(sim);
    expect(sim.buildings[0].hp).toBeLessThan(hp);
  });
  it('armour shred amplifies the following warrior hit', () => {
    const sim = arena('chain_sickle_reaper', 'hedgehog_roller');
    advance(sim, 5);
    expect(sim.buildings[0].vulnerability).toBe(.2);
    const before = sim.buildings[0].hp;
    sim.troops[0].cooldown = 100;
    sim.troops[1].cooldown = 0; step(sim);
    expect(before - sim.buildings[0].hp).toBeCloseTo(sim.troops[1].damage * 1.2);
  });
  it('burning ground continues damaging buildings after the caster dies', () => {
    const sim = arena('volcano_cannoneer'); sim.troops[0].target = 0; advance(sim, 5);
    expect(sim.warriorEffects.some((e) => e.kind === 'burn')).toBe(true);
    sim.troops[0].dead = true; sim.troops[0].hp = 0;
    const before = sim.buildings[0].hp; step(sim);
    expect(sim.buildings[0].hp).toBeLessThan(before);
  });
  it('a bomb explodes once, damages nearby buildings and consumes its carrier', () => {
    const sim = arena('bomb_carrier'); step(sim);
    expect(sim.troops[0].dead).toBe(true);
    expect(sim.buildings[0].maxHp - sim.buildings[0].hp).toBeCloseTo(sim.troops[0].damage * 7);
    expect(sim.buildings[1].hp).toBeLessThan(sim.buildings[1].maxHp);
    expect(sim.used.bomb_carrier).toBe(1);
  });
  it('artillery fires while stationary from outside a mortar’s range', () => {
    const sim = arena('siege_bombardier');
    sim.troops[0].x = 1; sim.troops[0].y = 10;
    const x = sim.troops[0].x; step(sim);
    expect(sim.troops[0].attacking).toBe(true);
    expect(sim.troops[0].x).toBe(x);
    expect(sim.projectiles).toHaveLength(1);
    expect(data.troops.siege_bombardier.range).toBeGreaterThan(data.buildings.pinecone_catapult.combat!.range);
  });
  it('rage increases damage below half health', () => {
    const sim = arena('bear_warrior'); sim.troops[0].hp = sim.troops[0].maxHp * .4; step(sim);
    expect(sim.buildings[0].maxHp - sim.buildings[0].hp).toBeCloseTo(sim.troops[0].damage * 1.75);
  });
  it('Night Blade doubles damage against a building covered by smoke', () => {
    const sim = arena('night_blade');
    deploy(sim, { troop: 'smoke_bomb', x: 11, y: 11, tick: 0 }); step(sim);
    expect(sim.buildings[0].maxHp - sim.buildings[0].hp).toBeCloseTo(sim.troops[0].damage * 2);
  });
  it('Ram Crew multiplies wall damage and Boar Rider breaks only its first wall', () => {
    const ram = arena('ram_crew'); ram.troops[0].x = 8.5; ram.troops[0].y = 12.5; ram.troops[0].target = 3; step(ram);
    expect(ram.buildings[3].maxHp - ram.buildings[3].hp).toBeCloseTo(ram.troops[0].damage * 4);
    const boar = arena('boar_rider'); boar.troops[0].x = 8.5; boar.troops[0].y = 12.5; boar.troops[0].target = 3; step(boar);
    expect(boar.buildings[3].destroyed).toBe(true); expect(boar.troops[0].charges).toBe(0);
  });
});

describe('control, movement and stealth', () => {
  it('Gearbreakers get two long jams and share recovery immunity', () => {
    const sim = arena('gearbreaker', 'gearbreaker');
    sim.buildings[0].combat = { ...data.buildings.acorn_cannon.combat!, damage: 1 };
    step(sim);
    expect(sim.buildings[0].disabledUntil).toBe(90);
    expect(sim.buildings[0].immuneUntil).toBe(190);
    expect(sim.troops.map((t) => t.charges).sort()).toEqual([1, 2]);
  });
  it('Blackout jams adjacent defenses once, and cannot extend another jam', () => {
    const sim = arena('ghost_engineer', 'ghost_engineer');
    for (const b of sim.buildings.slice(0, 2)) b.combat = { ...data.buildings.acorn_cannon.combat!, damage: 1 };
    step(sim);
    expect(sim.buildings.slice(0, 2).every((b) => b.disabledUntil === 40 && b.immuneUntil === 140)).toBe(true);
    expect(sim.troops.map((t) => t.charges).sort()).toEqual([0, 1]);
  });
  it('a planted charge detonates after five seconds even if the planter falls', () => {
    const sim = arena('fuse_master'); step(sim);
    const hp = sim.buildings[0].hp;
    expect(sim.warriorEffects[0].kind).toBe('charge');
    sim.troops[0].dead = true;
    advance(sim, 49); expect(sim.buildings[0].hp).toBe(hp);
    step(sim); expect(hp - sim.buildings[0].hp).toBeCloseTo(sim.troops[0].damage * 6);
    expect(sim.ended).toBe(true);
    expect(sim.endReason).toBe('no_troops');
  });
  it('disarms traps before they trigger and opens nearby walls', () => {
    const sim = arena('trap_breaker', 'phantom_gate'); step(sim);
    expect(sim.buildings[4].destroyed).toBe(true);
    expect(sim.buildings[4].hidden).toBe(false);
    expect(sim.buildings[3].destroyed).toBe(true);
    expect(sim.events.some((e) => e.k === 'trap')).toBe(false);
  });
  it('Mole King stuns on its first defense hit', () => {
    const sim = arena('mole_king'); sim.buildings[0].combat = { ...data.buildings.acorn_cannon.combat!, damage: 1 }; step(sim);
    expect(sim.buildings[0].disabledUntil).toBe(20);
    expect(sim.troops[0].charges).toBe(0);
  });
  it('stealth ends on attack and Eclipse Ninja cannot trigger or take trap damage', () => {
    const sim = arena('eclipse_ninja');
    expect(isHidden(sim, sim.troops[0])).toBe(true);
    sim.buildings[4].combat = { ...data.buildings.thorn_snare.combat!, damage: 10000 };
    sim.troops[0].y = 11.5; step(sim);
    expect(sim.buildings[4].destroyed).toBe(false);
    expect(sim.troops[0].hp).toBe(sim.troops[0].maxHp);
    advance(sim, 20); expect(isHidden(sim, sim.troops[0])).toBe(false);
  });
  it('a decoy draws fire, expires after four seconds, and does not use extra inventory', () => {
    const sim = arena('mirage_twin');
    sim.buildings[0].combat = { ...data.buildings.acorn_cannon.combat!, damage: 1 };
    sim.buildings[0].targetTroop = 1; step(sim);
    expect(sim.projectiles.some((p) => p.targetTroop === 1)).toBe(true);
    advance(sim, 40); expect(sim.troops[1].dead).toBe(true);
    expect(sim.used.mirage_twin).toBe(1);
  });
  it('Void Walker teleports toward its target with a cooldown', () => {
    const sim = arena('void_walker'); sim.troops[0].x = 1; sim.troops[0].target = 0;
    step(sim); expect(sim.troops[0].x).toBeGreaterThan(6);
    expect(sim.troops[0].abilityReady).toBe(60);
  });
});

describe('support and companions', () => {
  it('heals allies over time, without healing dead warriors', () => {
    const sim = arena('herbalist', 'hedgehog_roller');
    sim.troops[1].hp = 10; step(sim);
    expect(sim.troops[1].hp).toBeCloseTo(10 + sim.troops[1].maxHp * .025);
    sim.troops[1].dead = true; sim.troops[1].hp = 0; advance(sim, 10);
    expect(sim.troops[1].hp).toBe(0);
  });
  it('haste and resistance auras do not stack', () => {
    const sim = arena('drum_monk', 'drum_monk', 'iron_monk', 'iron_monk', 'hedgehog_roller');
    const target = sim.troops[4];
    expect(auraStrength(sim, target, 'haste')).toBe(.25);
    expect(auraStrength(sim, target, 'resist')).toBe(.15);
    step(sim); advance(sim, 7);
    expect(target.hits).toBe(2); // base interval is 8 ticks, reduced by haste
  });
  it('Bell Warden takes targeting priority over a closer warrior', () => {
    const sim = arena('hedgehog_roller', 'bell_warden');
    sim.troops[1].x = 8;
    sim.buildings[0].combat = { ...data.buildings.acorn_cannon.combat!, damage: 1 };
    sim.buildings[0].targetTroop = 0; step(sim);
    expect(sim.buildings[0].targetTroop).toBe(1);
  });
  it('Mountain Shield protects allies behind it, rather than those in front', () => {
    const sim = arena('mountain_shield', 'hedgehog_roller');
    const ally = sim.troops[1]; const origin = { x: 15, y: 10.5 };
    ally.x = 8;
    expect(auraStrength(sim, ally, 'splash', origin)).toBe(.5);
    ally.x = 10;
    expect(auraStrength(sim, ally, 'splash', origin)).toBe(0);
  });
  it('moving mist limits defense targeting without using a Smoke Bomb', () => {
    const sim = arena('mist_weaver', 'hedgehog_roller');
    sim.troops.forEach((t) => { t.x = 6.5; });
    sim.buildings[0].combat = { ...data.buildings.acorn_cannon.combat!, damage: 1 };
    step(sim); expect(sim.buildings[0].targetTroop).toBe(-1);
    expect(sim.abilitiesUsed.smoke_bomb).toBeUndefined();
  });
  it('resurrects each fallen warrior at most once and spends one charge', () => {
    const sim = arena('spirit_caller', 'hedgehog_roller');
    const ally = sim.troops[1]; ally.hp = 0; ally.dead = true;
    step(sim); expect(ally.dead).toBe(false); expect(ally.hp).toBeCloseTo(ally.maxHp * .35);
    expect(sim.troops[0].charges).toBe(0);
    ally.hp = 0; ally.dead = true; advance(sim, 10); expect(ally.dead).toBe(true);
  });
  it('Sage heals once and grants an expiring shield with refresh immunity', () => {
    const sim = arena('sage_of_clouds', 'sage_of_clouds', 'hedgehog_roller');
    const ally = sim.troops[2]; ally.hp = 10; step(sim);
    expect(ally.hp).toBeCloseTo(10 + ally.maxHp * .25);
    expect(ally.shieldUntil).toBe(40); expect(ally.shieldReady).toBe(100);
    expect(sim.troops[0].charges).toBe(0);
    expect(sim.troops[1].charges).toBe(1);
  });
  it('a Sage shield absorbs one hit and the next projectile deals normal damage', () => {
    const sim = arena('sage_of_clouds', 'hedgehog_roller'); const ally = sim.troops[1]; ally.hp = 20; step(sim);
    const shot = { id: 999, kind: 'acorn', fromX: 15, fromY: 10, toX: ally.x, toY: ally.y, total: 1, left: 1, damage: 10, splash: 0, targetTroop: 1, targetBuilding: -1, hitsAir: false, hitsGround: true, arc: false };
    const hp = ally.hp; sim.projectiles.push({ ...shot }); step(sim);
    expect(ally.hp).toBe(hp); expect(ally.shieldUntil).toBe(0);
    sim.projectiles.push({ ...shot, id: 1000 }); step(sim); expect(ally.hp).toBe(hp - 10);
  });
  it.each(['hound_handler', 'tiger_lord'])('%s shares its stat budget with two nonrecursive companions', (type) => {
    const sim = arena(type);
    expect(sim.troops).toHaveLength(3);
    expect(sim.troops.reduce((sum, t) => sum + t.maxHp, 0)).toBeCloseTo(data.troops[type].levels[0].hp);
    expect(sim.troops.reduce((sum, t) => sum + t.damage, 0)).toBeCloseTo(data.troops[type].levels[0].damage);
    expect(sim.used[type]).toBe(1); expect(sim.remaining[type]).toBe(0);
    advance(sim, 50); expect(sim.troops).toHaveLength(3);
  });
});
