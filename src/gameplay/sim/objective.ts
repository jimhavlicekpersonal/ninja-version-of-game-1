/**
 * The next objective (state-of-the-game report, section 5 step 8, growth 7): one thing worth doing now,
 * shown as a chip on the village screen. Pure; the HUD turns it into words and a tap.
 *
 * In order: a free chest waiting, a full army (raid), a free builder with an upgrade the village can pay
 * for (the Keep first when it is affordable, else the cheapest), the shortfall for the cheapest upgrade
 * when nothing is affordable, or when the next builder is free. Never an offer, never anything paid.
 */
import { armyHousing, housingCapacity } from './army';
import { chestReady } from './daily';
import { calendarView } from './calendar';
import { buildingDef, levelDef, maxDefinedLevel } from './data';
import { canAfford, missingFor } from './resources';
import type { Building, Cost, GameData, VillageState } from './types';
import { builderStatus, limitFor } from './village';

export type Objective =
  | { kind: 'chest' }
  | { kind: 'raid' }
  | { kind: 'upgrade'; buildingId: string; type: string; toLevel: number; keep: boolean }
  | { kind: 'save'; buildingId: string; type: string; toLevel: number; missing: Cost }
  | { kind: 'builders'; freeAt: number }
  | { kind: 'none' };

interface Candidate {
  b: Building;
  toLevel: number;
  cost: Cost;
  total: number;
}

/** Buildings whose next level the Keep allows now (not hedges (walls), obstacles or decor; not being worked on). */
function candidates(state: VillageState, data: GameData): Candidate[] {
  const out: Candidate[] = [];
  for (const b of state.buildings) {
    const def = buildingDef(data, b.type);
    if (!def || b.upgrade || def.category === 'obstacle' || def.category === 'decor' || def.category === 'hedge') continue;
    const next = levelDef(data, b.type, b.level + 1);
    if (!next || b.level >= maxDefinedLevel(data, b.type)) continue;
    if (next.level > limitFor(state, data, b.type).maxLevel) continue;
    const total = Object.entries(next.cost).reduce((sum, [k, v]) => sum + (k === 'moonstones' ? 1e12 : v ?? 0), 0);
    out.push({ b, toLevel: next.level, cost: next.cost, total });
  }
  return out.sort((a, c) => a.total - c.total || a.b.id.localeCompare(c.b.id));
}

/** The one thing to do next. `state` should be settled up to `now` (`advance`). */
export function nextObjective(state: VillageState, now: number, data: GameData): Objective {
  if (chestReady(state, now, data) || calendarView(state, now, 1, data)?.ready) return { kind: 'chest' };
  const cap = housingCapacity(state, data);
  if (cap > 0 && armyHousing(state.army, data) >= cap) return { kind: 'raid' };
  const list = candidates(state, data);
  const builders = builderStatus(state, data, now);
  if (builders.free > 0) {
    const affordable = list.filter((c) => canAfford(state.resources, c.cost));
    const keep = affordable.find((c) => buildingDef(data, c.b.type).category === 'hall');
    const pick = keep ?? affordable[0];
    if (pick) return { kind: 'upgrade', buildingId: pick.b.id, type: pick.b.type, toLevel: pick.toLevel, keep: Boolean(keep) };
    const cheapest = list.find((c) => !c.cost.moonstones);
    if (cheapest) return { kind: 'save', buildingId: cheapest.b.id, type: cheapest.b.type, toLevel: cheapest.toLevel, missing: missingFor(state.resources, cheapest.cost) };
  } else {
    const ends = state.buildings.map((b) => b.upgrade?.endsAt ?? Infinity).filter((t) => t > now);
    if (ends.length) return { kind: 'builders', freeAt: Math.min(...ends) };
  }
  return { kind: 'none' };
}
