/**
 * Troop research: the attacking side's vertical progression. Each troop has
 * levels in troops.json; the Clan Keep level caps how far research can go
 * (hall.json `troopLevelCap`) and how many researches run at once
 * (`researchLanes`, one per troop type). Research runs in the Training Dojo
 * and does not need an artisan. Finished research applies to every troop of
 * that type at once, including ones already trained.
 */
import { barracksLevel } from './army';
import { MS_PER_SECOND } from './clock';
import { maxTroopLevel, troopDef, troopLevel } from './data';
import type { Cost, GameData, ResearchState, VillageState } from './types';

export function emptyResearch(): ResearchState {
  return { levels: {}, active: [] };
}

/** How many researches can run at once at a Keep level. */
export function researchLanes(hallLevel: number, data: GameData): number {
  const levels = data.hall.levels;
  return Math.max(1, levels[Math.max(1, Math.min(levels.length, hallLevel)) - 1]?.researchLanes ?? 1);
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
  if (!def) return { ok: false, code: 'NOT_FOUND', message: 'Unknown warrior.' };
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
  const active = state.research.active;
  if (active.some((a) => a.troop === troop)) return { ok: false, code: 'BUSY', message: `${def.name} is already being researched.`, ...base };
  const lanes = researchLanes(hallLevel, data);
  if (active.length >= lanes) {
    const what = active.map((a) => troopDef(data, a.troop).name).join(' and ');
    return { ok: false, code: 'BUSY', message: lanes > 1 ? `All ${lanes} research lanes are busy (${what}).` : `The Dojo is already researching ${what}.`, ...base };
  }
  return { ok: true, ...base };
}

/** Start research (caller has checked the quote and paid). Mutates. */
export function startResearch(state: VillageState, troop: string, toLevel: number, cost: Cost, seconds: number, now: number): void {
  state.research.active.push({ troop, toLevel, startedAt: now, endsAt: now + seconds * MS_PER_SECOND, cost });
}

/** Apply every research whose timer has ended. Mutates. Returns what finished. */
export function finishResearch(state: VillageState, now: number): { troop: string; level: number }[] {
  const done: { troop: string; level: number }[] = [];
  const active = state.research?.active ?? [];
  state.research.active = active.filter((a) => {
    if (a.endsAt > now) return true;
    state.research.levels[a.troop] = a.toLevel;
    done.push({ troop: a.troop, level: a.toLevel });
    return false;
  });
  if (done.length && state.stats) state.stats.researchDone = (state.stats.researchDone ?? 0) + done.length;
  return done;
}
