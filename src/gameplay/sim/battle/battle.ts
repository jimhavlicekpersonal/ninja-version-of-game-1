/**
 * Fixed-step battle simulation: 10 ticks per second, seeded RNG, no
 * floating-point functions beyond + - * / and sqrt, so the same setup and
 * deployments replay identically on every device.
 */
import { buildingDef, levelDef, troopDef, troopLevel } from '../data';
import { createRng, next, type Rng } from '../rng';
import { RESOURCE_KINDS, type BuildingEffect, type CombatDef, type Cost, type GameData, type ResourceKind } from '../types';
import { BLOCKED, HEDGE, distToRect, findPath, type PathGrid, type Rect } from './pathfind';
import type { BattleResult, BattleSetup, Deployment, EndReason } from './types';
import { stepFortifications } from './fortifications';
import { coverLeft, planInfiltration, pointAt, type InfiltrationPlan } from './infiltration';
import { auraStrength, attackDamage, beforeWarriorAction, initializeWarrior, isHidden, resolveWarriorHit, stepWarriorEffects, type WarriorEffect } from './warriors';

export interface SimBuilding {
  id: string;
  type: string;
  level: number;
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  kind: 'hall' | 'defense' | 'hedge' | 'trap' | 'other';
  destroyed: boolean;
  loot: Cost;
  combat: (CombatDef & { damage: number }) | null;
  cooldown: number;
  targetTroop: number;
  /** Traps stay hidden until they go off. */
  hidden: boolean;
  /** Sabotage: silent while tick < disabledUntil; cannot be sabotaged again while tick < immuneUntil. */
  disabledUntil: number;
  immuneUntil: number;
  vulnerableUntil: number;
  vulnerability: number;
  slowedUntil: number;
  fireSlow: number;
  /** Defensive counter rule at this level (null for ordinary buildings). */
  effect: BuildingEffect | null;
  /** Clockwork Repair Crane: repairs left this battle. */
  uses: number;
  /** The jam end tick a crane already shortened, so one jam is repaired once. */
  repairedUntil: number;
}

/** A Smoke Bomb cloud on the map. Active while tick < endsTick. */
export interface SmokeCloud {
  id: number;
  x: number;
  y: number;
  radius: number;
  startTick: number;
  endsTick: number;
}

export interface SimTroop {
  id: number;
  type: string;
  x: number;
  y: number;
  /** Researched level the troop fights at, and its damage per hit at that level. */
  level: number;
  damage: number;
  /** Position at the start of the tick, for smooth rendering between ticks. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  air: boolean;
  target: number;
  path: number[] | null;
  pathPos: number;
  cooldown: number;
  dead: boolean;
  attacking: boolean;
  facing: 1 | -1;
  slowTicks: number;
  /** Ability uses left (Saboteur jams). */
  charges: number;
  hits: number;
  firstHit: boolean;
  revealed: boolean;
  summoned: boolean;
  decoyUntil: number;
  abilityReady: number;
  shieldUntil: number;
  shieldReady: number;
  revived: boolean;
  /** Paper Lantern Line: visible to defenses while tick < litUntil, taking `litBonus` extra damage. */
  litUntil: number;
  litBonus: number;
  /** Kite-Cutter Ballista: a flyer is on the ground while tick < groundedUntil, and can't be grounded again before groundImmuneUntil. */
  groundedUntil: number;
  groundImmuneUntil: number;
  /** Bitter Incense Burner (recomputed every tick): healing cut and heal/haste/resist aura cut on this troop. */
  healCut: number;
  auraCut: number;
}

export interface SimProjectile {
  id: number;
  kind: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  total: number;
  left: number;
  damage: number;
  splash: number;
  targetTroop: number;
  targetBuilding: number;
  hitsAir: boolean;
  hitsGround: boolean;
  /** Fired from height (towers) or from the ground (troops). */
  arc: boolean;
  sourceTroop?: number;
  /** The defense that fired it (for on-hit counter effects). */
  sourceBuilding?: number;
}

export type SimEvent =
  | { k: 'deploy'; troop: number }
  | { k: 'fire'; building: number }
  | { k: 'hit'; x: number; y: number; kind: string; splash: number }
  | { k: 'troopHit'; troop: number }
  | { k: 'buildingHit'; building: number }
  | { k: 'destroyed'; building: number }
  | { k: 'troopDied'; troop: number }
  | { k: 'trap'; building: number }
  | { k: 'smoke'; smoke: number }
  | { k: 'smokeEnd'; smoke: number }
  | { k: 'sabotage'; building: number; troop: number }
  | { k: 'recovered'; building: number }
  /** A warrior ability went off (for on-screen feedback; `what` names the kit rule). */
  | { k: 'ability'; troop: number; what: string }
  /** A defensive counter acted: `building` is the counter, `troop`/`target` what it affected (-1 if none). */
  | { k: 'counter'; building: number; troop: number; target: number; what: string };

export interface BattleSim {
  setup: BattleSetup;
  data: GameData;
  tick: number;
  duration: number;
  rng: Rng;
  buildings: SimBuilding[];
  troops: SimTroop[];
  projectiles: SimProjectile[];
  remaining: Record<string, number>;
  used: Record<string, number>;
  loot: Cost;
  destroyedCount: number;
  countable: number;
  hallDestroyed: boolean;
  ended: boolean;
  endReason: EndReason | null;
  events: SimEvent[];
  grid: PathGrid;
  /** 1 where the attacker may deploy (outside buildings and their margin). */
  deployable: Uint8Array;
  /** Infiltration Points, when the setup uses them (null = deploy anywhere on `deployable`). */
  entry: InfiltrationPlan | null;
  nextProjectile: number;
  /** Active Smoke Bomb clouds. */
  smokes: SmokeCloud[];
  /** Ability charges left this battle, by ability id. */
  charges: Record<string, number>;
  /** Abilities used this battle, by ability id (kept apart from `used`, which counts troops). */
  abilitiesUsed: Record<string, number>;
  warriorEffects: WarriorEffect[];
  supportTroops: number[];
}

/** True when `id` names a tactical ability (battle.json `abilities`) rather than a troop. */
export function isAbility(data: GameData, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(data.battle.abilities, id);
}

/**
 * Smoke Bomb charges for an army: base + 1 per `housingPerCharge` housing, capped.
 * Derived from the army alone so the server and every replay agree without storing it.
 */
export function smokeCharges(army: Record<string, number>, data: GameData): number {
  const d = data.battle.abilities.smoke_bomb;
  let housing = 0;
  for (const [t, n] of Object.entries(army)) housing += (data.troops[t]?.housing ?? 0) * Math.max(0, n);
  if (housing <= 0) return 0;
  return Math.min(d.maxCharges, d.baseCharges + Math.floor(housing / d.housingPerCharge));
}

/** A defense a Saboteur may jam right now. */
export function sabotageable(sim: BattleSim, b: SimBuilding): boolean {
  return !b.destroyed && b.kind === 'defense' && b.combat !== null && sim.tick >= b.immuneUntil;
}

/** A flyer that is in the air right now (a grounded flyer counts as on the ground). */
export function airborne(sim: BattleSim, t: SimTroop): boolean {
  return t.air && !(t.groundedUntil > sim.tick);
}

/** Whether a point is inside an active smoke cloud. */
export function inSmoke(sim: BattleSim, x: number, y: number): boolean {
  for (const c of sim.smokes) {
    if (sim.tick >= c.endsTick) continue;
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy <= c.radius * c.radius) return true;
  }
  return false;
}

const rect = (b: SimBuilding): Rect => ({ x: b.x, y: b.y, w: b.size, h: b.size });
const center = (b: SimBuilding) => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 });

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createBattle(setup: BattleSetup, data: GameData): BattleSim {
  const size = data.economy.mapSize;
  const buildings: SimBuilding[] = setup.base.buildings.map((bb) => {
    const def = buildingDef(data, bb.type);
    const ld = levelDef(data, bb.type, bb.level) ?? def.levels[0];
    const kind: SimBuilding['kind'] =
      def.category === 'hall' ? 'hall' : def.category === 'defense' ? 'defense' : def.category === 'hedge' ? 'hedge' : def.category === 'trap' ? 'trap' : 'other';
    // Shadow Trials scale defenses (and walls) beyond the normal level caps.
    const mult = kind === 'defense' || kind === 'trap' ? setup.base.power ?? 1 : kind === 'hedge' ? setup.base.wallPower ?? 1 : 1;
    const hp = mult === 1 ? ld.hp : ld.hp * mult;
    const effect: BuildingEffect | null = def.effect ? { ...def.effect, ...(ld.effect ?? {}) } : null;
    return {
      id: bb.id,
      type: bb.type,
      level: bb.level,
      x: bb.x,
      y: bb.y,
      size: def.size,
      hp,
      maxHp: hp,
      kind,
      destroyed: false,
      loot: { ...(bb.loot ?? {}) },
      combat: def.combat && !bb.upgrading ? { ...def.combat, damage: kind === 'hedge' || mult === 1 ? ld.damage ?? 0 : (ld.damage ?? 0) * mult } : null,
      cooldown: 0,
      targetTroop: -1,
      hidden: kind === 'trap',
      disabledUntil: 0,
      immuneUntil: 0,
      vulnerableUntil: 0, vulnerability: 0, slowedUntil: 0, fireSlow: 0,
      effect, uses: effect?.uses ?? 0, repairedUntil: -1,
    };
  });
  const cells = new Uint8Array(size * size);
  buildings.forEach((b) => {
    if (b.kind === 'trap') return;
    for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) cells[y * size + x] = b.kind === 'hedge' ? HEDGE : BLOCKED;
  });
  const m = data.battle.deployMarginTiles;
  const deployable = new Uint8Array(size * size).fill(1);
  for (const b of buildings) {
    if (b.kind === 'trap') continue;
    for (let y = Math.max(0, b.y - m); y < Math.min(size, b.y + b.size + m); y++) {
      for (let x = Math.max(0, b.x - m); x < Math.min(size, b.x + b.size + m); x++) deployable[y * size + x] = 0;
    }
  }
  return {
    setup,
    data,
    entry: planInfiltration(setup, deployable, size, data),
    tick: 0,
    duration: data.battle.durationSeconds * data.battle.ticksPerSecond,
    rng: createRng(setup.seed),
    buildings,
    troops: [],
    projectiles: [],
    remaining: { ...setup.army },
    used: {},
    loot: {},
    destroyedCount: 0,
    countable: buildings.filter((b) => b.kind !== 'hedge' && b.kind !== 'trap').length,
    hallDestroyed: false,
    ended: false,
    endReason: null,
    events: [],
    grid: { size, cells },
    deployable,
    nextProjectile: 1,
    smokes: [],
    charges: { smoke_bomb: smokeCharges(setup.army, data) },
    abilitiesUsed: {},
    warriorEffects: [],
    supportTroops: [],
  };
}

export function canDeploy(sim: BattleSim, troop: string, x: number, y: number): boolean {
  if (sim.ended) return false;
  const n = sim.grid.size;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= n || ty >= n) return false;
  // Abilities can be thrown anywhere on the map while charges last.
  if (isAbility(sim.data, troop)) return (sim.charges[troop] ?? 0) > 0;
  if ((sim.remaining[troop] ?? 0) <= 0) return false;
  if (sim.deployable[ty * n + tx] !== 1) return false;
  if (!sim.entry) return true;
  // Infiltration Points: only inside a point, and only while that path still has cover.
  const p = pointAt(sim.entry, tx, ty);
  return p >= 0 && coverLeft(sim.entry, p) >= (sim.data.troops[troop]?.housing ?? 0);
}

/** Why a troop can't be placed at a tile: 'zone' (not a deploy spot) or 'full' (that point's cover is used up). Null if it can. */
export function deployBlock(sim: BattleSim, troop: string, x: number, y: number): 'zone' | 'full' | null {
  if (canDeploy(sim, troop, x, y)) return null;
  if (!sim.entry || isAbility(sim.data, troop)) return 'zone';
  const n = sim.grid.size;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= n || ty >= n || sim.deployable[ty * n + tx] !== 1) return 'zone';
  return pointAt(sim.entry, tx, ty) >= 0 ? 'full' : 'zone';
}

function useAbility(sim: BattleSim, d: Deployment): boolean {
  if (d.troop !== 'smoke_bomb') return false;
  const def = sim.data.battle.abilities.smoke_bomb;
  // Clouds never stack: an overlapping cloud only refreshes coverage, it doesn't deepen the effect.
  const cloud: SmokeCloud = {
    id: (sim.abilitiesUsed.smoke_bomb ?? 0) + 1,
    x: Math.floor(d.x) + 0.5,
    y: Math.floor(d.y) + 0.5,
    radius: def.radius,
    startTick: sim.tick,
    endsTick: sim.tick + def.durationTicks,
  };
  sim.smokes.push(cloud);
  sim.charges.smoke_bomb -= 1;
  sim.abilitiesUsed.smoke_bomb = (sim.abilitiesUsed.smoke_bomb ?? 0) + 1;
  sim.events.push({ k: 'smoke', smoke: cloud.id });
  return true;
}

/** Put a troop on the field, or throw an ability. Returns false if not allowed. */
export function deploy(sim: BattleSim, d: Deployment): boolean {
  if (!canDeploy(sim, d.troop, d.x, d.y)) return false;
  if (isAbility(sim.data, d.troop)) return useAbility(sim, d);
  const def = troopDef(sim.data, d.troop);
  const stats = troopLevel(sim.data, d.troop, sim.setup.levels?.[d.troop] ?? 1);
  const s = sim.data.battle.deploySpread;
  const x = Math.floor(d.x) + 0.5 + (next(sim.rng) * 2 - 1) * s;
  const y = Math.floor(d.y) + 0.5 + (next(sim.rng) * 2 - 1) * s;
  const t: SimTroop = {
    id: sim.troops.length,
    type: d.troop,
    x,
    y,
    px: x,
    py: y,
    level: stats.level,
    damage: stats.damage,
    hp: stats.hp,
    maxHp: stats.hp,
    air: def.air,
    target: -1,
    path: null,
    pathPos: 0,
    cooldown: 0,
    dead: false,
    attacking: false,
    facing: 1,
    slowTicks: 0,
    charges: def.ability ? def.abilityCharges ?? 1 : 0,
    hits: 0, firstHit: true, revealed: false, summoned: false, decoyUntil: 0,
    abilityReady: 0, shieldUntil: 0, shieldReady: 0, revived: false,
    litUntil: 0, litBonus: 0, groundedUntil: 0, groundImmuneUntil: 0, healCut: 0, auraCut: 0,
  };
  sim.troops.push(t);
  if (sim.entry) sim.entry.points[pointAt(sim.entry, d.x, d.y)].used += def.housing;
  sim.remaining[d.troop] -= 1;
  sim.used[d.troop] = (sim.used[d.troop] ?? 0) + 1;
  sim.events.push({ k: 'deploy', troop: t.id });
  initializeWarrior(sim, t);
  return true;
}

function damageBuilding(sim: BattleSim, bi: number, amount: number): void {
  const b = sim.buildings[bi];
  if (b.destroyed) return;
  b.hp -= amount * (sim.tick < b.vulnerableUntil ? 1 + b.vulnerability : 1);
  sim.events.push({ k: 'buildingHit', building: bi });
  if (b.hp > 0) return;
  b.hp = 0;
  b.destroyed = true;
  for (const [k, v] of Object.entries(b.loot) as [ResourceKind, number][]) sim.loot[k] = (sim.loot[k] ?? 0) + v;
  if (b.kind !== 'hedge' && b.kind !== 'trap') sim.destroyedCount++;
  if (b.kind === 'hall') sim.hallDestroyed = true;
  const n = sim.grid.size;
  if (b.kind !== 'trap') for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) sim.grid.cells[y * n + x] = 0;
  sim.events.push({ k: 'destroyed', building: bi });
}

function damageTroop(sim: BattleSim, ti: number, amount: number, splash = false, origin?: { x: number; y: number }): void {
  const t = sim.troops[ti];
  if (t.dead) return;
  if (t.shieldUntil > sim.tick) {
    t.shieldUntil = 0;
    amount = Math.max(0, amount - t.maxHp * sim.data.battle.warriorRules.shieldMaximumDamage);
  }
  amount *= 1 - auraStrength(sim, t, 'resist');
  if (t.litUntil > sim.tick) amount *= 1 + t.litBonus;
  if (splash) amount *= 1 - auraStrength(sim, t, 'splash', origin);
  t.hp -= amount;
  sim.events.push({ k: 'troopHit', troop: ti });
  if (t.hp <= 0) {
    t.hp = 0;
    t.dead = true;
    sim.events.push({ k: 'troopDied', troop: ti });
  }
}

const warriorActions = { damageBuilding, damageTroop, moveToward };

/** Nearest standing building this troop wants, by its preference. */
function chooseTarget(sim: BattleSim, t: SimTroop): number {
  const def = troopDef(sim.data, t.type);
  const pick = (filter: (b: SimBuilding) => boolean) => {
    let best = -1;
    let bestD = Infinity;
    sim.buildings.forEach((b, i) => {
      if (b.destroyed || b.kind === 'trap' || (b.kind === 'hedge' && def.prefers !== 'walls' && def.prefers !== 'breach') || !filter(b)) return;
      const d = distToRect(t.x, t.y, rect(b));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  if (def.prefers === 'storage') {
    const storage = pick((b) => buildingDef(sim.data, b.type).category === 'storage');
    if (storage >= 0) return storage;
  }
  if (def.prefers === 'walls') {
    const wall = pick((b) => b.kind === 'hedge');
    if (wall >= 0) return wall;
  }
  if (def.prefers === 'breach') {
    const breach = pick((b) => b.kind === 'hedge' || b.kind === 'defense');
    if (breach >= 0) return breach;
  }
  if (def.prefers === 'defense') {
    if ((def.ability === 'sabotage' || def.kit?.jamTicks) && t.charges > 0) {
      const s = pick((b) => sabotageable(sim, b));
      if (s >= 0) return s;
    }
    const d = pick((b) => b.kind === 'defense');
    if (d >= 0) return d;
  }
  return pick(() => true);
}

function stepTroop(sim: BattleSim, ti: number): void {
  const t = sim.troops[ti];
  if (t.dead) return;
  t.px = t.x;
  t.py = t.y;
  const def = troopDef(sim.data, t.type);
  if (t.cooldown > 0) t.cooldown -= 1 + auraStrength(sim, t, 'haste');
  if (t.decoyUntil > 0) { t.attacking = false; return; }
  if (beforeWarriorAction(sim, t, warriorActions)) return;
  if (t.target < 0 || sim.buildings[t.target].destroyed) {
    t.target = chooseTarget(sim, t);
    t.path = null;
    t.attacking = false;
    t.firstHit = true;
    if (t.target < 0) return;
  }
  const saboteur = (def.ability === 'sabotage' || Boolean(def.kit?.jamTicks)) && t.charges > 0;
  if (saboteur && !sabotageable(sim, sim.buildings[t.target])) {
    // Someone else jammed it (or it is immune): head for another working defense if there is one.
    const nt = chooseTarget(sim, t);
    if (nt >= 0 && nt !== t.target && sabotageable(sim, sim.buildings[nt])) {
      t.target = nt;
      t.path = null;
      t.attacking = false;
    }
  }
  const target = sim.buildings[t.target];
  const r = rect(target);
  if (saboteur && sabotageable(sim, target) && distToRect(t.x, t.y, r) <= sim.data.battle.sabotage.rangeTiles) {
    resolveWarriorHit(sim, t, t.target, 0, warriorActions);
    return;
  }
  if (distToRect(t.x, t.y, r) <= def.range) {
    t.attacking = true;
    const c = center(target);
    t.facing = c.x - c.y >= t.x - t.y ? 1 : -1;
    if (t.cooldown <= 0) {
      t.cooldown = def.attackIntervalTicks;
      const damage = attackDamage(sim, t, target);
      if (def.projectile) {
        const d = dist(t.x, t.y, c.x, c.y);
        const travel = Math.max(1, Math.ceil(d / (def.projectileSpeed ?? 1)));
        sim.projectiles.push({
          id: sim.nextProjectile++, kind: def.projectile, fromX: t.x, fromY: t.y, toX: c.x, toY: c.y, total: travel, left: travel,
          damage, splash: def.splashRadius ?? 0, targetTroop: -1, targetBuilding: t.target, hitsAir: false, hitsGround: false, arc: true, sourceTroop: ti,
        });
      } else {
        resolveWarriorHit(sim, t, t.target, damage, warriorActions);
      }
    }
    return;
  }
  t.attacking = false;
  // A tangled flyer can still strike what it reaches, but can't fly anywhere.
  if (t.air && t.groundedUntil > sim.tick) return;
  const speed = def.speed * (t.slowTicks > 0 ? 0.5 : 1) * (1 + auraStrength(sim, t, 'haste')) * (t.firstHit ? def.kit?.dashSpeed ?? 1 : 1);
  if (t.slowTicks > 0) t.slowTicks--;
  if (t.air) {
    const c = center(target);
    moveToward(t, c.x, c.y, speed);
    return;
  }
  const n = sim.grid.size;
  if (!t.path || t.pathPos >= t.path.length) {
    t.path = findPath(sim.grid, t.x, t.y, r, def.range, sim.data.battle.hedgePathCost, def.ignoresHedges);
    t.pathPos = 0;
    if (!t.path) {
      // Fully walled in: walk straight at it.
      const c = center(target);
      moveToward(t, c.x, c.y, speed);
      return;
    }
  }
  if (t.path.length === 0 || t.pathPos >= t.path.length) {
    // Already on a tile next to the target: close the last bit directly.
    const nx = Math.max(r.x, Math.min(r.x + r.w, t.x));
    const ny = Math.max(r.y, Math.min(r.y + r.h, t.y));
    moveToward(t, nx, ny, speed);
    return;
  }
  const wp = t.path[t.pathPos];
  const cell = sim.grid.cells[wp];
  if (cell === HEDGE && !def.ignoresHedges) {
    // Break through the hedge in the way.
    const hx = wp % n;
    const hy = (wp - hx) / n;
    const hi = sim.buildings.findIndex((b) => !b.destroyed && b.kind === 'hedge' && b.x === hx && b.y === hy);
    if (hi >= 0) {
      t.attacking = true;
      if (t.cooldown <= 0) {
        t.cooldown = def.attackIntervalTicks;
        resolveWarriorHit(sim, t, hi, attackDamage(sim, t, sim.buildings[hi]), warriorActions);
      }
      return;
    }
  }
  if (cell === BLOCKED) {
    t.path = null;
    return;
  }
  const wx = (wp % n) + 0.5;
  const wy = Math.floor(wp / n) + 0.5;
  if (moveToward(t, wx, wy, speed)) t.pathPos++;
}

/** Move toward a point; returns true on arrival. */
function moveToward(t: SimTroop, x: number, y: number, speed: number): boolean {
  const d = dist(t.x, t.y, x, y);
  if (d > 0.0001) t.facing = x - y >= t.x - t.y ? 1 : -1;
  if (d <= speed) {
    t.x = x;
    t.y = y;
    return true;
  }
  t.x += ((x - t.x) / d) * speed;
  t.y += ((y - t.y) / d) * speed;
  return false;
}

function stepDefense(sim: BattleSim, bi: number): void {
  const b = sim.buildings[bi];
  const c = b.combat;
  if (b.destroyed || !c || b.kind === 'trap') return;
  if (b.disabledUntil > 0) {
    if (sim.tick < b.disabledUntil) {
      b.targetTroop = -1;
      return;
    }
    if (sim.tick === b.disabledUntil) sim.events.push({ k: 'recovered', building: bi });
  }
  if (b.cooldown > 0) b.cooldown--;
  const cx = b.x + b.size / 2;
  const cy = b.y + b.size / 2;
  const smoke = sim.data.battle.abilities.smoke_bomb;
  const smokedRange = Math.max(smoke.minTargetRange, c.range * smoke.rangeFactor);
  const ok = (t: SimTroop) => {
    if (t.dead || isHidden(sim, t)) return false;
    if (airborne(sim, t) ? c.targets === 'ground' : c.targets === 'air') return false;
    const d = dist(cx, cy, t.x, t.y);
    const veiled = t.litUntil <= sim.tick && auraStrength(sim, t, 'veil') > 0;
    const range = (smoke && inSmoke(sim, t.x, t.y)) || veiled ? smokedRange : c.range;
    return d <= range && d >= (c.minRange ?? 0);
  };
  const taunt = sim.supportTroops.find((index) => {
    const t = sim.troops[index];
    return sim.data.troops[t.type].kit?.aura === 'taunt' && ok(t) && dist(cx, cy, t.x, t.y) <= (sim.data.troops[t.type].kit?.radius ?? 0);
  }) ?? -1;
  if (taunt >= 0) b.targetTroop = taunt;
  // Longbow Yagura: re-picks each shot, preferring warriors that attack from long range.
  const longReach = taunt < 0 && b.effect?.kind === 'counter_artillery' && b.cooldown <= 0 ? b.effect.prefersBeyond ?? 0 : 0;
  if (longReach > 0 || b.targetTroop < 0 || !ok(sim.troops[b.targetTroop])) {
    b.targetTroop = -1;
    let bestD = Infinity;
    let bestLong = false;
    sim.troops.forEach((t, i) => {
      if (!ok(t)) return;
      const d = dist(cx, cy, t.x, t.y);
      const long = longReach > 0 && sim.data.troops[t.type].range >= longReach;
      if ((long && !bestLong) || (long === bestLong && d < bestD)) {
        bestD = d;
        bestLong = long;
        b.targetTroop = i;
      }
    });
  }
  if (b.targetTroop < 0 || b.cooldown > 0) return;
  const t = sim.troops[b.targetTroop];
  b.cooldown = c.fireIntervalTicks * (sim.tick < b.slowedUntil ? 1 + b.fireSlow : 1);
  const d = dist(cx, cy, t.x, t.y);
  const travel = Math.max(1, Math.ceil(d / c.projectileSpeed));
  let toX = t.x;
  let toY = t.y;
  if (c.splashRadius) {
    const s = sim.data.battle.catapultSpread;
    toX += (next(sim.rng) * 2 - 1) * s;
    toY += (next(sim.rng) * 2 - 1) * s;
  }
  sim.projectiles.push({
    id: sim.nextProjectile++, kind: c.projectile, fromX: cx, fromY: cy, toX, toY, total: travel, left: travel,
    damage: c.damage, splash: c.splashRadius ?? 0, targetTroop: c.splashRadius ? -1 : b.targetTroop, targetBuilding: -1,
    hitsAir: c.targets !== 'ground', hitsGround: c.targets !== 'air', arc: Boolean(c.splashRadius), sourceBuilding: bi,
  });
  sim.events.push({ k: 'fire', building: bi });
}

function stepTraps(sim: BattleSim): void {
  sim.buildings.forEach((b, bi) => {
    if (b.kind !== 'trap' || b.destroyed) return;
    const c = b.combat;
    if (!c) return;
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const vulnerable = (t: SimTroop) => !t.dead && !t.air && !sim.data.troops[t.type].kit?.trapImmune;
    const triggered = sim.troops.some((t) => vulnerable(t) && dist(cx, cy, t.x, t.y) <= c.range);
    if (!triggered) return;
    b.hidden = false;
    b.destroyed = true;
    sim.events.push({ k: 'trap', building: bi });
    const radius = c.splashRadius ?? c.range;
    sim.troops.forEach((t, ti) => {
      if (!vulnerable(t) || dist(cx, cy, t.x, t.y) > radius) return;
      if (c.projectile === 'sap') t.slowTicks = 40;
      if (c.damage > 0) damageTroop(sim, ti, c.damage, true, { x: cx, y: cy });
    });
    sim.events.push({ k: 'hit', x: cx, y: cy, kind: c.projectile, splash: radius });
  });
}

function stepProjectiles(sim: BattleSim): void {
  const keep: SimProjectile[] = [];
  for (const p of sim.projectiles) {
    p.left--;
    if (p.left > 0) {
      keep.push(p);
      continue;
    }
    if (p.targetBuilding >= 0) {
      if (p.sourceTroop !== undefined) resolveWarriorHit(sim, sim.troops[p.sourceTroop], p.targetBuilding, p.damage, warriorActions);
      else damageBuilding(sim, p.targetBuilding, p.damage);
      sim.events.push({ k: 'hit', x: p.toX, y: p.toY, kind: p.kind, splash: 0 });
    } else if (p.splash > 0) {
      sim.troops.forEach((t, ti) => {
        if (t.dead || (airborne(sim, t) ? !p.hitsAir : !p.hitsGround)) return;
        if (dist(p.toX, p.toY, t.x, t.y) <= p.splash) damageTroop(sim, ti, p.damage, true, { x: p.fromX, y: p.fromY });
      });
      sim.events.push({ k: 'hit', x: p.toX, y: p.toY, kind: p.kind, splash: p.splash });
    } else if (p.targetTroop >= 0) {
      const t = sim.troops[p.targetTroop];
      if (!t.dead) {
        damageTroop(sim, p.targetTroop, p.damage);
        if (p.sourceBuilding !== undefined) groundFlyer(sim, p.sourceBuilding, p.targetTroop);
        sim.events.push({ k: 'hit', x: t.x, y: t.y, kind: p.kind, splash: 0 });
      }
    }
  }
  sim.projectiles = keep;
}

/** Kite-Cutter Ballista hit: tangle a flyer (once it has been free for the immunity window). */
function groundFlyer(sim: BattleSim, bi: number, ti: number): void {
  const e = sim.buildings[bi].effect;
  const t = sim.troops[ti];
  if (e?.kind !== 'ground_flyers' || t.dead || !t.air || t.groundedUntil > sim.tick || sim.tick < t.groundImmuneUntil) return;
  const tps = sim.data.battle.ticksPerSecond;
  t.groundedUntil = sim.tick + (e.seconds ?? 0) * tps;
  t.groundImmuneUntil = t.groundedUntil + (e.immuneSeconds ?? 0) * tps;
  t.path = null;
  sim.events.push({ k: 'counter', building: bi, troop: ti, target: -1, what: 'grounded' });
}

/** Advance one tick, applying `deployments` (all for this tick) first. */
export function step(sim: BattleSim, deployments: Deployment[] = []): void {
  if (sim.ended) return;
  sim.events = [];
  for (const d of deployments) deploy(sim, d);
  stepFortifications(sim);
  stepWarriorEffects(sim, warriorActions);
  for (let i = 0; i < sim.troops.length; i++) stepTroop(sim, i);
  stepTraps(sim);
  for (let i = 0; i < sim.buildings.length; i++) stepDefense(sim, i);
  stepProjectiles(sim);
  sim.tick++;
  if (sim.smokes.length) {
    const left: SmokeCloud[] = [];
    for (const c of sim.smokes) {
      if (c.endsTick > sim.tick) left.push(c);
      else sim.events.push({ k: 'smokeEnd', smoke: c.id });
    }
    sim.smokes = left;
  }
  if (sim.destroyedCount >= sim.countable) end(sim, 'destroyed');
  else if (sim.tick >= sim.duration) end(sim, 'time');
  else if (
    sim.troops.length > 0 &&
    sim.troops.every((t) => t.dead) &&
    Object.values(sim.remaining).every((v) => v <= 0) &&
    sim.projectiles.length === 0 &&
    sim.warriorEffects.length === 0
  ) {
    end(sim, 'no_troops');
  }
}

export function end(sim: BattleSim, reason: EndReason): void {
  if (sim.ended) return;
  sim.ended = true;
  sim.endReason = reason;
}

export function destruction(sim: BattleSim): number {
  return sim.countable ? Math.floor((sim.destroyedCount * 100) / sim.countable) : 100;
}

export function stars(sim: BattleSim): number {
  const d = destruction(sim);
  const t = sim.data.battle.starThresholds;
  return (d >= t.destruction ? 1 : 0) + (sim.hallDestroyed ? 1 : 0) + (d >= t.full ? 1 : 0);
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function stateHash(sim: BattleSim): string {
  const parts: string[] = [String(sim.tick)];
  for (const b of sim.buildings) parts.push(b.hp.toFixed(3));
  for (const t of sim.troops) parts.push(`${t.hp.toFixed(3)},${t.x.toFixed(4)},${t.y.toFixed(4)}`);
  // Fixed resource order: loot keys arrive in whatever order the base's objects had, and a base
  // stored in Postgres (jsonb) comes back with its keys reordered. The hash must not depend on that.
  parts.push(RESOURCE_KINDS.map((k) => `${k}:${sim.loot[k] ?? 0}`).join(','));
  return fnv(parts.join('|'));
}

export function result(sim: BattleSim): BattleResult {
  return {
    stars: stars(sim),
    destruction: destruction(sim),
    hallDestroyed: sim.hallDestroyed,
    loot: { ...sim.loot },
    used: { ...sim.used },
    ticks: sim.tick,
    endReason: sim.endReason ?? 'time',
    hash: stateHash(sim),
  };
}

/** Group deployments by tick for fast lookup. */
export function deploymentsByTick(list: Deployment[]): Map<number, Deployment[]> {
  const m = new Map<number, Deployment[]>();
  for (const d of list) {
    const arr = m.get(d.tick);
    if (arr) arr.push(d);
    else m.set(d.tick, [d]);
  }
  return m;
}

/** Run a whole battle from its seed and deployments (used for replays and to verify results). */
export function runBattle(setup: BattleSetup, deployments: Deployment[], data: GameData, endTick?: number): { sim: BattleSim; result: BattleResult } {
  const sim = createBattle(setup, data);
  const byTick = deploymentsByTick(deployments);
  while (!sim.ended) {
    if (endTick !== undefined && sim.tick >= endTick) {
      end(sim, 'surrender');
      break;
    }
    step(sim, byTick.get(sim.tick));
  }
  return { sim, result: result(sim) };
}
