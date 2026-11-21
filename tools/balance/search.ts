/**
 * Beast Mode 2026-11-21 GT-11 step 2: a deterministic searched attacker for the slow gates. It plays the game's own
 * squad orders (`BattleSession.orderSquad`: every Infiltration Point × formation × wave order) on two battle seeds
 * and keeps the best result, so a gate is judged against a competent player instead of the raid bots' one plan.
 * Reported numbers are a search over the game's own orders, not a proof that no better attack exists.
 */
import { BattleSession } from '../../src/gameplay/control/battleSession';
import type { Formation, WaveOrder } from '../../src/gameplay/control/squadPlan';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { result } from '../../src/gameplay/sim/battle/battle';
import type { BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import type { GameData } from '../../src/gameplay/sim/types';

const FORMATIONS: Formation[] = ['together', 'pincer', 'file'];
const ORDERS: WaveOrder[] = ['tanks', 'rush', 'reserve'];

export interface SearchResult {
  stars: number;
  destruction: number;
  /** How the best attack was ordered. */
  point: number;
  formation: Formation;
  order: WaveOrder;
  seed: number;
  tried: number;
}

/** The best (stars, then destruction) over every point × formation × order × seed. Deterministic. */
export function searchAttack(setup: BattleSetup, data: GameData = defaultData, seeds: number[] = [setup.seed, setup.seed + 1]): SearchResult {
  let best: SearchResult | null = null;
  let tried = 0;
  for (const seed of seeds) {
    const base = { ...setup, seed };
    const points = new BattleSession(structuredClone(base), data, 'live').sim.entry?.points.length ?? 1;
    for (let point = 0; point < points; point++) {
      for (const formation of FORMATIONS) {
        for (const order of ORDERS) {
          const s = new BattleSession(structuredClone(base), data, 'live');
          s.orderSquad({ point, formation, order });
          for (let i = 0; i < 4000 && !s.sim.ended; i++) s.update(100);
          const r = result(s.sim);
          tried++;
          if (!best || r.stars > best.stars || (r.stars === best.stars && r.destruction > best.destruction)) best = { stars: r.stars, destruction: r.destruction, point, formation, order, seed, tried: 0 };
        }
      }
    }
  }
  return { ...best!, tried };
}

/** The raid bots' army at a Keep, every warrior at that Keep's research cap. */
export function cappedArmy(keep: number, data: GameData = defaultData): { army: Record<string, number>; levels: Record<string, number> } {
  const army = botArmy(keep, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = troopLevelCapAt(keep, data, t);
  return { army, levels };
}

/** Same-Keep bases with every building at the Keep's cap (`levelBias` 1), deterministic by index. */
export function cappedBase(keep: number, index: number, data: GameData = defaultData): BattleSetup['base'] {
  return generateOpponent(keep * 104729 + index * 7919 + 13, keep, data, { levelBias: 1 });
}
