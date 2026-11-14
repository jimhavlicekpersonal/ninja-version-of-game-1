/**
 * Heroes (state-of-the-game report, section 5 step 8, growth 5; SIM_RULES 5). The Shadow Captain joins
 * every attack from his `unlockKeep` for free: never trained, no housing, one per battle, his level set by
 * the Keep (Keep 7 = level 1). Stats and the Rally aura are in `battle.json` `heroes`; the art is code-drawn
 * until a human artist paints him (report section 6).
 *
 * Hero Hall (content batch 2026-11-14, behind `data.features.heroChoice`, off in the shipped data): with a
 * Hero Hall (`hero_shrine`) built, the player chooses one unlocked hero (`chooseHero`, `VillageState.hero`,
 * save v23); the hero's level is then also capped by the Hall's level. Without the feature, or without a Hall,
 * or without a valid choice, the automatic hero above joins as before.
 */
import type { GameData, VillageState } from './types';
import { hallLevel } from './keep';

export const HERO_HALL = 'hero_shrine';

function keepLevelOf(def: { unlockKeep: number; levels: unknown[] }, keep: number): number {
  return Math.max(1, Math.min(def.levels.length, keep - def.unlockKeep + 1));
}

/** The hero (and level) a Keep level brings, or null below every hero's Keep. */
export function heroAtKeep(keep: number, data: GameData): { id: string; level: number } | null {
  let best: { id: string; level: number } | null = null;
  for (const [id, def] of Object.entries(data.battle.heroes ?? {})) {
    if (keep < def.unlockKeep) continue;
    const level = keepLevelOf(def, keep);
    if (!best || def.unlockKeep < (data.battle.heroes![best.id].unlockKeep ?? 99)) best = { id, level };
  }
  return best;
}

/** The highest finished Hero Hall level in the village (0 = none). */
export function heroHallLevel(state: VillageState, data: GameData): number {
  if (!data.buildings[HERO_HALL]) return 0;
  let best = 0;
  for (const b of state.buildings) if (b.type === HERO_HALL && b.level > best) best = b.level;
  return best;
}

/** Heroes the player may choose now (hero choice on, a Hero Hall built, the Keep high enough). */
export function choosableHeroes(state: VillageState, data: GameData): string[] {
  if (!data.features?.heroChoice || heroHallLevel(state, data) <= 0) return [];
  const keep = hallLevel(state, data);
  return Object.entries(data.battle.heroes ?? {}).filter(([, d]) => keep >= d.unlockKeep).map(([id]) => id);
}

export function heroFor(state: VillageState, data: GameData): { id: string; level: number } | null {
  const keep = hallLevel(state, data);
  const chosen = state.hero?.chosen;
  if (chosen && choosableHeroes(state, data).includes(chosen)) {
    const def = data.battle.heroes![chosen];
    return { id: chosen, level: Math.min(keepLevelOf(def, keep), heroHallLevel(state, data)) };
  }
  return heroAtKeep(keep, data);
}
