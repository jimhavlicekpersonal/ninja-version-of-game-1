/**
 * Scouting: what an attacker can learn about a base before committing, and
 * which tactic the layout calls for. Hidden traps are never revealed.
 */
import { buildingDef } from '../data';
import type { GameData } from '../types';
import type { BaseLayout } from './types';

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
  /** Short tactical advice, most important first (at most 3). */
  tips: string[];
}

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
  // Counter buildings change which warriors work, so they come first.
  const has = (kind: string) => Object.keys(counters).some((t) => data.buildings[t].effect?.kind === kind);
  if (has('counter_artillery')) tips.push('A Longbow Yagura outranges siege warriors but is blind up close: rush it with melee first.');
  if (has('ground_flyers')) tips.push('A Kite-Cutter Ballista grounds flyers: take it out before sending kites.');
  if (has('shorten_disables')) tips.push('A Repair Crane cuts jams short: destroy it, or jam defenses out of its reach.');
  if (has('anti_heal')) tips.push('Bitter Incense weakens healing and auras near it: fight away from it, or break it first.');
  if (total === 0) tips.push('No working defenses: any squad will do.');
  if (coveringPairs >= 2) tips.push('Defenses cover each other: jam one with a Saboteur, then smoke the rest.');
  else if (total > 0 && coveringPairs === 0) tips.push('Defenses stand alone: pick them off one at a time.');
  if (hasSplash) tips.push('A Firework Mortar splashes groups and is blind up close: jam it or spread out.');
  if (walls >= 20) tips.push('Thick walls: Saboteurs and Tunnel Runners slip past; Guardians break through.');
  if (!hasAntiAir && total > 0) tips.push('No anti-air: Kite Raiders fly in safely.');
  if (mayHaveTraps) tips.push('Spike Pits and Caltrops may be hidden on the paths.');
  return { defenses, counters, walls, coveringPairs, hasAntiAir, hasSplash, mayHaveTraps, tips: tips.slice(0, 3) };
}
