/**
 * Base rules shared by PvP and the server-held village (quality 22): loot caps on an uploaded or
 * rebuilt base and the Base Rating reset after a big layout change. In their own module so
 * `core/village.ts` does not import `core/pvp.ts` back (pvp.ts re-exports both).
 */
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import { buildingDef, levelDef } from '../../src/gameplay/sim/data';
import { storageLootCap } from '../../src/gameplay/sim/defense';
import { layoutChangedShare, newRating, type Rating } from '../../src/gameplay/sim/rating';
import type { GameData, ResourceKind } from '../../src/gameplay/sim/types';
import type { Player } from '../repo';
import type { ServerContext } from './context';

/** A collector holds what it produces; a storage (or the Keep) holds what it stores. Jade is never loot. */
function canHoldLoot(type: string, level: number, k: ResourceKind, data: GameData): boolean {
  if (k === 'moonstones') return false;
  const def = buildingDef(data, type);
  if (def.produces === k) return true;
  return (levelDef(data, type, level)?.storage?.[k] ?? 0) > 0;
}

/**
 * Clamp loot to what the rules allow: storages give at most the hall level's
 * storage loot cap, collectors at most their raidable share of a full
 * collector. Mutates and returns the base.
 */
export function capBaseLoot(base: BaseLayout, data: GameData): BaseLayout {
  const hall = base.buildings.find((b) => data.buildings[b.type]?.category === 'hall');
  const hl = hall?.level ?? 1;
  base.hallLevel = hl;
  const storeCap = storageLootCap(hl, data);
  const fromStores: Record<string, number> = {};
  for (const b of base.buildings) {
    const def = buildingDef(data, b.type);
    const loot = b.loot ?? {};
    for (const k of Object.keys(loot) as ResourceKind[]) {
      if (!canHoldLoot(b.type, b.level, k, data)) {
        delete loot[k];
        continue;
      }
      if (def.produces === k) {
        const ld = levelDef(data, b.type, b.level);
        const max = Math.floor((ld?.ratePerHour ?? 0) * data.economy.collectorHoursCap * data.economy.raidableUncollectedFraction);
        loot[k] = Math.min(loot[k] ?? 0, max);
      } else {
        fromStores[k] = (fromStores[k] ?? 0) + (loot[k] ?? 0);
      }
    }
  }
  for (const [k, total] of Object.entries(fromStores)) {
    if (total <= storeCap) continue;
    const scale = storeCap / total;
    for (const b of base.buildings) {
      const def = buildingDef(data, b.type);
      const loot = b.loot as Record<string, number> | undefined;
      if (!loot || def.produces === k || !loot[k]) continue;
      loot[k] = Math.floor(loot[k] * scale);
    }
  }
  return base;
}

/**
 * Step 30: a base whose layout changed by more than layoutResetShare starts
 * its Base Rating over (so a strong rating cannot hide a weak new layout).
 */
export function layoutReset(ctx: ServerContext, me: Player, next: BaseLayout): { ratings: { attack: Rating; base: Rating } } | Record<string, never> {
  if (!me.ratings || !me.base) return {};
  if (layoutChangedShare(me.base, next) <= ctx.data.ranks.rating.layoutResetShare) return {};
  return { ratings: { attack: me.ratings.attack, base: newRating(ctx.now(), ctx.data.ranks.rating) } };
}
