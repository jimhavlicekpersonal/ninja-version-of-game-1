/**
 * Beast Mode 2026-11-21 STB-07: which painted textures a battle against a base can need, so they are painted in
 * slices before the battle opens instead of in one frame at open (building looks) or mid-battle (ruins). Pure: no
 * Phaser, so the planner is tested on its own; `battlePrepaint.ts` paints what it lists.
 */
import type { RuinFamily } from '../art/ninja';

/** Ruin family by building type (`art/ninja.ts` `paintRuins`). */
export function ruinFamily(kind: string, type: string): RuinFamily {
  if (kind === 'hall') return 'keep';
  if (kind === 'defense') return 'tower';
  if (type === 'acorn_silo' || type === 'dew_cistern') return 'store';
  return 'house';
}

/** The painted key of one building level (`Keys.buildingLevel`). */
export const levelKey = (type: string, level: number) => `building.${type}.lv${level}`;
/** The painted key of a family's ruins at a footprint size (`fx.ts` `ruinTexture`). */
export const ruinKey = (size: number, family: RuinFamily) => `rubble.${size}.${family}`;

export interface BattleTexturePlan {
  levels: { type: string; level: number; size: number; key: string }[];
  ruins: { size: number; family: RuinFamily; key: string }[];
}

/**
 * Every building-level look and every ruin a battle against these buildings can show. Under construction (level 0)
 * uses the shared construction texture, walls (`hedge`) the generic rubble and traps leave no ruin.
 */
export function battleTextureKeys(buildings: readonly { type: string; level: number; size: number; kind: string }[]): BattleTexturePlan {
  const levels = new Map<string, BattleTexturePlan['levels'][number]>();
  const ruins = new Map<string, BattleTexturePlan['ruins'][number]>();
  for (const b of buildings) {
    if (b.level >= 1) {
      const key = levelKey(b.type, b.level);
      if (!levels.has(key)) levels.set(key, { type: b.type, level: b.level, size: b.size, key });
    }
    if (b.kind === 'hedge' || b.kind === 'trap') continue;
    const family = ruinFamily(b.kind, b.type);
    const key = ruinKey(b.size, family);
    if (!ruins.has(key)) ruins.set(key, { size: b.size, family, key });
  }
  return { levels: [...levels.values()], ruins: [...ruins.values()] };
}
