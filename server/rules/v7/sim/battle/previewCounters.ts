/**
 * The fifteen non-live defensive counters (content batch 2026-11-14). Their buildings are defined only in
 * `data/planned.json` and reach a battle only through `withPreview` (sim/plannedContent.ts, the testing sandbox and
 * the balance preview), never through the shipped data. Every hook here is reached only when the base holds
 * one of these kinds (`BattleSim.previewKinds`) or a troop carries a non-live flag, so a live battle runs
 * exactly the code and arithmetic it ran before (`rules-version.test.ts`, `aura-cache.test.ts`).
 *
 * Rules (numbers in the effect, see `BuildingEffect`):
 * - spin_aoe (Whirling Blade Tower): every shot hits each ground warrior within `radius` of the tower's edge.
 * - extinguish (Rain Barrel Tower): burning and poison on buildings in reach end `burnMaxSeconds` after first
 *   doused; a burn area that starts in reach is `splashCutPct` smaller; chained lightning in `troops` deals
 *   `conductPct` more to buildings in reach.
 * - detect_underground (Listening Jars): diggers (`troops`) within `radius` surface (they must break walls) and
 *   are stunned `stunSeconds`, once each; hidden warriors within `revealRadius` are revealed.
 * - regrow_wall (Living Bamboo Wall): regrows `regenPctPerSecond` of its HP each second; wall multipliers count
 *   `wallMultDamp` of their bonus; climbers (`troops`) must break it.
 * - beast_decoy (Straw Scarecrow): beasts (`troops`) within `radius` attack it first; `birds` avoid targets
 *   within `radius`; burns on it deal `burnMultiplier`×. It is visible and takes splash and burns.
 * - reflect_projectiles (Bronze Mirror Screen): every `every`-th warrior projectile that hits it flies back for
 *   `reflectPct` of its damage.
 * - smother_splash (Sand Bucket Post): splash and burn damage on buildings in reach is `splashCutPct` smaller;
 *   it defuses `defuses` planted charges per battle.
 * - focus_aura (Discipline Banner): defenses in reach ignore taunts and decoys (`ignores`).
 * - instant_retarget (Spotter's Perch): defenses in reach switch at once onto a warrior in `troops` in range.
 * - no_projectile_aoe (Steam Vent): every shot hits each ground warrior within `radius` of its centre, hidden
 *   or not, and smoke clouds centred in reach end.
 * - sleep (Sleep Dart Tower): a dart puts its warrior to sleep for `seconds` (once each with `oncePerTarget`);
 *   it prefers warriors still awake.
 * - line_crush (Rolling Log Chute): a trap whose log rolls `length` tiles from the trap through the warrior that
 *   sprang it, hitting every ground warrior within `width`/2 of the lane (not splash).
 * - arrival_stun (Moonlit Gravel Garden): movers in `troops` that reach `radius` are stunned `stunSeconds`, once each.
 * - no_revive (Ink Seal Post): warriors who fall within `radius` can't be revived.
 * - absorb_lightning (Lightning Rod Tower): hits by `troops` on buildings within `radius` (the rod's own
 *   excepted) charge the rod instead; at `capacity` × its max HP it fires `returnPct` of the charge back at the
 *   striker.
 */
import type { BattleSim, SimBuilding, SimTroop } from './state';
import type { BuildingEffect } from '../types';
import { troopDef } from '../data';
import { distToRect } from './pathfind';

/** The kinds handled here (a base holding none of them never reaches this module's per-tick work). */
export const PREVIEW_KINDS: ReadonlySet<BuildingEffect['kind']> = new Set<BuildingEffect['kind']>([
  'spin_aoe', 'extinguish', 'detect_underground', 'regrow_wall', 'beast_decoy', 'reflect_projectiles', 'smother_splash',
  'focus_aura', 'instant_retarget', 'no_projectile_aoe', 'sleep', 'line_crush', 'arrival_stun', 'no_revive', 'absorb_lightning',
]);

const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const cx = (b: SimBuilding) => b.x + b.size / 2;
const cy = (b: SimBuilding) => b.y + b.size / 2;
const rect = (b: SimBuilding) => ({ x: b.x, y: b.y, w: b.size, h: b.size });
const ticksOf = (sim: BattleSim, seconds: number | undefined) => Math.round((seconds ?? 0) * sim.data.battle.ticksPerSecond);
const lists = (e: BuildingEffect | null, t: SimTroop) => Boolean(e?.troops?.includes(t.type));
const grounded = (sim: BattleSim, t: SimTroop) => !t.air || t.groundedUntil > sim.tick;
/** warriors.ts `isHidden` (repeated here so the rule modules keep no import cycle). */
const isHidden = (sim: BattleSim, t: SimTroop) => Boolean(!t.summoned && troopDef(sim.data, t.type).kit?.stealth && !t.revealed && !(t.litUntil > sim.tick));

/** The non-live kinds on a base, or undefined when it has none (the live case). */
export function previewKindsOf(buildings: SimBuilding[]): Partial<Record<string, true>> | undefined {
  let out: Partial<Record<string, true>> | undefined;
  for (const b of buildings) if (b.effect && PREVIEW_KINDS.has(b.effect.kind)) (out ??= {})[b.effect.kind] = true;
  return out;
}

/** Standing buildings of one kind. */
function each(sim: BattleSim, kind: BuildingEffect['kind'], fn: (b: SimBuilding, bi: number, e: BuildingEffect) => void): void {
  sim.buildings.forEach((b, bi) => {
    if (!b.destroyed && b.effect?.kind === kind) fn(b, bi, b.effect);
  });
}

/** Stun or sleep a warrior; Inner Calm's ward takes it instead. True if it took hold. */
export function stunTroop(sim: BattleSim, t: SimTroop, ticks: number): boolean {
  if (t.dead || ticks <= 0) return false;
  if (t.calm) {
    t.calm = false;
    return false;
  }
  t.stunnedUntil = Math.max(t.stunnedUntil ?? 0, sim.tick + ticks);
  t.attacking = false;
  return true;
}

/** Per-tick work of the non-live counters (called from stepFortifications when the base has one). */
export function stepPreviewCounters(sim: BattleSim): void {
  const k = sim.previewKinds!;
  const tps = sim.data.battle.ticksPerSecond;
  if (k.focus_aura || k.instant_retarget || k.smother_splash) {
    for (const b of sim.buildings) {
      if (k.focus_aura) b.focused = false;
      if (k.instant_retarget) b.spotter = undefined;
      if (k.smother_splash) b.smother = 0;
    }
  }
  sim.buildings.forEach((b, bi) => {
    const e = b.effect;
    if (!e || b.destroyed || !PREVIEW_KINDS.has(e.kind)) return;
    const radius = e.radius ?? 0;
    switch (e.kind) {
      case 'regrow_wall':
        if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * (e.regenPctPerSecond ?? 0)) / tps);
        break;
      case 'extinguish':
        for (const w of sim.warriorEffects) {
          if (w.kind === 'charge') continue;
          const inReach = w.kind === 'poison' ? distToRect(cx(b), cy(b), rect(sim.buildings[w.target])) <= radius : dist(cx(b), cy(b), w.x, w.y) <= radius;
          if (!inReach) continue;
          if (w.douseEnd === undefined) {
            w.douseEnd = sim.tick + ticksOf(sim, e.burnMaxSeconds);
            if (w.kind === 'burn') w.radius *= 1 - (e.splashCutPct ?? 0);
            sim.events.push({ k: 'counter', building: bi, troop: w.source, target: -1, what: 'doused' });
          }
          if (w.endsTick > w.douseEnd) w.endsTick = w.douseEnd;
        }
        break;
      case 'detect_underground':
        sim.troops.forEach((t, ti) => {
          if (t.dead || !grounded(sim, t)) return;
          const d = dist(cx(b), cy(b), t.x, t.y);
          if (!t.jarred && lists(e, t) && d <= radius) {
            t.jarred = true;
            t.surfaced = true;
            t.path = null;
            stunTroop(sim, t, ticksOf(sim, e.stunSeconds));
            b.hidden = false;
            sim.events.push({ k: 'counter', building: bi, troop: ti, target: -1, what: 'surfaced' });
          }
          if (d <= (e.revealRadius ?? 0) && isHidden(sim, t)) {
            t.revealed = true;
            b.hidden = false;
            sim.events.push({ k: 'counter', building: bi, troop: ti, target: -1, what: 'revealed' });
          }
        });
        break;
      case 'arrival_stun':
        sim.troops.forEach((t, ti) => {
          if (t.dead || t.graveled || !grounded(sim, t) || !lists(e, t) || troopDef(sim.data, t.type).kit?.trapImmune) return;
          if (distToRect(t.x, t.y, rect(b)) > radius) return;
          t.graveled = true;
          stunTroop(sim, t, ticksOf(sim, e.stunSeconds));
          b.hidden = false;
          sim.events.push({ k: 'counter', building: bi, troop: ti, target: -1, what: 'stunned' });
        });
        break;
      case 'smother_splash':
        sim.buildings.forEach((d) => {
          if (!d.destroyed && distToRect(cx(b), cy(b), rect(d)) <= radius) d.smother = Math.max(d.smother ?? 0, e.splashCutPct ?? 0);
        });
        if (b.uses > 0) {
          sim.warriorEffects = sim.warriorEffects.filter((w) => {
            if (b.uses <= 0 || w.kind !== 'charge' || distToRect(cx(b), cy(b), rect(sim.buildings[w.target])) > radius) return true;
            b.uses--;
            sim.events.push({ k: 'counter', building: bi, troop: w.source, target: w.target, what: 'defused' });
            return false;
          });
        }
        break;
      case 'focus_aura':
      case 'instant_retarget':
        sim.buildings.forEach((d) => {
          if (d.destroyed || d.kind !== 'defense' || !d.combat || dist(cx(b), cy(b), cx(d), cy(d)) > radius) return;
          if (e.kind === 'focus_aura') d.focused = true;
          else d.spotter ??= bi;
        });
        break;
      case 'no_projectile_aoe':
        if (e.clearsSmoke) for (const c of sim.smokes) if (c.endsTick > sim.tick + 1 && dist(cx(b), cy(b), c.x, c.y) <= radius) c.endsTick = sim.tick + 1;
        break;
      default:
        break;
    }
  });
}

/**
 * Whirling Blade Tower and Steam Vent: an area strike instead of a shot. Called from stepDefense once the
 * defense is not jammed; returns whether it handled the building.
 */
export function areaStrike(sim: BattleSim, bi: number, damageTroop: (sim: BattleSim, ti: number, amount: number, splash?: boolean, origin?: { x: number; y: number }) => void): boolean {
  const b = sim.buildings[bi];
  const e = b.effect;
  const c = b.combat;
  if (!c || (e?.kind !== 'spin_aoe' && e?.kind !== 'no_projectile_aoe')) return false;
  if (b.cooldown > 0) return true;
  const steam = e.kind === 'no_projectile_aoe';
  const radius = e.radius ?? 0;
  const hit: number[] = [];
  sim.troops.forEach((t, ti) => {
    if (t.dead || !grounded(sim, t) || (!steam && isHidden(sim, t))) return;
    const d = steam ? dist(cx(b), cy(b), t.x, t.y) : distToRect(t.x, t.y, rect(b));
    if (d <= radius) hit.push(ti);
  });
  if (!hit.length) return true;
  b.cooldown = c.fireIntervalTicks * (sim.tick < b.slowedUntil ? 1 + b.fireSlow : 1);
  // The spinning blades are an area hit (splash cover softens them); steam is not dodged or covered.
  for (const ti of hit) damageTroop(sim, ti, c.damage, !steam, { x: cx(b), y: cy(b) });
  sim.events.push({ k: 'fire', building: bi });
  sim.events.push({ k: 'hit', x: cx(b), y: cy(b), kind: c.projectile, splash: radius });
  return true;
}

/** Straw Scarecrow: the scarecrow a lured beast must attack now (nearest in reach), or -1. */
export function lureTarget(sim: BattleSim, t: SimTroop): number {
  let best = -1;
  let bestD = Infinity;
  each(sim, 'beast_decoy', (b, bi, e) => {
    if (!lists(e, t)) return;
    const d = distToRect(t.x, t.y, rect(b));
    if (d <= (e.radius ?? 0) && d < bestD) {
      bestD = d;
      best = bi;
    }
  });
  return best;
}

/** Straw Scarecrow: whether a bird will not go for this building (it stands within a scarecrow's reach). */
export function scaresBird(sim: BattleSim, t: SimTroop, target: SimBuilding): boolean {
  let scared = false;
  each(sim, 'beast_decoy', (b, _bi, e) => {
    if (!scared && e.scaresBirds && e.birds?.includes(t.type) && b !== target && distToRect(cx(b), cy(b), rect(target)) <= (e.radius ?? 0)) scared = true;
  });
  return scared;
}

/** Targets a trap-kind building can still be hit as (the Straw Scarecrow takes splash and burns). */
export function hittableTrap(b: SimBuilding): boolean {
  return b.effect?.kind === 'beast_decoy';
}

/** Living Bamboo Wall: a climber that has to break this wall cell like anyone else. */
export function springBlocks(t: SimTroop, hedge: SimBuilding | undefined): boolean {
  const e = hedge?.effect;
  return Boolean(e && e.kind === 'regrow_wall' && e.noClimb && lists(e, t));
}

/** Splash/burn damage factor on a building (Sand Bucket Post), and the Scarecrow's flammability. */
export function burnFactor(b: SimBuilding): number {
  const smother = 1 - (b.smother ?? 0);
  return b.effect?.kind === 'beast_decoy' ? smother * (b.effect.burnMultiplier ?? 1) : smother;
}

/** Rain Barrel Tower's wet ground: extra damage a listed lightning troop deals to a building in reach. */
export function conductFactor(sim: BattleSim, t: SimTroop, target: SimBuilding): number {
  let extra = 0;
  each(sim, 'extinguish', (b, _bi, e) => {
    if (lists(e, t) && distToRect(cx(b), cy(b), rect(target)) <= (e.radius ?? 0)) extra = Math.max(extra, e.conductPct ?? 0);
  });
  return 1 + extra;
}

/** Lightning Rod Tower that takes this troop's hit on `target` instead (-1 if none). */
export function absorbingRod(sim: BattleSim, t: SimTroop, targetIndex: number): number {
  const target = sim.buildings[targetIndex];
  let rod = -1;
  let bestD = Infinity;
  each(sim, 'absorb_lightning', (b, bi, e) => {
    if (bi === targetIndex || !lists(e, t)) return;
    const d = distToRect(cx(b), cy(b), rect(target));
    if (d <= (e.radius ?? 0) && d < bestD) {
      bestD = d;
      rod = bi;
    }
  });
  return rod;
}

/** Charge a rod with an absorbed hit; at capacity it fires the charge back at the striker. */
export function chargeRod(sim: BattleSim, rodIndex: number, amount: number, t: SimTroop, damageTroop: (sim: BattleSim, ti: number, amount: number) => void): void {
  const rod = sim.buildings[rodIndex];
  const e = rod.effect!;
  rod.charge = (rod.charge ?? 0) + amount;
  sim.events.push({ k: 'counter', building: rodIndex, troop: t.id, target: -1, what: 'absorbed' });
  if (rod.charge < rod.maxHp * (e.capacity ?? 1)) return;
  const back = rod.charge * (e.returnPct ?? 0);
  rod.charge = 0;
  if (!t.dead && back > 0) damageTroop(sim, t.id, back);
  sim.events.push({ k: 'counter', building: rodIndex, troop: t.id, target: -1, what: 'discharge' });
}

/** Bronze Mirror Screen: whether this projectile hit flies back (it then damages its thrower instead). */
export function reflects(sim: BattleSim, targetIndex: number): boolean {
  const b = sim.buildings[targetIndex];
  const e = b.effect;
  if (b.destroyed || e?.kind !== 'reflect_projectiles') return false;
  b.reflectHits = (b.reflectHits ?? 0) + 1;
  return b.reflectHits % Math.max(1, e.every ?? 1) === 0;
}

/** Sleep Dart Tower hit: put the warrior to sleep (once each with `oncePerTarget`). */
export function sleepHit(sim: BattleSim, bi: number, t: SimTroop): void {
  const e = sim.buildings[bi].effect;
  if (e?.kind !== 'sleep' || t.dead || (e.oncePerTarget && t.slept)) return;
  t.slept = true;
  if (stunTroop(sim, t, ticksOf(sim, e.seconds))) sim.events.push({ k: 'counter', building: bi, troop: t.id, target: -1, what: 'sleep' });
}

/** Ink Seal Post: a warrior falling in reach is sealed (no revive). */
export function sealIfCovered(sim: BattleSim, t: SimTroop): void {
  each(sim, 'no_revive', (b, bi, e) => {
    if (!t.sealed && dist(cx(b), cy(b), t.x, t.y) <= (e.radius ?? 0)) {
      t.sealed = true;
      sim.events.push({ k: 'counter', building: bi, troop: t.id, target: -1, what: 'sealed' });
    }
  });
}

/** Rolling Log Chute: the troops its log hits, sprung by `trigger`. */
export function logLane(sim: BattleSim, b: SimBuilding, trigger: SimTroop, vulnerable: (t: SimTroop) => boolean): number[] {
  const e = b.effect!;
  let ux = trigger.x - cx(b);
  let uy = trigger.y - cy(b);
  const len = Math.sqrt(ux * ux + uy * uy);
  if (len > 0.0001) {
    ux /= len;
    uy /= len;
  } else {
    ux = 1;
    uy = 0;
  }
  const half = (e.width ?? 1) / 2;
  const out: number[] = [];
  sim.troops.forEach((t, ti) => {
    if (!vulnerable(t)) return;
    const dx = t.x - cx(b);
    const dy = t.y - cy(b);
    const along = dx * ux + dy * uy;
    const across = dx * uy - dy * ux;
    if (along >= -half && along <= (e.length ?? 0) && across <= half && across >= -half) out.push(ti);
  });
  return out;
}
