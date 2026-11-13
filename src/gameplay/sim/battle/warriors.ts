/** Deterministic warrior mechanics. Numbers belong to troops.json/battle.json. */
import type { BattleSim, SimBuilding, SimTroop } from './battle';
import type { WarriorKit } from '../types';
import { next } from '../rng';
import { troopDef } from '../data';
import { BLOCKED, distToRect, findPath, HEDGE } from './pathfind';

export interface WarriorEffect {
  kind: 'poison' | 'burn' | 'charge';
  source: number;
  target: number;
  x: number;
  y: number;
  radius: number;
  damage: number;
  endsTick: number;
}

interface Actions {
  damageBuilding(sim: BattleSim, index: number, amount: number): void;
  damageTroop(sim: BattleSim, index: number, amount: number, splash?: boolean): void;
  moveToward(t: SimTroop, x: number, y: number, speed: number): boolean;
}

const distance = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const shape = (b: SimBuilding) => ({ x: b.x, y: b.y, w: b.size, h: b.size });
const kitOf = (sim: BattleSim, t: SimTroop): WarriorKit => t.summoned ? {} : troopDef(sim.data, t.type).kit ?? {};
const at = (t: SimTroop, b: SimBuilding, radius: number) => !b.destroyed && distToRect(t.x, t.y, shape(b)) <= radius;

/** Identical auras never stack; each ally receives the strongest active source. */
export function auraStrength(sim: BattleSim, target: SimTroop, aura: WarriorKit['aura'], origin?: { x: number; y: number }): number {
  let value = 0;
  for (const index of sim.supportTroops) {
    const source = sim.troops[index];
    if (source.dead) continue;
    const kit = kitOf(sim, source);
    if (kit.aura !== aura) continue;
    if (aura === 'splash' && origin && source.id !== target.id) {
      const behind = (target.x - source.x) * (origin.x - source.x) + (target.y - source.y) * (origin.y - source.y) < 0;
      if (!behind) continue;
    }
    if (aura === 'veil' && sim.tick % (kit.cooldownTicks ?? 1) >= (kit.durationTicks ?? 0)) continue;
    if (aura === 'rally' && !((source.rallyUntil ?? 0) > sim.tick)) continue;
    if (distance(source.x, source.y, target.x, target.y) <= (kit.radius ?? sim.data.battle.warriorRules.defaultAuraRadius)) {
      value = Math.max(value, kit.strength ?? 1);
    }
  }
  // Bitter Incense Burner weakens haste and toughness auras on the warriors it reaches; a tempered base
  // (troopCuts) weakens them everywhere, and the Mountain Shield's splash cover too.
  const cut = sim.temperCut;
  if (value > 0 && (aura === 'haste' || aura === 'resist')) value *= 1 - (cut && cut.aura > target.auraCut ? cut.aura : target.auraCut);
  if (value > 0 && aura === 'splash' && cut && cut.splash > 0) value *= 1 - cut.splash;
  return value;
}

/** Healing cut on a warrior: the Bitter Incense Burner's, or a tempered base's if larger. */
function healCutOf(sim: BattleSim, t: SimTroop): number {
  const c = sim.temperCut?.heal ?? 0;
  return c > t.healCut ? c : t.healCut;
}

export function isHidden(sim: BattleSim, t: SimTroop): boolean {
  return Boolean(kitOf(sim, t).stealth && !t.revealed && !(t.litUntil > sim.tick));
}

function addCompanion(sim: BattleSim, parent: SimTroop, x: number, y: number, share: number, decoyTicks = 0): void {
  // Same asset and stable troop id; companions never consume inventory or summon recursively.
  const companion: SimTroop = {
    ...parent, id: sim.troops.length, x, y, px: x, py: y,
    hp: parent.maxHp * share, maxHp: parent.maxHp * share,
    damage: decoyTicks ? 0 : parent.damage * share, target: -1,
    path: null, pathPos: 0, cooldown: 0, charges: 0, hits: 0,
    summoned: true, revealed: true, firstHit: false,
    decoyUntil: decoyTicks ? sim.tick + decoyTicks : 0,
    abilityReady: 0, shieldUntil: 0, shieldReady: 0, revived: false,
    litUntil: 0, litBonus: 0, groundedUntil: 0, groundImmuneUntil: 0, healCut: 0, auraCut: 0,
  };
  sim.troops.push(companion);
  sim.events.push({ k: 'deploy', troop: companion.id });
}

export function initializeWarrior(sim: BattleSim, t: SimTroop): void {
  const kit = kitOf(sim, t);
  if (kit.aura) sim.supportTroops.push(t.id);
  const offset = sim.data.battle.warriorRules.summonOffset;
  if (kit.summons) {
    const share = kit.summonShare ?? 0;
    // Split the existing stat budget between handler and pets, rather than granting free stats.
    const hp = t.maxHp;
    const damage = t.damage;
    for (let i = 0; i < kit.summons; i++) {
      addCompanion(sim, t, t.x, t.y, share);
    }
    t.maxHp = t.hp = hp * (1 - kit.summons * share);
    t.damage = damage * (1 - kit.summons * share);
    sim.events.push({ k: 'ability', troop: t.id, what: 'summon' });
  }
  if (kit.decoyTicks) {
    addCompanion(sim, t, t.x, t.y, sim.data.battle.warriorRules.decoyHpMultiplier, kit.decoyTicks);
    // A decoy immediately draws compatible, in-range defenses off the real warrior.
    const index = sim.troops.length - 1;
    for (const b of sim.buildings) {
      if (!b.destroyed && b.combat && b.kind === 'defense' && b.combat.targets !== 'air' && distance(b.x + b.size / 2, b.y + b.size / 2, t.x, t.y) <= b.combat.range) b.targetTroop = index;
    }
    t.x = Math.max(0, Math.min(sim.grid.size - offset, t.x + offset));
    sim.events.push({ k: 'ability', troop: t.id, what: 'decoy' });
  }
}

function jam(sim: BattleSim, t: SimTroop, index: number, ticks: number): boolean {
  const b = sim.buildings[index];
  if (b.destroyed || b.kind !== 'defense' || !b.combat || sim.tick < b.immuneUntil) return false;
  b.disabledUntil = sim.tick + ticks;
  b.immuneUntil = b.disabledUntil + sim.data.battle.sabotage.immunityTicks;
  b.targetTroop = -1;
  sim.events.push({ k: 'sabotage', building: index, troop: t.id });
  return true;
}

function effect(sim: BattleSim, value: WarriorEffect): void {
  // Poison/burning from many copies refreshes the strongest same-type effect, never stacks.
  const existing = sim.warriorEffects.find((e) => e.kind === value.kind && e.target === value.target && sim.troops[e.source].type === sim.troops[value.source].type);
  if (existing && value.kind !== 'charge') {
    existing.endsTick = Math.max(existing.endsTick, value.endsTick);
    existing.damage = Math.max(existing.damage, value.damage);
  } else sim.warriorEffects.push(value);
}

export function stepWarriorEffects(sim: BattleSim, actions: Actions): void {
  const keep: WarriorEffect[] = [];
  const burns = new Map<number, Map<string, number>>();
  for (const e of sim.warriorEffects) {
    if (e.kind === 'charge') {
      if (sim.tick >= e.endsTick) {
        actions.damageBuilding(sim, e.target, e.damage);
        sim.events.push({ k: 'hit', x: e.x, y: e.y, kind: 'seedbomb', splash: e.radius });
      } else keep.push(e);
    } else if (sim.tick < e.endsTick) {
      if (e.kind === 'poison') actions.damageBuilding(sim, e.target, e.damage);
      else sim.buildings.forEach((b, i) => {
        if (!b.destroyed && b.kind !== 'trap' && distToRect(e.x, e.y, shape(b)) <= e.radius) {
          const types = burns.get(i) ?? new Map<string, number>();
          const type = sim.troops[e.source].type;
          types.set(type, Math.max(types.get(type) ?? 0, e.damage)); burns.set(i, types);
        }
      });
      keep.push(e);
    }
  }
  for (const [index, types] of burns) for (const damage of types.values()) actions.damageBuilding(sim, index, damage);
  sim.warriorEffects = keep;
  for (const t of sim.troops) {
    if (!t.dead && t.decoyUntil > 0 && sim.tick >= t.decoyUntil) {
      t.hp = 0; t.dead = true;
      sim.events.push({ k: 'troopDied', troop: t.id });
    }
  }
  if (sim.tick % sim.data.battle.warriorRules.supportIntervalTicks === 0) {
    const seconds = sim.data.battle.warriorRules.supportIntervalTicks / sim.data.battle.ticksPerSecond;
    for (const t of sim.troops) {
      if (t.dead || t.decoyUntil) continue;
      const heal = auraStrength(sim, t, 'heal') * (1 - healCutOf(sim, t));
      if (heal > 0) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * heal * seconds);
    }
  }
}

/** Support, path opening and movement abilities happen before normal targeting/attacking. */
export function beforeWarriorAction(sim: BattleSim, t: SimTroop, actions: Actions): boolean {
  const def = troopDef(sim.data, t.type);
  if (!def.kit || t.summoned) return false;
  const kit = kitOf(sim, t);
  const rules = sim.data.battle.warriorRules;
  const radius = kit.radius ?? rules.defaultAuraRadius;
  if (kit.disarm) {
    sim.buildings.forEach((b, i) => {
      if (b.kind === 'trap' && at(t, b, radius)) {
        b.hidden = false;
        actions.damageBuilding(sim, i, b.hp);
        sim.events.push({ k: 'hit', x: b.x, y: b.y, kind: 'pebble', splash: 0 });
        sim.events.push({ k: 'ability', troop: t.id, what: 'disarm' });
      }
    });
  }
  if (kit.openWalls && sim.tick >= t.abilityReady) {
    let opened = false;
    sim.buildings.forEach((b, i) => {
      if (b.kind === 'hedge' && at(t, b, radius)) {
        actions.damageBuilding(sim, i, b.hp); opened = true;
      }
    });
    if (opened) {
      t.abilityReady = sim.tick + (kit.cooldownTicks ?? rules.abilityCooldownTicks);
      sim.events.push({ k: 'ability', troop: t.id, what: 'openWalls' });
    }
  }
  if (kit.revive && t.charges > 0) {
    const fallen = sim.troops.find((ally) => ally.dead && !ally.summoned && !ally.revived && ally.id !== t.id && distance(t.x, t.y, ally.x, ally.y) <= radius);
    if (fallen) {
      fallen.dead = false; fallen.revived = true; fallen.hp = fallen.maxHp * kit.revive * (sim.temperCut && sim.temperCut.revive > 0 ? 1 - sim.temperCut.revive : 1);
      fallen.target = -1; fallen.path = null; fallen.shieldUntil = 0;
      // Rendering rebuilds the sprite through the same deploy event used for reinforcements.
      sim.events.push({ k: 'deploy', troop: fallen.id }); t.charges--;
      sim.events.push({ k: 'ability', troop: t.id, what: 'revive' });
    }
  }
  if (kit.shelter && t.charges > 0) {
    const allies = sim.troops.filter((ally) => !ally.dead && !ally.decoyUntil && sim.tick >= ally.shieldReady && distance(t.x, t.y, ally.x, ally.y) <= radius);
    if (allies.some((ally) => ally.hp < ally.maxHp)) {
      for (const ally of allies) {
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * kit.shelter * (1 - healCutOf(sim, ally)));
        if (sim.tick >= ally.shieldReady) {
          ally.shieldUntil = sim.tick + (kit.shieldTicks ?? 0) * (1 - (sim.temperCut && sim.temperCut.aura > ally.auraCut ? sim.temperCut.aura : ally.auraCut));
          ally.shieldReady = sim.tick + rules.shieldCooldownTicks;
        }
      }
      t.charges--;
      sim.events.push({ k: 'ability', troop: t.id, what: 'shelter' });
    }
  }
  if (kit.teleport && t.target >= 0 && !sim.buildings[t.target].destroyed && sim.tick >= t.abilityReady) {
    const b = sim.buildings[t.target];
    if (distToRect(t.x, t.y, shape(b)) > def.range) {
      const tx = Math.max(b.x, Math.min(b.x + b.size, t.x));
      const ty = Math.max(b.y, Math.min(b.y + b.size, t.y));
      actions.moveToward(t, tx, ty, rules.teleportDistance);
      t.path = null; t.abilityReady = sim.tick + (kit.cooldownTicks ?? rules.abilityCooldownTicks);
      sim.events.push({ k: 'hit', x: t.x, y: t.y, kind: 'pebble', splash: 0 });
      sim.events.push({ k: 'ability', troop: t.id, what: 'teleport' });
    }
  }
  if (def.prefers !== 'support' || t.summoned) return false;
  // Follow living frontliners rather than walking into a building to "heal" it.
  const allies = sim.troops.filter((ally) => !ally.dead && !ally.summoned && ally.id !== t.id && troopDef(sim.data, ally.type).prefers !== 'support');
  const injured = allies.filter((ally) => ally.hp < ally.maxHp);
  const candidates = kit.aura === 'heal' && injured.length ? injured : allies;
  candidates.sort((a, b) => distance(t.x, t.y, a.x, a.y) - distance(t.x, t.y, b.x, b.y) || a.id - b.id);
  if (!candidates.length) {
    t.path = null;
    return false; // A stranded support can still finish a building.
  }
  t.attacking = false;
  const speed = def.speed * (t.slowTicks > 0 ? 0.5 : 1) * (1 + auraStrength(sim, t, 'haste'));
  if (t.slowTicks > 0) t.slowTicks--;
  if (distance(t.x, t.y, candidates[0].x, candidates[0].y) <= radius / 2) {
    t.path = null;
    return true;
  }
  const n = sim.grid.size;
  // Re-plan every few ticks (or when the route runs out): the nearest ally it can
  // walk to. A wall in the way is a reason to try the next ally, not to stand still;
  // if every ally tried is walled in, the route goes through the wall and the support breaks it.
  if (!t.path || t.pathPos >= t.path.length || (sim.tick + t.id) % rules.supportIntervalTicks === 0) {
    let walled: number[] | null = null;
    t.path = null;
    for (const ally of candidates.slice(0, rules.supportAllyTries)) {
      const path = findPath(sim.grid, t.x, t.y, { x: ally.x, y: ally.y, w: 0, h: 0 }, radius / 2, sim.data.battle.hedgePathCost, false);
      if (!path) continue;
      if (!path.some((c) => sim.grid.cells[c] === HEDGE)) {
        t.path = path;
        break;
      }
      walled = walled ?? path;
    }
    t.path = t.path ?? walled;
    t.pathPos = 0;
    if (!t.path) return false;
    if (!t.path.length) {
      actions.moveToward(t, candidates[0].x, candidates[0].y, speed);
      return true;
    }
  }
  const wp = t.path[t.pathPos];
  const cell = sim.grid.cells[wp];
  if (cell === HEDGE) {
    const hx = wp % n;
    const hy = (wp - hx) / n;
    const hi = sim.buildings.findIndex((b) => !b.destroyed && b.kind === 'hedge' && b.x === hx && b.y === hy);
    if (hi >= 0) {
      t.attacking = true;
      if (t.cooldown <= 0) {
        t.cooldown = def.attackIntervalTicks;
        resolveWarriorHit(sim, t, hi, attackDamage(sim, t, sim.buildings[hi]), actions);
      }
      return true;
    }
  }
  if (cell === BLOCKED) {
    t.path = null;
    return true;
  }
  if (actions.moveToward(t, (wp % n) + 0.5, Math.floor(wp / n) + 0.5, speed)) t.pathPos++;
  return true;
}

export function attackDamage(sim: BattleSim, t: SimTroop, target: SimBuilding): number {
  const kit = kitOf(sim, t);
  let damage = t.damage;
  t.hits++;
  t.revealed = true;
  const flash = (what: string) => sim.events.push({ k: 'ability', troop: t.id, what });
  if (t.firstHit && kit.firstHitMultiplier) { damage *= kit.firstHitMultiplier; flash('firstHit'); }
  // Heroes (SIM_RULES 5): the first strike starts the Rally; every warrior near a rallying hero hits harder.
  if (t.firstHit && kit.aura === 'rally') { t.rallyUntil = sim.tick + (kit.durationTicks ?? 0); flash('rally'); }
  if (sim.setup.hero) damage *= 1 + auraStrength(sim, t, 'rally');
  t.firstHit = false;
  if (kit.every && t.hits % kit.every === 0) { damage *= kit.hitMultiplier ?? 1; flash('every'); }
  if (kit.rageMultiplier && t.hp < t.maxHp / 2) damage *= kit.rageMultiplier;
  if (kit.critChance && next(sim.rng) < kit.critChance) { damage *= kit.critMultiplier ?? 1; flash('crit'); }
  if (kit.smokeMultiplier && sim.smokes.some((c) => sim.tick < c.endsTick && distToRect(c.x, c.y, shape(target)) <= c.radius)) damage *= kit.smokeMultiplier;
  if (target.kind === 'hedge') {
    // Boar Rider gets one charge; Ram Crew and Oni Breaker keep their wall bonus.
    if (troopDef(sim.data, t.type).ability !== 'charge' || t.charges > 0) {
      damage = troopDef(sim.data, t.type).ability === 'charge' ? Math.max(damage, target.hp) : damage * (kit.wallMultiplier ?? 1);
      if (troopDef(sim.data, t.type).ability === 'charge' && t.charges > 0) t.charges--;
    }
  }
  if (kit.suicide) damage *= kit.hitMultiplier ?? 1;
  return damage;
}

export function resolveWarriorHit(sim: BattleSim, t: SimTroop, bi: number, damage: number, actions: Actions): void {
  const target = sim.buildings[bi];
  const kit = kitOf(sim, t);
  const def = troopDef(sim.data, t.type);
  const cx = target.x + target.size / 2;
  const cy = target.y + target.size / 2;
  if ((def.ability === 'sabotage' || kit.jamTicks) && t.charges > 0 && jam(sim, t, bi, kit.jamTicks ?? sim.data.battle.sabotage.disableTicks)) {
    let count = 1;
    sim.buildings.forEach((b, i) => {
      if (count >= (kit.jamTargets ?? 1) || i === bi || distance(cx, cy, b.x + b.size / 2, b.y + b.size / 2) > (kit.radius ?? 0)) return;
      if (jam(sim, t, i, kit.jamTicks ?? 0)) count++;
    });
    t.charges--; t.attacking = true; t.cooldown = def.attackIntervalTicks;
    if (damage === 0) return;
  }
  if (!target.destroyed) {
    if (kit.stunTicks && t.charges > 0 && jam(sim, t, bi, kit.stunTicks)) t.charges--;
    if (kit.shred) { target.vulnerability = Math.max(target.vulnerability, kit.shred); target.vulnerableUntil = sim.tick + (kit.durationTicks ?? 0); }
    if (kit.defenseSlow) { target.fireSlow = Math.max(target.fireSlow, kit.defenseSlow); target.slowedUntil = sim.tick + (kit.durationTicks ?? 0); }
    const base = { source: t.id, target: bi, x: cx, y: cy, radius: kit.radius ?? 0 };
    if (kit.chargeDelay && t.charges > 0 && target.kind === 'defense') {
      effect(sim, { ...base, kind: 'charge', damage: t.damage * (kit.chargeMultiplier ?? 1), endsTick: sim.tick + kit.chargeDelay }); t.charges--;
      sim.events.push({ k: 'ability', troop: t.id, what: 'charge' });
    }
    if (kit.poisonTicks) effect(sim, { ...base, kind: 'poison', damage: t.damage * (kit.poisonFraction ?? 0), endsTick: sim.tick + kit.poisonTicks });
    if (kit.burnTicks) effect(sim, { ...base, kind: 'burn', damage: t.damage * (kit.burnFraction ?? 0), endsTick: sim.tick + kit.burnTicks });
    actions.damageBuilding(sim, bi, damage);
  }
  let hits = 0;
  sim.buildings.forEach((b, i) => {
    if (hits >= (kit.extraTargets ?? 0) || i === bi || b.destroyed || b.kind === 'trap') return;
    if (def.ability === 'chain_lightning' && b.kind !== 'defense') return;
    if (distToRect(cx, cy, shape(b)) > (kit.radius ?? 0)) return;
    actions.damageBuilding(sim, i, damage * (kit.secondaryDamage ?? 0)); hits++;
    sim.events.push({ k: 'hit', x: b.x + b.size / 2, y: b.y + b.size / 2, kind: def.projectile ?? 'pebble', splash: 0 });
  });
  if (kit.suicide && !t.dead) {
    t.hp = 0; t.dead = true;
    sim.events.push({ k: 'troopDied', troop: t.id });
  }
}
