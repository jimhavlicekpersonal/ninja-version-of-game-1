/**
 * The daily drill (P3-07, PAC-10): after two raids a session had nothing left that paid, because every battle mode
 * spends the same warriors. Once a local day the player may fight their next Trial fortress with a full camp of their
 * own warriors, nothing spent, for a small Keep-scaled reward (`daily.drill`), labelled practice.
 *
 * `drillEnd` rebuilds the army itself, as `trialEnd` rebuilds the base: the client's army and levels are ignored.
 */
import { housingCapacity, troopUnlock } from './army';
import { localDayIndex } from './calendar';
import { troopLevelOf } from './research';
import type { GameData, VillageState } from './types';

/** The village's own mix: its army, then its training queue, then its last attack; else every warrior it can train. */
function ownMix(state: VillageState, data: GameData): Record<string, number> {
  const mix: Record<string, number> = {};
  const add = (army: Record<string, number>) => {
    for (const [t, n] of Object.entries(army)) if (data.troops[t] && n > 0 && troopUnlock(state, t, data).unlocked) mix[t] = (mix[t] ?? 0) + n * data.troops[t].housing;
  };
  add(state.army);
  if (!Object.keys(mix).length) for (const q of state.training) add({ [q.troop]: 1 });
  if (!Object.keys(mix).length) {
    const last = [...state.battleLog].reverse().find((r) => r.kind === 'attack' && !r.drill);
    if (last) add(last.setup.army);
  }
  if (!Object.keys(mix).length) for (const t of Object.keys(data.troops)) if (troopUnlock(state, t, data).unlocked) mix[t] = data.troops[t].housing;
  return mix;
}

/** A full camp of the village's own mix (housing shares), the rounding filled with its smallest warrior. Empty without camps. */
export function drillArmy(state: VillageState, data: GameData): Record<string, number> {
  const cap = housingCapacity(state, data);
  const mix = ownMix(state, data);
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  const army: Record<string, number> = {};
  if (cap <= 0 || total <= 0) return army;
  let used = 0;
  for (const t of Object.keys(mix).sort()) {
    const h = data.troops[t].housing;
    const n = Math.floor((cap * mix[t]) / total / h);
    if (n > 0) {
      army[t] = n;
      used += n * h;
    }
  }
  const filler = Object.keys(mix).sort((a, b) => data.troops[a].housing - data.troops[b].housing || a.localeCompare(b))[0];
  const extra = Math.floor((cap - used) / data.troops[filler].housing);
  if (extra > 0) army[filler] = (army[filler] ?? 0) + extra;
  return army;
}

/** The drill army's levels: the village's researched levels. */
export function drillLevels(army: Record<string, number>, state: VillageState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of Object.keys(army)) out[t] = troopLevelOf(state, t);
  return out;
}

/** Whether today's drill reward is still to be paid (local day). */
export function drillAvailable(state: VillageState, now: number, data: GameData): boolean {
  return Boolean(data.daily.drill) && (state.drill?.day ?? -1) < localDayIndex(state, now, data);
}
