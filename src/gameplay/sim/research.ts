/**
 * Troop research: the attacking side's vertical progression. Each troop has
 * levels in troops.json; the Elder Toadstool level caps how far research can
 * go (hall.json `troopLevelCap`). Research runs in the Burrow Barracks, one
 * troop at a time, and does not need a Beaver Builder. Finished research
 * applies to every troop of that type at once, including ones already trained.
 */
import { barracksLevel } from './army';
import { MS_PER_SECOND } from './clock';
import { maxTroopLevel, troopDef, troopLevel } from './data';
import type { Cost, GameData, ResearchState, VillageState } from './types';

export function emptyResearch(): ResearchState {
  return { levels: {}, active: null };
}

/** The researched level of a troop (1 if never researched). */
export function troopLevelOf(state: VillageState, troop: string): number {
  return Math.max(1, state.research?.levels[troop] ?? 1);
}

/** Researched levels of every troop, for a battle setup. */
export function troopLevels(state: VillageState, data: GameData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of Object.keys(data.troops)) out[t] = troopLevelOf(state, t);
  return out;
}

/** Highest troop level research can reach at an Elder Toadstool level. */
export function troopLevelCapAt(hallLevel: number, data: GameData, troop?: string): number {
  const levels = data.hall.levels;
  const cap = levels[Math.max(1, Math.min(levels.length, hallLevel)) - 1]?.troopLevelCap ?? 1;
  return Math.max(1, cap - (troop ? data.troops[troop]?.levelCapOffset ?? 0 : 0));
}

export type ResearchQuote =
  | { ok: true; toLevel: number; cost: Cost; seconds: number }
  | { ok: false; code: 'NOT_FOUND' | 'LOCKED' | 'MAX_LEVEL' | 'HALL_LEVEL_TOO_LOW' | 'BUSY'; message: string; toLevel?: number; cost?: Cost; seconds?: number };

/** What researching the next level of `troop` costs, and whether it can start (resources are checked by the caller). */
export function researchQuote(state: VillageState, troop: string, hallLevel: number, data: GameData): ResearchQuote {
  const def = data.troops[troop];
  if (!def) return { ok: false, code: 'NOT_FOUND', message: 'Unknown troop.' };
  const cur = troopLevelOf(state, troop);
  if (cur >= maxTroopLevel(data, troop)) return { ok: false, code: 'MAX_LEVEL', message: `${def.name} is fully researched.` };
  const next = troopLevel(data, troop, cur + 1);
  const r = next.research ?? { cost: {}, seconds: 0 };
  const base = { toLevel: next.level, cost: r.cost, seconds: r.seconds };
  if (hallLevel < (def.unlockKeep ?? 1)) return { ok: false, code: 'LOCKED', message: `Needs a level ${def.unlockKeep} Clan Keep.`, ...base };
  if (barracksLevel(state, data) < def.barracksLevel) return { ok: false, code: 'LOCKED', message: `Needs a level ${def.barracksLevel} Training Dojo.`, ...base };
  if (next.level > troopLevelCapAt(hallLevel, data, troop)) {
    const need = data.hall.levels.find((h) => h.troopLevelCap >= next.level + (def.levelCapOffset ?? 0))?.level;
    return { ok: false, code: 'HALL_LEVEL_TOO_LOW', message: need ? `Upgrade your Clan Keep to level ${need} to research level ${next.level}.` : `${def.name} is fully researched.`, ...base };
  }
  if (state.research.active) return { ok: false, code: 'BUSY', message: `The Dojo is already researching ${troopDef(data, state.research.active.troop).name}.`, ...base };
  return { ok: true, ...base };
}

/** Start research (caller has checked the quote and paid). Mutates. */
export function startResearch(state: VillageState, troop: string, toLevel: number, cost: Cost, seconds: number, now: number): void {
  state.research.active = { troop, toLevel, startedAt: now, endsAt: now + seconds * MS_PER_SECOND, cost };
}

/** Apply research whose timer has ended. Mutates. Returns the troop that finished, if any. */
export function finishResearch(state: VillageState, now: number): { troop: string; level: number } | null {
  const a = state.research?.active;
  if (!a || a.endsAt > now) return null;
  state.research.levels[a.troop] = a.toLevel;
  state.research.active = null;
  return { troop: a.troop, level: a.toLevel };
}
