/**
 * Defensive counters: buildings whose `effect` (buildings.json) answers a
 * family of warrior abilities. Numbers live in data; this file holds rules.
 *
 * - reveal_line (Paper Lantern Line): lights hidden or mist-veiled ground
 *   warriors nearby; lit warriors can be targeted and take extra damage.
 * - shorten_disables (Clockwork Repair Crane): cuts jams/stuns (and a Hawk
 *   Tamer's fire slowing) on nearby defenses short, a few times per battle;
 *   recovery immunity is kept.
 * - anti_heal (Bitter Incense Burner): warriors nearby receive less healing
 *   and weaker heal/haste/resist auras and shelter shields.
 * - ground_flyers (Kite-Cutter Ballista) and counter_artillery (Longbow
 *   Yagura) act through their shots, in battle.ts.
 *
 * Counters are soft: effects never stack across copies (the strongest
 * applies), disables are short, and every one can be destroyed or avoided.
 */
import type { BattleSim, SimTroop } from './battle';
import { auraStrength, isHidden } from './warriors';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Hidden by stealth, or covered by a Mist Weaver's veil right now (and not already lit). */
function unseen(sim: BattleSim, t: SimTroop): boolean {
  if (t.litUntil > sim.tick) return false;
  return isHidden(sim, t) || auraStrength(sim, t, 'veil') > 0;
}

export function stepFortifications(sim: BattleSim): void {
  for (const t of sim.troops) {
    t.healCut = 0;
    t.auraCut = 0;
  }
  const tps = sim.data.battle.ticksPerSecond;
  sim.buildings.forEach((b, bi) => {
    const e = b.effect;
    if (!e || b.destroyed) return;
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const radius = e.radius ?? 0;
    if (e.kind === 'reveal_line') {
      sim.troops.forEach((t, ti) => {
        if (t.dead || t.air || dist(cx, cy, t.x, t.y) > radius || !unseen(sim, t)) return;
        t.litUntil = sim.tick + (e.seconds ?? 0) * tps;
        t.litBonus = Math.max(t.litBonus, e.vulnerablePct ?? 0);
        // Once it has lit someone, the line is no longer a secret (it is never destroyed by triggering).
        b.hidden = false;
        sim.events.push({ k: 'counter', building: bi, troop: ti, target: -1, what: 'lit' });
      });
    } else if (e.kind === 'anti_heal') {
      for (const t of sim.troops) {
        if (t.dead || dist(cx, cy, t.x, t.y) > radius) continue;
        t.healCut = Math.max(t.healCut, e.healCutPct ?? 0);
        t.auraCut = Math.max(t.auraCut, e.auraCutPct ?? 0);
      }
    } else if (e.kind === 'shorten_disables') {
      if (b.uses <= 0) return;
      sim.buildings.forEach((d, di) => {
        if (b.uses <= 0 || di === bi || d.destroyed || d.kind !== 'defense' || !d.combat) return;
        if (dist(cx, cy, d.x + d.size / 2, d.y + d.size / 2) > radius) return;
        if (d.disabledUntil > sim.tick + 1 && d.repairedUntil !== d.disabledUntil) {
          const left = d.disabledUntil - sim.tick;
          const end = sim.tick + Math.max(1, Math.ceil(left * (1 - (e.pct ?? 0))));
          // Recovery immunity still runs its full length, counted from the earlier recovery.
          d.immuneUntil -= d.disabledUntil - end;
          d.disabledUntil = end;
          d.repairedUntil = end;
          b.uses--;
          sim.events.push({ k: 'counter', building: bi, troop: -1, target: di, what: 'repair' });
        } else if (d.slowedUntil > sim.tick + 1 && d.repairedSlowUntil !== d.slowedUntil) {
          // A Hawk Tamer's slowing is a fault the crane fixes too.
          const end = sim.tick + Math.max(1, Math.ceil((d.slowedUntil - sim.tick) * (1 - (e.pct ?? 0))));
          d.slowedUntil = end;
          d.repairedSlowUntil = end;
          b.uses--;
          sim.events.push({ k: 'counter', building: bi, troop: -1, target: di, what: 'repair' });
        }
      });
    }
  });
}
