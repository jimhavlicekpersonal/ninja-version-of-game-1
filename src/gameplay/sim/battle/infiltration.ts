/**
 * Infiltration Points: where an attacker may bring warriors onto the map.
 *
 * Two rules (numbers in battle.json `infiltration`):
 * 1. Warriors can only be deployed inside one of the base's infiltration
 *    points (circles at the map edge). Abilities such as Smoke Bomb still go
 *    anywhere.
 * 2. Each point hides only part of the army: `cover` housing, about a third of
 *    the army. A full army must therefore come in as several squads from
 *    different points, and each squad has to suit what is in front of it.
 *
 * Points come from the base layout (which compass approaches it leaves open),
 * so scouting shows them and every replay and the server agree. Battles whose
 * setup has no `infiltration` flag (records from before this rule) keep the
 * old free placement.
 */
import type { GameData } from '../types';
import type { BaseLayout, BattleSetup } from './types';

export interface InfiltrationPoint {
  /** Letter shown on the map and in the scout report, clockwise from the top of the screen. */
  label: string;
  /** Centre (tile coordinates, centre of a deployable tile). */
  x: number;
  y: number;
  /** Housing already brought in through this point. */
  used: number;
}

export interface InfiltrationPlan {
  points: InfiltrationPoint[];
  /** Tiles from a point's centre that still count as that point. */
  radius: number;
  /** Housing each point can hide. */
  cover: number;
}

const LABELS = 'ABCDEFGH';

/** Same hash for the same layout, wherever it is computed. */
function layoutHash(base: BaseLayout): number {
  let h = 0x811c9dc5;
  for (const b of base.buildings) {
    const s = `${b.type}@${b.x},${b.y};`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
}

/** Housing each point hides for this army. */
export function coverFor(army: Record<string, number>, data: GameData): number {
  const cfg = data.battle.infiltration;
  let total = 0;
  let biggest = 0;
  for (const [t, n] of Object.entries(army)) {
    const h = data.troops[t]?.housing ?? 0;
    if (n <= 0 || h <= 0) continue;
    total += h * n;
    biggest = Math.max(biggest, h);
  }
  return Math.max(cfg.minCover, biggest, Math.ceil(total / cfg.minPoints));
}

/**
 * The base's infiltration points: the 8 compass approaches (map corners and
 * edge midpoints, clockwise from the top of the screen), minus an opposite
 * pair picked from the layout. Each point sits on the deployable tile nearest
 * its approach.
 */
export function planInfiltration(setup: BattleSetup, deployable: Uint8Array, size: number, data: GameData): InfiltrationPlan | null {
  if (!setup.infiltration) return null;
  const cfg = data.battle.infiltration;
  const lo = cfg.insetTiles;
  const hi = size - cfg.insetTiles;
  const mid = size / 2;
  // Screen-clockwise from the top corner (tile 0,0 is the top of the iso view).
  const anchors: [number, number][] = [[lo, lo], [mid, lo], [hi, lo], [hi, mid], [hi, hi], [mid, hi], [lo, hi], [lo, mid]];
  // Drop approaches the layout closes off: one, or an opposite pair, so the rest stay spread around the map.
  const drop = layoutHash(setup.base) % anchors.length;
  const closed = anchors.length - cfg.points >= 2 ? [drop, (drop + anchors.length / 2) % anchors.length] : anchors.length > cfg.points ? [drop] : [];
  const keep = anchors.filter((_, i) => !closed.includes(i));
  const points: InfiltrationPoint[] = [];
  for (const [ax, ay] of keep.slice(0, cfg.points)) {
    let best = -1;
    let bestD = Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!deployable[y * size + x]) continue;
        const dx = x + 0.5 - ax;
        const dy = y + 0.5 - ay;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = y * size + x;
        }
      }
    }
    if (best < 0) continue;
    points.push({ label: LABELS[points.length], x: (best % size) + 0.5, y: Math.floor(best / size) + 0.5, used: 0 });
  }
  return { points, radius: cfg.radius, cover: coverFor(setup.army, data) };
}

/** Index of the point whose circle holds tile (x, y), or -1. */
export function pointAt(plan: InfiltrationPlan, x: number, y: number): number {
  const cx = Math.floor(x) + 0.5;
  const cy = Math.floor(y) + 0.5;
  const r2 = plan.radius * plan.radius;
  for (let i = 0; i < plan.points.length; i++) {
    const p = plan.points[i];
    const dx = cx - p.x;
    const dy = cy - p.y;
    if (dx * dx + dy * dy <= r2) return i;
  }
  return -1;
}

/** Housing a point can still take. */
export function coverLeft(plan: InfiltrationPlan, index: number): number {
  return Math.max(0, plan.cover - plan.points[index].used);
}
