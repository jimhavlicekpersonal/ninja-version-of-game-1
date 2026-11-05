/**
 * Matched raids (design re-audit, Nov 2026): what a player whose honor has fallen
 * to their earned-power floor meets, and how an unplanned attack goes. A village at
 * a Keep, its warriors `lag` research levels behind the Keep's caps, fields either
 * the raid bots' mix or the explorer mix (each family's newest warrior), scouts with
 * `opponentFor` (the real matchmaking) and attacks with the bot plan.
 *
 * Long campaigns (`npm run balance:campaign`) measure the same thing over a whole
 * career; this is the fast slice `tests/gameplay/balance/matched.test.ts` gates.
 */
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { createBattle, deploymentsByTick, result as battleResult, step } from '../../src/gameplay/sim/battle/battle';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { botArmy, opponentFor } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData, VillageState } from '../../src/gameplay/sim/types';
import { createNewVillage } from '../../src/gameplay/sim/village';
import rosterData from '../../src/gameplay/data/roster.json';
import { newestInFamily, troopKeep, type Family } from './armyLab';

export const EXPLORER_MIX: [Family, number][] = [['melee', 0.35], ['artillery', 0.25], ['support', 0.1], ['siege', 0.1], ['shadow', 0.1], ['air', 0.1]];

/** The explorer's army at a Keep: each family's newest warrior, by housing share. */
export function explorerArmy(keep: number, data: GameData = defaultData): Record<string, number> {
  const housing = maxHousingAtHall(keep, data);
  const army: Record<string, number> = {};
  for (const [f, share] of EXPLORER_MIX) {
    const t = newestInFamily(f, keep, 1, data)[0];
    if (!t) continue;
    const n = Math.floor((housing * share) / data.troops[t].housing);
    if (n > 0) army[t] = (army[t] ?? 0) + n;
  }
  return army;
}

/** The newest unlocked warrior of a roster role at a Keep. */
export function newestOfRole(role: string, keep: number, data: GameData = defaultData): string | undefined {
  let best: string | undefined;
  for (const w of rosterData.warriors as { role: string; liveTroop?: string }[]) {
    const t = w.liveTroop;
    if (w.role !== role || !t || !data.troops[t] || troopKeep(t, data) > keep) continue;
    if (!best || troopKeep(t, data) > troopKeep(best, data)) best = t;
  }
  return best;
}

/** Explorer with a core: a tank, blades and throwers (what the Army panel suggests), plus each other family's newest. */
export function coreExplorerArmy(keep: number, data: GameData = defaultData): Record<string, number> {
  const housing = maxHousingAtHall(keep, data);
  const parts: [string | undefined, number][] = [[newestOfRole('guardian', keep, data), 0.2], [newestOfRole('blade', keep, data), 0.2], [newestInFamily('artillery', keep, 1, data)[0], 0.2]];
  for (const f of ['support', 'siege', 'shadow', 'air'] as Family[]) parts.push([newestInFamily(f, keep, 1, data)[0], 0.1]);
  const army: Record<string, number> = {};
  for (const [t, share] of parts) {
    if (!t) continue;
    const n = Math.floor((housing * share) / data.troops[t].housing);
    if (n > 0) army[t] = (army[t] ?? 0) + n;
  }
  return army;
}

/** One of each role's newest warrior (the roster's ten roles, equal housing). */
export function roleExplorerArmy(keep: number, data: GameData = defaultData): Record<string, number> {
  const housing = maxHousingAtHall(keep, data);
  const byRole = new Map<string, string>();
  const roster = rosterData.warriors as { role: string; liveTroop?: string }[];
  for (const w of roster) {
    const t = w.liveTroop;
    if (!t || !data.troops[t] || troopKeep(t, data) > keep) continue;
    const cur = byRole.get(w.role);
    if (!cur || troopKeep(t, data) > troopKeep(cur, data)) byRole.set(w.role, t);
  }
  const army: Record<string, number> = {};
  for (const t of byRole.values()) {
    const n = Math.floor(housing / byRole.size / data.troops[t].housing);
    if (n > 0) army[t] = n;
  }
  return army;
}

export interface MatchedResult {
  keep: number;
  lag: number;
  mix: 'bots' | 'explorer' | 'roles' | 'core';
  stars: number;
  threeStar: number;
  destruction: number;
  opponentKeep: number;
  fights: number;
}

/** A village at `keep` with `army` researched `lag` levels below the Keep's caps, honor at 0 (the power floor decides). */
export function matchedVillage(keep: number, army: Record<string, number>, lag: number, data: GameData = defaultData): VillageState {
  const s = createNewVillage(Date.UTC(2026, 0, 5), data);
  for (const b of s.buildings) if (data.buildings[b.type].category === 'hall') b.level = keep;
  s.army = { ...army };
  s.trophies = 0;
  for (const t of Object.keys(army)) s.research.levels[t] = Math.max(1, troopLevelCapAt(keep, data, t) - lag);
  return s;
}

export function matchedRaids(keep: number, lag: number, mix: 'bots' | 'explorer' | 'roles' | 'core', seeds: number, data: GameData = defaultData): MatchedResult {
  const army = mix === 'bots' ? botArmy(keep, 1, data) : mix === 'roles' ? roleExplorerArmy(keep, data) : mix === 'core' ? coreExplorerArmy(keep, data) : explorerArmy(keep, data);
  const state = matchedVillage(keep, army, lag, data);
  const levels = { ...state.research.levels };
  let stars = 0;
  let three = 0;
  let destruction = 0;
  let opp = 0;
  for (let i = 0; i < seeds; i++) {
    const seed = 1000 + keep * 97 + i * 7919;
    const base = opponentFor(seed, state, data);
    const setup = { seed: 77 + i, base, army, levels, infiltration: true };
    const sim = createBattle(setup, data);
    const byTick = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + i), data, levels, sim.entry));
    while (!sim.ended) step(sim, byTick.get(sim.tick));
    const r = battleResult(sim);
    stars += r.stars;
    if (r.stars === 3) three++;
    destruction += r.destruction;
    opp += base.hallLevel;
  }
  return { keep, lag, mix, stars: stars / seeds, threeStar: three / seeds, destruction: destruction / seeds, opponentKeep: opp / seeds, fights: seeds };
}
