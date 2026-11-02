/**
 * Procedural AI clan villages: constrained generation, not random placement.
 *
 *   clan identity -> Keep level -> defense budget -> layout archetype
 *   -> place Keep and resources -> place defenses -> walls and paths
 *   -> validate reachability -> estimate difficulty -> accept or regenerate
 *
 * The same seed, clan and strength always give the same village, so a server
 * can rebuild a village from those three values instead of trusting a client.
 */
import { maxHousingAtHall } from '../army';
import { generateOpponent, layoutById, LAYOUTS } from '../battle/basegen';
import { BLOCKED, HEDGE } from '../battle/pathfind';
import type { BaseBuilding, BaseLayout } from '../battle/types';
import { buildingDef, troopDef } from '../data';
import { mixSeed } from '../rng';
import type { ClanDef, Cost, GameData, ResourceKind } from '../types';
import { buildingPower, defensePower } from './power';

export function clanDef(data: GameData, id: string): ClanDef {
  const def = data.clans.clans.find((c) => c.id === id);
  if (!def) throw new Error(`Unknown clan: ${id}`);
  return def;
}

/** Keep level and building-level bias for a strength (Keep h covers [h-1, h)). */
export function hallAndBias(strength: number, data: GameData, levelBias = 0): { hall: number; bias: number } {
  const top = data.hall.levels.length;
  const s = Math.max(0, Math.min(top - 1e-6, strength));
  const whole = Math.floor(s);
  return { hall: whole + 1, bias: Math.max(0, Math.min(1, s - whole + levelBias)) };
}

/** The defensive power a clan village at this Keep and bias should have if every building fits. */
export function expectedDefense(hall: number, bias: number, def: Pick<ClanDef, 'wallShare' | 'trapShare'>, data: GameData): number {
  const lim = data.hall.levels[Math.max(1, Math.min(data.hall.levels.length, hall)) - 1].limits;
  const below = Math.max(0, Math.min(3, Math.round((1 - bias) * 2)));
  let p = 0;
  for (const [type, l] of Object.entries(lim)) {
    const cat = buildingDef(data, type).category;
    if (cat !== 'defense' && cat !== 'trap' && cat !== 'hedge') continue;
    const count = cat === 'trap' ? Math.round(l.count * def.trapShare) : cat === 'hedge' ? Math.floor(l.count * def.wallShare) : l.count;
    p += count * buildingPower(type, Math.max(1, l.maxLevel - below), data);
  }
  return p;
}

export interface LayoutCheck {
  ok: boolean;
  problems: string[];
}

/**
 * A village is legal when every building is on the map without overlaps,
 * there is exactly one Keep, counts and levels are within its Keep's limits,
 * and every building can be reached on foot from the map edge (walls may be
 * broken, buildings may not be walked through).
 */
export function validateLayout(base: BaseLayout, data: GameData): LayoutCheck {
  const problems: string[] = [];
  const n = data.economy.mapSize;
  const cells = new Uint8Array(n * n);
  const lim = data.hall.levels[Math.max(1, Math.min(data.hall.levels.length, base.hallLevel)) - 1]?.limits ?? {};
  const counts: Record<string, number> = {};
  let halls = 0;
  for (const b of base.buildings) {
    const def = data.buildings[b.type];
    if (!def) {
      problems.push(`unknown building ${b.type}`);
      continue;
    }
    if (def.category === 'hall') halls++;
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    const l = lim[b.type];
    if (def.category !== 'hall' && (!l || b.level > l.maxLevel)) problems.push(`${b.type} level ${b.level} not allowed at Keep ${base.hallLevel}`);
    if (b.x < 0 || b.y < 0 || b.x + def.size > n || b.y + def.size > n) {
      problems.push(`${b.id} off the map`);
      continue;
    }
    for (let y = b.y; y < b.y + def.size; y++) {
      for (let x = b.x; x < b.x + def.size; x++) {
        if (cells[y * n + x]) problems.push(`${b.id} overlaps`);
        cells[y * n + x] = def.category === 'trap' ? 1 : def.category === 'hedge' ? HEDGE : BLOCKED;
      }
    }
  }
  if (halls !== 1) problems.push('needs exactly one Keep');
  for (const [t, c] of Object.entries(counts)) {
    if (buildingDef(data, t).category === 'hall') continue;
    if (c > (lim[t]?.count ?? 0)) problems.push(`too many ${t}`);
  }
  // Flood fill from the edge through anything but solid buildings.
  const seen = new Uint8Array(n * n);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const c of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
      if (cells[c] !== BLOCKED && !seen[c]) {
        seen[c] = 1;
        queue.push(c);
      }
    }
  }
  while (queue.length) {
    const c = queue.pop()!;
    const x = c % n;
    const y = (c - x) / n;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (seen[ni] || cells[ni] === BLOCKED) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  for (const b of base.buildings) {
    const def = data.buildings[b.type];
    if (!def || def.category === 'hedge' || def.category === 'trap') continue;
    let reachable = false;
    for (let y = b.y - 1; y <= b.y + def.size && !reachable; y++) {
      for (let x = b.x - 1; x <= b.x + def.size; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const inside = x >= b.x && x < b.x + def.size && y >= b.y && y < b.y + def.size;
        if (!inside && seen[y * n + x]) {
          reachable = true;
          break;
        }
      }
    }
    if (!reachable) problems.push(`${b.id} cannot be reached`);
  }
  return { ok: problems.length === 0, problems };
}

export interface Difficulty {
  defense: number;
  /** What this village should have for its Keep, bias and clan style. */
  expected: number;
  /** defense / expected: 1 = exactly as designed. */
  ratio: number;
}

export function estimateDifficulty(base: BaseLayout, expected: number, data: GameData): Difficulty {
  const defense = defensePower(base, data);
  return { defense, expected, ratio: defense / Math.max(1, expected) };
}

/**
 * A clan's village at a strength. Tries up to `maxAttempts` placements and
 * keeps the legal one whose difficulty is closest to the clan's design; the
 * first within tolerance wins. Always labelled as an AI clan village.
 */
export function clanVillage(clanId: string, seed: number, strength: number, data: GameData): BaseLayout {
  const def = clanDef(data, clanId);
  const { hall, bias } = hallAndBias(strength, data, def.levelBias);
  const layout = layoutById(def.layouts[(seed >>> 0) % def.layouts.length]) ?? LAYOUTS[0];
  const expected = expectedDefense(hall, bias, def, data);
  const g = data.clans.generator;
  let best: BaseLayout | null = null;
  let bestErr = Number.POSITIVE_INFINITY;
  for (let i = 0; i < g.maxAttempts; i++) {
    const base = generateOpponent(mixSeed(seed, 0xc1a0 + i), hall, data, { levelBias: bias, layout, wallShare: def.wallShare, trapShare: def.trapShare });
    if (!validateLayout(base, data).ok) continue;
    const err = Math.abs(estimateDifficulty(base, expected, data).ratio - 1);
    if (err < bestErr) {
      best = base;
      bestErr = err;
    }
    if (err <= g.difficultyTolerance) break;
  }
  // The plain ring layout always fits; use it if no styled attempt was legal.
  const out = best ?? generateOpponent(seed, hall, data, { levelBias: bias });
  out.clan = clanId;
  out.practice = `${def.name} · AI clan village`;
  return out;
}

/** Highest Training Dojo level a Keep level allows. */
function maxDojoAt(hall: number, data: GameData): number {
  return data.hall.levels[Math.max(1, Math.min(data.hall.levels.length, hall)) - 1]?.limits.burrow_barracks?.maxLevel ?? 1;
}

/**
 * A clan's raiding army at a Keep level: the same housing as the generic bot
 * army, split by the clan's combat style among warriors that Keep can field.
 */
export function clanArmy(clanId: string, hall: number, bias: number, data: GameData): Record<string, number> {
  const def = clanDef(data, clanId);
  const dojo = maxDojoAt(hall, data);
  const mix = Object.entries(def.army).filter(([t]) => data.troops[t] && troopDef(data, t).barracksLevel <= dojo);
  const sum = mix.reduce((a, [, v]) => a + v, 0);
  const housing = Math.floor(maxHousingAtHall(hall, data) * (0.85 + 0.15 * bias));
  const army: Record<string, number> = {};
  if (!mix.length || sum <= 0) return army;
  let used = 0;
  for (const [t, share] of mix) {
    const h = troopDef(data, t).housing;
    const n = Math.floor((housing * share) / sum / h);
    if (n > 0) {
      army[t] = n;
      used += n * h;
    }
  }
  const filler = mix.map(([t]) => t).sort((a, b) => troopDef(data, a).housing - troopDef(data, b).housing)[0];
  const extra = Math.floor((housing - used) / troopDef(data, filler).housing);
  if (extra > 0) army[filler] = (army[filler] ?? 0) + extra;
  return army;
}

/**
 * The tutorial raid: a small, half-built Bamboo Clan outpost three Shinobi
 * can take. Its Kunai Tower is still weak (power below 1), and it says so.
 */
export function firstRaidBase(data: GameData): BaseLayout {
  const fr = data.clans.firstRaid;
  const def = clanDef(data, fr.clan);
  const c = Math.floor(data.economy.mapSize / 2);
  const buildings: BaseBuilding[] = [
    { id: 'o1', type: 'elder_toadstool', level: 1, x: c - 2, y: c - 2 },
    { id: 'o2', type: 'acorn_cannon', level: 1, x: c + 4, y: c + 4 },
    { id: 'o3', type: 'acorn_orchard', level: 1, x: c - 7, y: c - 2 },
    { id: 'o4', type: 'dewdrop_well', level: 1, x: c - 2, y: c - 7 },
    { id: 'o5', type: 'acorn_silo', level: 1, x: c + 3, y: c - 6 },
  ];
  const holders: Record<ResourceKind, string[]> = { acorns: ['o3', 'o5', 'o1'], dew: ['o4', 'o1'], nightsap: [], moonstones: [] };
  for (const [k, total] of Object.entries(fr.loot as Cost) as [ResourceKind, number][]) {
    const ids = holders[k];
    if (!ids?.length) continue;
    const each = Math.floor(total / ids.length);
    ids.forEach((id, i) => {
      const b = buildings.find((x) => x.id === id)!;
      b.loot = { ...(b.loot ?? {}), [k]: each + (i === 0 ? total - each * ids.length : 0) };
    });
  }
  return { name: fr.name, hallLevel: 1, buildings, trophies: 0, clan: def.id, practice: `${def.name} · AI training outpost (its tower is half-built)`, power: fr.power };
}
