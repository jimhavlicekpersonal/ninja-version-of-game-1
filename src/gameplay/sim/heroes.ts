/**
 * Heroes (state-of-the-game report, section 5 step 8, growth 5; SIM_RULES 5). The Shadow Captain joins
 * every attack from his `unlockKeep` for free: never trained, no housing, one per battle, his level set by
 * the Keep (Keep 7 = level 1). Stats and the Rally aura are in `battle.json` `heroes`; the art is code-drawn
 * until a human artist paints him (report section 6).
 *
 * Hero Hall (content batch 2026-11-14, behind `data.features.heroChoice`, off in the shipped data): with a
 * Hero Hall (`hero_shrine`) built, the player chooses one unlocked hero (`chooseHero`, `VillageState.hero`,
 * save v23). Since P4-10 the Hall's level decides which heroes can be chosen and never caps the hero's level. Without the feature, or without a Hall,
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

/**
 * Heroes the player may choose now (hero choice on, a Hero Hall built, the Keep high enough). P4-10 (BNL-11): the
 * Hall's level decides which heroes can be chosen (`economy.heroHallLevels`, by the heroes' unlock order); it never
 * caps a chosen hero's level, which used to make choosing the Captain with a level 1 Hall weaker than letting the Keep
 * choose.
 */
export function choosableHeroes(state: VillageState, data: GameData): string[] {
  const hall = heroHallLevel(state, data);
  if (!data.features?.heroChoice || hall <= 0) return [];
  const keep = hallLevel(state, data);
  const needs = data.economy.heroHallLevels ?? [];
  const order = Object.entries(data.battle.heroes ?? {}).sort(([a, x], [b, y]) => x.unlockKeep - y.unlockKeep || (a < b ? -1 : a > b ? 1 : 0)); // review #11: no locale-dependent sort
  return order.filter(([, d], i) => keep >= d.unlockKeep && hall >= (needs[i] ?? needs[needs.length - 1] ?? 1)).map(([id]) => id);
}

export function heroFor(state: VillageState, data: GameData): { id: string; level: number } | null {
  const keep = hallLevel(state, data);
  const chosen = state.hero?.chosen;
  if (chosen && choosableHeroes(state, data).includes(chosen)) return { id: chosen, level: keepLevelOf(data.battle.heroes![chosen], keep) };
  return heroAtKeep(keep, data);
}
