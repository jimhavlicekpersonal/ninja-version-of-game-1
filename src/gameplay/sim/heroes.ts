/**
 * Heroes (state-of-the-game report, section 5 step 8, growth 5; SIM_RULES 5). The Shadow Captain joins
 * every attack from his `unlockKeep` for free: never trained, no housing, one per battle, his level set by
 * the Keep (Keep 7 = level 1). Stats and the Rally aura are in `battle.json` `heroes`; the art is code-drawn
 * until a human artist paints him (report section 6).
 */
import type { GameData, VillageState } from './types';
import { hallLevel } from './keep';

/** The hero (and level) a Keep level brings, or null below every hero's Keep. */
export function heroAtKeep(keep: number, data: GameData): { id: string; level: number } | null {
  let best: { id: string; level: number } | null = null;
  for (const [id, def] of Object.entries(data.battle.heroes ?? {})) {
    if (keep < def.unlockKeep) continue;
    const level = Math.max(1, Math.min(def.levels.length, keep - def.unlockKeep + 1));
    if (!best || def.unlockKeep < (data.battle.heroes![best.id].unlockKeep ?? 99)) best = { id, level };
  }
  return best;
}

export function heroFor(state: VillageState, data: GameData): { id: string; level: number } | null {
  return heroAtKeep(hallLevel(state, data), data);
}
