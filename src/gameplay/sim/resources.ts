import { MS_PER_HOUR } from './clock';
import { buildingDef, levelDef } from './data';
import type { Building, Cost, GameData, ResourceKind, Resources, VillageState } from './types';
import { RESOURCE_KINDS } from './types';

/** The level a building has at `now`, counting an upgrade whose timer has already ended. */
export function effectiveLevel(b: Building, now: number): number {
  return b.upgrade && now >= b.upgrade.endsAt ? b.upgrade.toLevel : b.level;
}

/** How much of each resource the village can hold. Moonstones are uncapped. */
export function capacity(state: VillageState, data: GameData): Resources {
  const cap: Resources = { acorns: 0, dew: 0, nightsap: 0, moonstones: Number.POSITIVE_INFINITY };
  for (const b of state.buildings) {
    if (b.level < 1) continue;
    const store = levelDef(data, b.type, b.level)?.storage;
    if (!store) continue;
    for (const k of RESOURCE_KINDS) {
      if (k === 'moonstones') continue;
      cap[k] += store[k] ?? 0;
    }
  }
  return cap;
}

export function collectorRatePerHour(b: Building, level: number, data: GameData): number {
  return level >= 1 ? (levelDef(data, b.type, level)?.ratePerHour ?? 0) : 0;
}

export function collectorCapacity(b: Building, level: number, data: GameData): number {
  return collectorRatePerHour(b, level, data) * data.economy.collectorHoursCap;
}

/** Resources waiting in a collector at `now` (fractional; floor before moving to storage). */
export function collectorAmount(b: Building, now: number, data: GameData): number {
  if (!b.collector) return 0;
  const level = effectiveLevel(b, now);
  if (level < 1) return 0;
  const rate = collectorRatePerHour(b, level, data);
  const cap = rate * data.economy.collectorHoursCap;
  const produced = (rate * Math.max(0, now - b.collector.accrueFrom)) / MS_PER_HOUR;
  return Math.min(cap, b.collector.stored + produced);
}

export function producedResource(b: Building, data: GameData): ResourceKind | undefined {
  return buildingDef(data, b.type).produces;
}

export function canAfford(res: Resources, cost: Cost): boolean {
  return RESOURCE_KINDS.every((k) => res[k] >= (cost[k] ?? 0));
}

export function missingFor(res: Resources, cost: Cost): Cost {
  const out: Cost = {};
  for (const k of RESOURCE_KINDS) {
    const short = (cost[k] ?? 0) - res[k];
    if (short > 0) out[k] = short;
  }
  return out;
}

export function subtractCost(res: Resources, cost: Cost): void {
  for (const k of RESOURCE_KINDS) res[k] -= cost[k] ?? 0;
}

/** Adds resources, capped by storage. Returns what was actually added. */
export function addCapped(res: Resources, add: Cost, cap: Resources): Cost {
  const added: Cost = {};
  for (const k of RESOURCE_KINDS) {
    const want = add[k] ?? 0;
    if (want <= 0) continue;
    const room = Math.max(0, cap[k] - res[k]);
    const take = Math.min(want, room);
    res[k] += take;
    added[k] = take;
  }
  return added;
}
