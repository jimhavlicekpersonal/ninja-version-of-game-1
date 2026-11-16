import { troopDef, troopLevel } from '../sim/data';
import type { BattleSim } from '../sim/battle/battle';

/**
 * Squad orders: send the rest of the army in through one Infiltration Point in a chosen shape and wave order,
 * instead of placing every warrior by hand. Pure planning; the session deploys the steps on their ticks, so a
 * squad order is recorded and replays like any hand-placed raid.
 *
 * Measured in the balance lab on 80 raids at Keep 12 (docs/game-theory/rules10): on top of choosing the entry
 * point, the shape was worth about 7 points of destruction and the wave order about 6.
 */
export type Formation = 'together' | 'pincer' | 'file';
export type WaveOrder = 'tanks' | 'rush' | 'reserve';

export interface SquadOrder {
  /** Index of the chosen Infiltration Point. */
  point: number;
  /** together: that point and its two neighbours. pincer: two pairs of points, a third of the rim apart. file: that point only. */
  formation: Formation;
  /** tanks: toughest type first, two warriors a tick. rush: every type at once. reserve: as tanks, and the last third of the army waits. */
  order: WaveOrder;
}

export interface SquadStep {
  /** Ticks after the order is given. */
  delay: number;
  troop: string;
  x: number;
  y: number;
}

/** How long the reserve waits, in ticks (30 seconds at 10 ticks a second). */
export const RESERVE_DELAY_TICKS = 300;
/** The share of the army's housing that goes in before the reserve is held back. */
export const RESERVE_AFTER_SHARE = 0.65;

/** The steps that carry out `order` with the warriors still undeployed. Empty when the raid has no Infiltration Points. */
export function squadPlan(sim: BattleSim, order: SquadOrder): SquadStep[] {
  const entry = sim.entry;
  if (!entry || entry.points.length === 0) return [];
  const points = entry.points;
  const n = points.length;
  const centre = sim.grid.size / 2;
  // Points in order around the rim, so "neighbour" means the next point along it.
  const rim = points.map((p, i) => ({ i, a: Math.atan2(p.y - centre, p.x - centre) })).sort((a, b) => a.a - b.a || a.i - b.i).map((p) => p.i);
  const start = Math.max(0, rim.indexOf(((order.point % n) + n) % n));
  const at = (k: number): number => rim[(((start + k) % n) + n) % n];
  const groups = order.formation === 'pincer' ? [[at(0), at(1)], [at(Math.floor(n / 2)), at(Math.floor(n / 2) + 1)]] : order.formation === 'file' ? [[at(0)]] : [[at(0), at(1), at(-1)]];
  const toughness = (t: string): number => troopLevel(sim.data, t, sim.setup.levels?.[t] ?? 1).hp / Math.max(1, troopDef(sim.data, t).housing ?? 1);
  const types = Object.keys(sim.remaining)
    .filter((t) => (sim.remaining[t] ?? 0) > 0 && sim.data.troops[t] !== undefined) // the hero is placed by hand
    .sort((a, b) => toughness(b) - toughness(a) || (a < b ? -1 : a > b ? 1 : 0));
  const housing = (t: string): number => troopDef(sim.data, t).housing ?? 1;
  const total = types.reduce((sum, t) => sum + housing(t) * (sim.remaining[t] ?? 0), 0);
  const used = points.map((p) => p.used);
  const steps: SquadStep[] = [];
  let wave = 0;
  let turn = 0;
  let placed = 0;
  for (const troop of types) {
    const h = housing(troop);
    const count = sim.remaining[troop] ?? 0;
    for (let k = 0; k < count; k++) {
      const group = groups[turn % groups.length];
      turn++;
      const fits = (i: number): boolean => used[i] + h <= entry.cover;
      let pick = -1;
      for (const i of group) if (fits(i) && (pick < 0 || used[i] < used[pick])) pick = i;
      if (pick < 0) {
        // The group's points are full: the nearest point with cover left takes the overflow.
        const home = points[group[0]];
        const d2 = (i: number): number => (points[i].x - home.x) * (points[i].x - home.x) + (points[i].y - home.y) * (points[i].y - home.y);
        for (let i = 0; i < n; i++) if (fits(i) && (pick < 0 || d2(i) < d2(pick))) pick = i;
      }
      if (pick < 0) return steps; // no cover left anywhere
      used[pick] += h;
      placed += h;
      const late = order.order === 'reserve' && placed > total * RESERVE_AFTER_SHARE ? RESERVE_DELAY_TICKS : 0;
      const delay = order.order === 'rush' ? Math.floor(k / 4) : wave + Math.floor(k / 2);
      steps.push({ delay: delay + late, troop, x: Math.floor(points[pick].x), y: Math.floor(points[pick].y) });
    }
    if (order.order !== 'rush') wave += Math.ceil(count / 2) + 10;
  }
  return steps;
}
