/** Generated opponent bases for scouting, built deterministically from a seed. */
import { buildingDef, hallType } from '../data';
import { createRng, int, next, pick, type Rng } from '../rng';
import type { Cost, GameData, ResourceKind } from '../types';
import type { BaseBuilding, BaseLayout } from './types';

interface Occ {
  size: number;
  cells: Uint8Array;
}

function free(o: Occ, x: number, y: number, s: number, gap: number): boolean {
  if (x < 1 || y < 1 || x + s > o.size - 1 || y + s > o.size - 1) return false;
  for (let yy = y - gap; yy < y + s + gap; yy++) {
    for (let xx = x - gap; xx < x + s + gap; xx++) {
      if (xx < 0 || yy < 0 || xx >= o.size || yy >= o.size) continue;
      if (o.cells[yy * o.size + xx]) return false;
    }
  }
  return true;
}

function mark(o: Occ, x: number, y: number, s: number): void {
  for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) o.cells[yy * o.size + xx] = 1;
}

/** Try random spots in a square ring around the centre. */
function placeInRing(rng: Rng, o: Occ, s: number, c: number, r1: number, r2: number, gap: number): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 300; attempt++) {
    const r = attempt > 200 ? r2 + 4 : r2;
    const x = int(rng, c - r, c + r) - Math.floor(s / 2);
    const y = int(rng, c - r, c + r) - Math.floor(s / 2);
    const cheb = Math.max(Math.abs(x + s / 2 - c), Math.abs(y + s / 2 - c));
    if (cheb < r1) continue;
    if (free(o, x, y, s, gap)) return { x, y };
  }
  return null;
}

export function opponentName(rng: Rng, data: GameData): string {
  return `${pick(rng, data.names.placeFirst)} ${pick(rng, data.names.placeSecond)}`;
}

/**
 * A named layout style. Each one asks for a different plan of attack, so
 * practice targets and Shadow Trials rotate through them.
 */
export interface LayoutArchetype {
  id: string;
  name: string;
  /** One-line advice shown when scouting. */
  tip: string;
  /** Ring (min, max Chebyshev distance from the centre) per kind of building. */
  rings: { splash: [number, number]; defense: [number, number]; storage: [number, number]; trap: [number, number]; other: [number, number] };
  /** Wall rings around the core (0 = none), and gaps per ring (0 = closed). */
  wallRings: number;
  wallGaps: number;
}

export const LAYOUTS: LayoutArchetype[] = [
  {
    id: 'kunai_ring',
    name: 'Kunai Ring',
    tip: 'Towers in a wide ring cover each other: jam one, smoke your squad as it reaches the next, break in through the gap.',
    rings: { splash: [6, 9], defense: [6, 9], storage: [2, 5], trap: [5, 8], other: [10, 14] },
    wallRings: 0,
    wallGaps: 0,
  },
  {
    id: 'walled_keep',
    name: 'Walled Keep',
    tip: 'Two closed walls: Saboteurs and Tunnel Runners slip in, Guardians break through.',
    rings: { splash: [2, 5], defense: [2, 6], storage: [2, 6], trap: [6, 8], other: [10, 14] },
    wallRings: 2,
    wallGaps: 0,
  },
  {
    id: 'mortar_core',
    name: 'Mortar Core',
    tip: 'Firework Mortars guard the centre: jam them before the main force arrives, and spread out.',
    rings: { splash: [0, 3], defense: [7, 10], storage: [3, 6], trap: [4, 7], other: [11, 14] },
    wallRings: 1,
    wallGaps: 2,
  },
  {
    id: 'twin_gates',
    name: 'Twin Gates',
    tip: 'Two gates funnel troops onto hidden traps: choose a gate, or go over the wall.',
    rings: { splash: [3, 6], defense: [3, 7], storage: [2, 6], trap: [7, 9], other: [11, 14] },
    wallRings: 1,
    wallGaps: 2,
  },
  {
    id: 'open_court',
    name: 'Open Courtyard',
    tip: 'Buildings spread wide with no walls: fast Shinobi and Tunnel Runners clear it quickly.',
    rings: { splash: [3, 12], defense: [3, 12], storage: [2, 12], trap: [4, 12], other: [6, 15] },
    wallRings: 0,
    wallGaps: 0,
  },
];

export interface OpponentOptions {
  /**
   * 0..1: how close buildings are to this hall level's caps. 0 = about two
   * levels below the caps (a fresh arrival at this hall), 1 = maxed. Higher
   * also means a bit more loot. Default 0.5.
   */
  levelBias?: number;
  /** Arrange the base in a named style instead of the default rings. */
  layout?: LayoutArchetype;
}

export function generateOpponent(seed: number, hallLevel: number, data: GameData, opts: OpponentOptions = {}): BaseLayout {
  const rng = createRng(seed);
  const bias = Math.max(0, Math.min(1, opts.levelBias ?? 0.5));
  const map = data.economy.mapSize;
  const hl = Math.max(1, Math.min(hallLevel, data.hall.levels.length));
  const limits = data.hall.levels[hl - 1].limits;
  const o: Occ = { size: map, cells: new Uint8Array(map * map) };
  const buildings: BaseBuilding[] = [];
  let id = 1;
  const add = (type: string, level: number, x: number, y: number) => {
    buildings.push({ id: `o${id++}`, type, level, x, y });
    mark(o, x, y, buildingDef(data, type).size);
  };
  const c = Math.floor(map / 2);
  const ht = hallType(data);
  const hallSize = buildingDef(data, ht).size;
  add(ht, hl, c - hallSize / 2, c - hallSize / 2);

  const levelFor = (type: string) => {
    const max = limits[type]?.maxLevel ?? 1;
    const below = Math.max(0, Math.min(3, Math.round((1 - bias) * 2 + next(rng) - 0.5)));
    return Math.max(1, max - below);
  };
  const plan: { type: string; r1: number; r2: number }[] = [];
  for (const [type, lim] of Object.entries(limits)) {
    const def = buildingDef(data, type);
    if (def.category === 'hedge' || def.category === 'decor') continue;
    let count = lim.count;
    if (def.category === 'builder') count = 2 + int(rng, 0, Math.min(3, lim.count - 2));
    else if (def.category === 'collector') count = Math.max(1, int(rng, Math.ceil(count / 2), count));
    for (let i = 0; i < count; i++) {
      const L = opts.layout;
      const pickRing = (r: [number, number]) => ({ r1: r[0], r2: r[1] });
      const ring = L
        ? pickRing(
            def.category === 'defense'
              ? def.combat?.splashRadius
                ? L.rings.splash
                : L.rings.defense
              : def.category === 'trap'
                ? L.rings.trap
                : def.category === 'storage'
                  ? L.rings.storage
                  : L.rings.other,
          )
        : def.category === 'defense' || def.category === 'trap' ? { r1: 3, r2: 7 } : def.category === 'storage' ? { r1: 2, r2: 6 } : { r1: 8, r2: 13 };
      plan.push({ type, ...ring });
    }
  }
  // Defenses and storages first so they sit in the core (splash defenses first in a styled layout).
  const order = (t: string) => {
    const d = buildingDef(data, t);
    if (opts.layout && d.category === 'defense' && d.combat?.splashRadius) return -1;
    return ({ defense: 0, storage: 1, trap: 2 } as Record<string, number>)[d.category] ?? 3;
  };
  plan.sort((a, b) => order(a.type) - order(b.type));
  // Support counters (Repair Crane, Incense Burner) only work near defenses, so
  // they are placed after the defenses, where they cover the most of them.
  const supports = plan.filter((p) => coversDefenses(data, p.type));
  for (const p of plan) {
    if (supports.includes(p)) continue;
    const def = buildingDef(data, p.type);
    const spot = placeInRing(rng, o, def.size, c, p.r1, p.r2, def.category === 'trap' ? 0 : 1);
    if (spot) add(p.type, levelFor(p.type), spot.x, spot.y);
  }
  for (const p of supports) {
    const def = buildingDef(data, p.type);
    const spot = placeNearDefenses(o, buildings, data, p.type, c) ?? placeInRing(rng, o, def.size, c, p.r1, p.r2, 1);
    if (spot) add(p.type, levelFor(p.type), spot.x, spot.y);
  }

  // A hedge ring around the core, with a few gaps.
  const hedgeLimit = limits.bramble_hedge;
  if (opts.layout) {
    if (hedgeLimit && hedgeLimit.count > 0 && opts.layout.wallRings > 0) styledWalls(rng, o, buildings, data, hedgeLimit.count, levelFor('bramble_hedge'), opts.layout, add);
  } else if (hedgeLimit && hedgeLimit.count > 0) {
    const core = buildings.filter((b) => ['hall', 'defense', 'storage'].includes(buildingDef(data, b.type).category));
    let x0 = map;
    let y0 = map;
    let x1 = 0;
    let y1 = 0;
    for (const b of core) {
      const s = buildingDef(data, b.type).size;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + s);
      y1 = Math.max(y1, b.y + s);
    }
    x0 -= 2;
    y0 -= 2;
    x1 += 1;
    y1 += 1;
    const ring: [number, number][] = [];
    for (let x = x0; x <= x1; x++) ring.push([x, y0], [x, y1]);
    for (let y = y0 + 1; y < y1; y++) ring.push([x0, y], [x1, y]);
    const gaps = hl >= 4 ? 1 : hl >= 2 ? 2 : 3;
    const gapStarts = new Set<number>();
    for (let g = 0; g < gaps; g++) gapStarts.add(int(rng, 0, ring.length - 1));
    const skip = new Set<number>();
    for (const g of gapStarts) {
      skip.add(g);
      skip.add((g + 2) % ring.length);
    }
    let placed = 0;
    const lvl = levelFor('bramble_hedge');
    ring.forEach(([x, y], i) => {
      if (placed >= hedgeLimit.count || skip.has(i)) return;
      if (x < 0 || y < 0 || x >= map || y >= map || o.cells[y * map + x]) return;
      add('bramble_hedge', lvl, x, y);
      placed++;
    });
  }

  // Loot: spread between storages, collectors and the hall.
  const range = data.battle.generatedLootByHall[hl - 1];
  const shares = data.battle.lootShares;
  for (const res of ['acorns', 'dew'] as ResourceKind[]) {
    const total = Math.floor(range.min + (range.max - range.min) * (0.5 * next(rng) + 0.5 * bias));
    const holders = (cat: string) =>
      buildings.filter((b) => {
        const d = buildingDef(data, b.type);
        if (d.category !== cat) return false;
        if (cat === 'collector') return d.produces === res;
        return Object.keys(d.levels[0].storage ?? {}).includes(res);
      });
    const give = (bs: BaseBuilding[], amount: number) => {
      if (!bs.length) return amount;
      const each = Math.floor(amount / bs.length);
      for (const b of bs) b.loot = { ...(b.loot ?? {}), [res]: ((b.loot as Cost)?.[res] ?? 0) + each };
      return amount - each * bs.length;
    };
    let rest = 0;
    rest += give(holders('storage'), Math.floor(total * shares.storage));
    rest += give(holders('collector'), Math.floor(total * shares.collector));
    const hall = buildings[0];
    const hallAmount = total - Math.floor(total * shares.storage) - Math.floor(total * shares.collector) + rest;
    hall.loot = { ...(hall.loot ?? {}), [res]: ((hall.loot as Cost)?.[res] ?? 0) + hallAmount };
    // Unused shares (no storages/collectors) also land in the hall.
    if (!holders('storage').length) hall.loot[res] = (hall.loot[res] ?? 0) + Math.floor(total * shares.storage);
    if (!holders('collector').length) hall.loot[res] = (hall.loot[res] ?? 0) + Math.floor(total * shares.collector);
  }
  const out: BaseLayout = { name: opponentName(rng, data), hallLevel: hl, buildings };
  if (opts.layout) out.practice = opts.layout.name;
  return out;
}

/** A non-firing building whose counter effect works on defenses or the fights around them. */
function coversDefenses(data: GameData, type: string): boolean {
  const def = buildingDef(data, type);
  return def.category === 'support' && Boolean(def.effect?.radius);
}

/** Defense centres a building at (x, y) would cover with its effect radius. */
export function defensesCovered(data: GameData, buildings: BaseBuilding[], type: string, x: number, y: number): number {
  const def = buildingDef(data, type);
  const r = def.effect?.radius ?? 0;
  const cx = x + def.size / 2;
  const cy = y + def.size / 2;
  let n = 0;
  for (const b of buildings) {
    const d = buildingDef(data, b.type);
    if (d.category !== 'defense') continue;
    const dx = b.x + d.size / 2 - cx;
    const dy = b.y + d.size / 2 - cy;
    if (dx * dx + dy * dy <= r * r) n++;
  }
  return n;
}

/**
 * The free spot where a support counter covers the most defenses (it may
 * stand right next to them: a 3-tile defense is otherwise out of a 3-tile
 * radius); ties go to the spot nearest the centre, then the lowest row and
 * column, so it is deterministic. Null when no spot covers any defense.
 */
function placeNearDefenses(o: Occ, buildings: BaseBuilding[], data: GameData, type: string, c: number): { x: number; y: number } | null {
  const s = buildingDef(data, type).size;
  let best: { x: number; y: number; n: number; d: number } | null = null;
  for (let y = 1; y + s < o.size; y++) {
    for (let x = 1; x + s < o.size; x++) {
      if (!free(o, x, y, s, 0)) continue;
      const n = defensesCovered(data, buildings, type, x, y);
      if (n === 0) continue;
      const d = (x + s / 2 - c) * (x + s / 2 - c) + (y + s / 2 - c) * (y + s / 2 - c);
      if (!best || n > best.n || (n === best.n && d < best.d)) best = { x, y, n, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Wall rings for a styled layout: rings around the core, `wallGaps` gates in each. */
function styledWalls(
  rng: Rng,
  o: Occ,
  buildings: BaseBuilding[],
  data: GameData,
  limit: number,
  level: number,
  layout: LayoutArchetype,
  add: (type: string, level: number, x: number, y: number) => void,
): void {
  const map = o.size;
  const core = buildings.filter((b) => ['hall', 'defense', 'storage'].includes(buildingDef(data, b.type).category));
  let x0 = map;
  let y0 = map;
  let x1 = 0;
  let y1 = 0;
  for (const b of core) {
    const s = buildingDef(data, b.type).size;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + s);
    y1 = Math.max(y1, b.y + s);
  }
  let placed = 0;
  const wallType = Object.keys(data.buildings).find((t) => data.buildings[t].category === 'hedge') ?? 'bramble_hedge';
  for (let ringNo = 0; ringNo < layout.wallRings; ringNo++) {
    const pad = 2 + ringNo * 2;
    const rx0 = x0 - pad;
    const ry0 = y0 - pad;
    const rx1 = x1 + pad - 1;
    const ry1 = y1 + pad - 1;
    const ring: [number, number][] = [];
    for (let x = rx0; x <= rx1; x++) ring.push([x, ry0], [x, ry1]);
    for (let y = ry0 + 1; y < ry1; y++) ring.push([rx0, y], [rx1, y]);
    const skip = new Set<number>();
    for (let g = 0; g < layout.wallGaps; g++) {
      // Gates on opposite sides, two tiles wide.
      const start = Math.floor(((g + next(rng) * 0.3) * ring.length) / Math.max(1, layout.wallGaps));
      skip.add(start % ring.length);
      skip.add((start + 2) % ring.length);
    }
    for (let i = 0; i < ring.length; i++) {
      if (placed >= limit) return;
      const [x, y] = ring[i];
      if (skip.has(i) || x < 0 || y < 0 || x >= map || y >= map || o.cells[y * map + x]) continue;
      add(wallType, level, x, y);
      placed++;
    }
  }
}

/** Total loot on offer in a base. */
export function totalLoot(base: BaseLayout): Cost {
  const out: Cost = {};
  for (const b of base.buildings) for (const [k, v] of Object.entries(b.loot ?? {}) as [ResourceKind, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
