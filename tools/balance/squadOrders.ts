/**
 * P6-01 (CMB-09): which squad orders to offer. For each of ten generated bases at Keeps 9, 12 and 15, the raid bots'
 * army at that Keep is sent through every Infiltration Point in every formation with each wave order; per base, the
 * best order is the one with the best (stars, destruction) over formations and points. "Hold a reserve" is offered
 * only if it is the best order on at least one base in five at every one of those Keeps.
 */
import { BattleSession } from '../../src/gameplay/control/battleSession';
import type { Formation, WaveOrder } from '../../src/gameplay/control/squadPlan';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { result } from '../../src/gameplay/sim/battle/battle';
import type { BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';

const FORMATIONS: Formation[] = ['together', 'pincer', 'file'];
const ORDERS: WaveOrder[] = ['tanks', 'rush', 'reserve'];

function score(setup: BattleSetup, point: number, formation: Formation, order: WaveOrder): number {
  const s = new BattleSession(structuredClone(setup), data, 'live');
  s.orderSquad({ point, formation, order });
  for (let i = 0; i < 4000 && !s.sim.ended; i++) s.update(100);
  const r = result(s.sim);
  return r.stars * 1000 + r.destruction;
}

export interface SquadOrderRow {
  keep: number;
  bases: number;
  bestBy: Record<WaveOrder, number>;
  /** Bases where this order alone is best (no tie). */
  strictBy: Record<WaveOrder, number>;
  mean: Record<WaveOrder, number>;
}

export function measureSquadOrders(keeps = [9, 12, 15], bases = 10): SquadOrderRow[] {
  const rows: SquadOrderRow[] = [];
  for (const keep of keeps) {
    const army = botArmy(keep, 1, data);
    const levels: Record<string, number> = {};
    for (const t of Object.keys(army)) levels[t] = troopLevelCapAt(keep, data, t);
    const bestBy = { tanks: 0, rush: 0, reserve: 0 } as Record<WaveOrder, number>;
    const strictBy = { tanks: 0, rush: 0, reserve: 0 } as Record<WaveOrder, number>;
    const sum = { tanks: 0, rush: 0, reserve: 0 } as Record<WaveOrder, number>;
    for (let b = 0; b < bases; b++) {
      const setup: BattleSetup = { seed: 9000 + keep * 31 + b, base: generateOpponent(keep * 104729 + b * 7919, keep, data), army, levels, infiltration: true };
      const points = new BattleSession(structuredClone(setup), data, 'live').sim.entry?.points.length ?? 1;
      const best = {} as Record<WaveOrder, number>;
      for (const order of ORDERS) {
        let top = -1;
        for (const formation of FORMATIONS) for (let p = 0; p < points; p++) top = Math.max(top, score(setup, p, formation, order));
        best[order] = top;
        sum[order] += top % 1000;
      }
      const max = Math.max(...ORDERS.map((o) => best[o]));
      // Ties count for every order that reaches the best.
      for (const o of ORDERS) if (best[o] === max) bestBy[o]++;
      const leaders = ORDERS.filter((o) => best[o] === max);
      if (leaders.length === 1) strictBy[leaders[0]]++;
    }
    rows.push({ keep, bases, bestBy, strictBy, mean: { tanks: sum.tanks / bases, rush: sum.rush / bases, reserve: sum.reserve / bases } });
  }
  return rows;
}
