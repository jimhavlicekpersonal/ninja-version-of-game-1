/**
 * Scouting: what an attacker can learn about a base before committing, and
 * which tactic the layout calls for. Hidden traps are never revealed.
 */
import { buildingDef } from '../data';
import type { GameData } from '../types';
import { activeInBattle, type BaseLayout } from './types';
import { baseProfile, type TemperProfile } from './temper';

export interface ScoutReport {
  /** Visible defenses by building type. */
  defenses: Record<string, number>;
  walls: number;
  /** Pairs of defenses that cover each other (each inside the other's range). */
  coveringPairs: number;
  hasAntiAir: boolean;
  hasSplash: boolean;
  /** Traps unlock at this hall; the report only says they may exist. */
  mayHaveTraps: boolean;
  /** Visible counter buildings (support buildings and counter defenses) by type. Hidden traps are not listed. */
  counters: Record<string, number>;
  /**
   * Tempering (SIM_RULES 6): the base's mean temper per axis (0..1), always shown at scouting so an
   * attacker answers the shape of the base. All zeros for an untempered base.
   */
  profile: TemperProfile;
  /** Short tactical advice, most important first (at most 3). */
  tips: string[];
}

/** An axis counts as the base's leaning from this mean temper. */
const LEANING = 0.3;

export function scoutReport(base: BaseLayout, data: GameData): ScoutReport {
  const defenses: Record<string, number> = {};
  const counters: Record<string, number> = {};
  const centres: { type: string; x: number; y: number; range: number }[] = [];
  let walls = 0;
  let hasAntiAir = false;
  let hasSplash = false;
  let trapsUnlocked = false;
  for (const b of base.buildings) {
    const def = buildingDef(data, b.type);
    if (def.category === 'hedge') walls++;
    if (def.category === 'trap') trapsUnlocked = true;
    // Buildings being upgraded take no part in the battle, so scouting doesn't count them as threats.
    if (!activeInBattle(b)) continue;
    if (def.effect && def.category !== 'trap') counters[b.type] = (counters[b.type] ?? 0) + 1;
    if (def.category !== 'defense' || !def.combat) continue;
    defenses[b.type] = (defenses[b.type] ?? 0) + 1;
    if (def.combat.targets !== 'ground') hasAntiAir = true;
    if (def.combat.splashRadius) hasSplash = true;
    centres.push({ type: b.type, x: b.x + def.size / 2, y: b.y + def.size / 2, range: def.combat.range });
  }
  // Traps are hidden: say they may exist once the hall level allows them.
  const firstTrapLevel = data.hall.levels.findIndex((l) => Object.entries(l.limits).some(([t, lim]) => data.buildings[t]?.category === 'trap' && lim.count > 0)) + 1;
  const mayHaveTraps = trapsUnlocked || (firstTrapLevel > 0 && base.hallLevel >= firstTrapLevel);
  let coveringPairs = 0;
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const a = centres[i];
      const b = centres[j];
      const d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      if (d <= a.range && d <= b.range) coveringPairs++;
    }
  }
  const tips: string[] = [];
  const total = centres.length;
  // Tempering and counter buildings change which warriors work, so they come first.
  const has = (kind: string) => Object.keys(counters).some((t) => data.buildings[t].effect?.kind === kind);
  // The base's tempered leaning: its strongest first, any other after the counters.
  const profile = baseProfile(base, data);
  const leanings = (['reach', 'blast', 'watch'] as const).filter((a) => profile[a] >= LEANING).sort((a, b) => profile[b] - profile[a]);
  const leaningTip: Record<(typeof leanings)[number], string> = {
    reach: 'Towers tempered for Reach shoot far and pick off back-line warriors first, but hit softer: close in fast.',
    blast: 'Towers tempered for Blast splash groups but fire slowly: spread your squad out.',
    watch: 'Towers tempered to Watch make the Sky Bow Tower, Bitter Smoke Brazier and traps stronger: keep your squad on the ground.',
  };
  if (leanings.length) tips.push(leaningTip[leanings[0]]);
  if (has('counter_artillery')) tips.push('A Longbow Yagura outranges siege warriors but is blind up close: rush it with melee first.');
  if (has('ground_flyers')) tips.push('A Kite-Cutter Ballista grounds flyers: take it out before sending kites.');
  if (has('shorten_disables')) tips.push('A Repair Crane cuts jams short: destroy it, or jam defenses out of its reach.');
  if (has('anti_heal')) tips.push('Bitter Incense weakens healing and auras near it: fight away from it, or break it first.');
  for (const a of leanings.slice(1)) tips.push(leaningTip[a]);
  if (total === 0) tips.push('No working defenses: any squad will do.');
  if (coveringPairs >= 2) tips.push('Defenses cover each other: jam one with a Saboteur, and throw smoke over your squad as it walks into the others\' range.');
  else if (total > 0 && coveringPairs === 0) tips.push('Defenses stand alone: pick them off one at a time.');
  if (hasSplash) tips.push('A Firework Mortar splashes groups and is blind up close: jam it or spread out.');
  if (walls >= 20) tips.push('Thick walls: Saboteurs and Tunnel Runners slip past; Guardians break through.');
  if (!hasAntiAir && total > 0) tips.push('No anti-air: Kite Raiders fly in safely.');
  if (mayHaveTraps) tips.push('Spike Pits and Caltrops may be hidden on the paths.');
  return { defenses, counters, walls, coveringPairs, hasAntiAir, hasSplash, mayHaveTraps, profile, tips: tips.slice(0, 3) };
}

export interface PointIntel {
  label: string;
  /** Visible defenses whose range covers the walk from this point to the Keep. */
  defenses: number;
  /** Some of them can hit flyers. */
  antiAir: boolean;
  /** Some of them splash (bad news for clumped squads). */
  splash: boolean;
}

/** Distance from (px, py) to the segment (ax, ay)-(bx, by). */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * What each infiltration point leads into: the visible defenses that can shoot
 * along the straight walk from the point to the Keep. A central defense covers
 * several paths; hidden traps are never counted.
 */
export function pointIntel(points: { label: string; x: number; y: number }[], base: BaseLayout, data: GameData): PointIntel[] {
  const hall = base.buildings.find((b) => buildingDef(data, b.type).category === 'hall');
  const hallSize = hall ? buildingDef(data, hall.type).size : 0;
  const hx = hall ? hall.x + hallSize / 2 : data.economy.mapSize / 2;
  const hy = hall ? hall.y + hallSize / 2 : data.economy.mapSize / 2;
  return points.map((p) => {
    const out: PointIntel = { label: p.label, defenses: 0, antiAir: false, splash: false };
    for (const b of base.buildings) {
      const def = buildingDef(data, b.type);
      if (def.category !== 'defense' || !def.combat || !activeInBattle(b)) continue;
      if (toSegment(b.x + def.size / 2, b.y + def.size / 2, p.x, p.y, hx, hy) > def.combat.range) continue;
      out.defenses++;
      if (def.combat.targets !== 'ground') out.antiAir = true;
      if (def.combat.splashRadius) out.splash = true;
    }
    return out;
  });
}
