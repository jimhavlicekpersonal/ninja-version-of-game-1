/**
 * Keep seals (P5-08, PAC-11): when every building a Keep allows is built to that Keep's cap (the `hall.json` limits:
 * every allowed copy, each at the Keep's highest level), the Keep earns its seal: a fixed Keep-scaled reward paid
 * once (`hall.json` `seal`) and a mark on the Keep sheet. A medium-horizon goal from data that already exists and a
 * quiet pull against hollow Keep rushing that forces nothing. Claimed with `claimKeepSeal` (the server replays it);
 * the claimed Keeps are kept in `VillageState.seals` (save v24, optional).
 */
import { scaleReward } from './economy';
import { hallLevel } from './keep';
import type { Cost, GameData, VillageState } from './types';

export interface SealProgress {
  keep: number;
  /** Buildings counted (every allowed copy of every allowed type, the Keep itself included). */
  total: number;
  /** Of those, built and at the cap (a building mid-upgrade counts at the level it has). */
  done: number;
  sealed: boolean;
  /** Ready to claim. */
  ready: boolean;
  reward: Cost;
}

/** The current Keep's seal: how many of its allowed buildings are at the cap, whether it is claimed, what it pays. */
export function sealProgress(state: VillageState, data: GameData): SealProgress | null {
  const def = data.hall.seal;
  if (!def) return null;
  const keep = hallLevel(state, data);
  const limits = data.hall.levels[Math.min(data.hall.levels.length, keep) - 1]?.limits ?? {};
  let total = 1;
  let done = 1; // the Keep is at its own level
  for (const [type, lim] of Object.entries(limits)) {
    const bdef = data.buildings[type];
    if (!bdef || bdef.category === 'hall' || bdef.category === 'obstacle' || bdef.category === 'decor' || !lim.count) continue;
    const cap = Math.min(lim.maxLevel ?? 1, bdef.levels.length);
    const levels = state.buildings.filter((b) => b.type === type).map((b) => b.level).sort((a, b) => b - a);
    total += lim.count;
    for (let i = 0; i < lim.count; i++) if ((levels[i] ?? 0) >= cap) done++;
  }
  const sealed = (state.seals ?? []).includes(keep);
  return { keep, total, done, sealed, ready: !sealed && done >= total, reward: scaleReward(def.reward, keep, data) };
}
