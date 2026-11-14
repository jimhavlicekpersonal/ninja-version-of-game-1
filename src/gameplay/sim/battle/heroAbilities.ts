/**
 * The three non-live heroes' abilities (content batch 2026-11-14; designs in docs/game-theory/ROSTER.md).
 * Their kits (`kit.heroAbility`) exist only in `data/planned.json`, so a live battle never starts one and
 * `BattleSim.heroIndex` stays unset. Each starts on the hero's first hit, once per battle.
 *
 * - bulwark (Iron Matriarch): for `durationTicks`, warriors within `radius` of her take `strength` less damage
 *   from defense fire that comes from inside her forward cone (facing her target when she raised it; `coneCos`
 *   is the cosine of the cone's half-angle, so the test is a dot product, no trigonometry).
 * - squall (Sky Admiral): every flyer is pushed `pushTiles` toward its target, and for `durationTicks` flyers
 *   take `strength` less damage from defenses.
 * - inner_calm (Grand Sensei): every warrior on the field heals `heal` of its max HP (less any healing cut) and
 *   ignores the next trap, splash hit or stun (`SimTroop.calm`).
 */
import type { BattleSim, SimBuilding, SimTroop } from './state';
import type { WarriorKit } from '../types';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Move a flyer up to `tiles` toward a point (battle.ts `moveToward`, kept here to avoid an import cycle). */
function push(t: SimTroop, x: number, y: number, tiles: number): void {
  const d = dist(t.x, t.y, x, y);
  if (d <= tiles) {
    t.x = x;
    t.y = y;
  } else if (d > 0.0001) {
    t.x += ((x - t.x) / d) * tiles;
    t.y += ((y - t.y) / d) * tiles;
  }
}

/** Start a non-live hero's ability (from attackDamage, on its first hit). */
export function startHeroAbility(sim: BattleSim, t: SimTroop, kit: WarriorKit, target: SimBuilding): void {
  if (t.heroUsed || !kit.heroAbility) return;
  t.heroUsed = true;
  const until = sim.tick + (kit.durationTicks ?? 0);
  if (kit.heroAbility === 'bulwark') {
    const dx = target.x + target.size / 2 - t.x;
    const dy = target.y + target.size / 2 - t.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    t.bulwarkUntil = until;
    t.bulwarkX = d > 0.0001 ? dx / d : 1;
    t.bulwarkY = d > 0.0001 ? dy / d : 0;
  } else if (kit.heroAbility === 'squall') {
    for (const f of sim.troops) {
      if (f.dead || !f.air || f.groundedUntil > sim.tick) continue;
      f.squallUntil = until;
      const goal = f.target >= 0 ? sim.buildings[f.target] : null;
      if (goal && !goal.destroyed) push(f, goal.x + goal.size / 2, goal.y + goal.size / 2, kit.pushTiles ?? 0);
    }
  } else {
    for (const a of sim.troops) {
      if (a.dead || a.decoyUntil) continue;
      const cut = Math.max(a.healCut, sim.temperCut?.heal ?? 0);
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * (kit.heal ?? 0) * (1 - cut));
      a.calm = true;
    }
  }
  sim.events.push({ k: 'ability', troop: t.id, what: kit.heroAbility });
}

/** Damage factor on defense fire at `t` coming from (fromX, fromY), under a non-live hero's ability. */
export function heroShield(sim: BattleSim, t: SimTroop, fromX: number, fromY: number): number {
  const h = sim.troops[sim.heroIndex!];
  if (!h) return 1;
  const kit = (sim.data.battle.heroes?.[h.type]?.kit ?? {}) as WarriorKit;
  let factor = 1;
  if (t.squallUntil !== undefined && t.squallUntil > sim.tick && t.air) factor *= 1 - (kit.strength ?? 0);
  if (!h.dead && h.bulwarkUntil !== undefined && h.bulwarkUntil > sim.tick && dist(h.x, h.y, t.x, t.y) <= (kit.radius ?? 0)) {
    const dx = fromX - t.x;
    const dy = fromY - t.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.0001 && (dx * (h.bulwarkX ?? 0) + dy * (h.bulwarkY ?? 0)) / d >= (kit.coneCos ?? 1)) factor *= 1 - (kit.strength ?? 0);
  }
  return factor;
}
