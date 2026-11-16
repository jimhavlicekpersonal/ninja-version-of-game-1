import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { RESERVE_DELAY_TICKS, squadPlan, type Formation, type WaveOrder } from '../../../src/gameplay/control/squadPlan';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { pointAt } from '../../../src/gameplay/sim/battle/infiltration';
import type { BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';

const KEEP = 9;

function setupFor(infiltration: boolean): BattleSetup {
  const army = botArmy(KEEP, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = troopLevelCapAt(KEEP, data, t);
  return { seed: 11, base: generateOpponent(KEEP * 7919 + 3, KEEP, data), army, levels, infiltration };
}

function play(session: BattleSession): void {
  for (let i = 0; i < 4000 && !session.sim.ended; i++) session.update(100);
}

const size = (army: Record<string, number>): number => Object.values(army).reduce((a, b) => a + b, 0);

describe('squad orders', () => {
  const formations: Formation[] = ['together', 'pincer', 'file'];
  const orders: WaveOrder[] = ['tanks', 'rush', 'reserve'];

  it('plan the whole army through Infiltration Points, every step a legal placement', () => {
    const setup = setupFor(true);
    for (const formation of formations) {
      for (const order of orders) {
        const session = new BattleSession(setup, data, 'live');
        const steps = squadPlan(session.sim, { point: 2, formation, order });
        expect(steps.length, `${formation}/${order}`).toBe(size(setup.army));
        for (const s of steps) expect(pointAt(session.sim.entry!, s.x, s.y), `${formation}/${order}`).toBeGreaterThanOrEqual(0);
        expect(session.orderSquad({ point: 2, formation, order })).toBe(steps.length);
        play(session);
        expect(session.deployments.length, `${formation}/${order}`).toBe(size(setup.army));
      }
    }
  });

  it('are recorded like hand placement: the raid replays to the same result', () => {
    const setup = setupFor(true);
    const session = new BattleSession(setup, data, 'live');
    session.orderSquad({ point: 0, formation: 'together', order: 'tanks' });
    play(session);
    expect(runBattle(setup, session.deployments, data).result).toEqual(session.result());
  });

  it('differ in shape and timing', () => {
    const sim = new BattleSession(setupFor(true), data, 'live').sim;
    const points = (formation: Formation): number => new Set(squadPlan(sim, { point: 1, formation, order: 'rush' }).map((s) => pointAt(sim.entry!, s.x, s.y))).size;
    const last = (order: WaveOrder): number => Math.max(...squadPlan(sim, { point: 1, formation: 'together', order }).map((s) => s.delay));
    expect(points('pincer')).toBeGreaterThan(points('together') - 1);
    expect(squadPlan(sim, { point: 1, formation: 'file', order: 'rush' })[0]).toMatchObject({ delay: 0 });
    expect(last('rush')).toBeLessThan(last('tanks'));
    expect(last('reserve')).toBeGreaterThanOrEqual(RESERVE_DELAY_TICKS);
  });

  it('can be held: the warriors still waiting stay out', () => {
    const setup = setupFor(true);
    const session = new BattleSession(setup, data, 'live');
    session.orderSquad({ point: 3, formation: 'together', order: 'reserve' });
    for (let i = 0; i < 150; i++) session.update(100);
    expect(session.squadWaiting).toBeGreaterThan(0);
    const before = session.deployments.length;
    session.holdSquad();
    play(session);
    expect(session.squadWaiting).toBe(0);
    expect(session.deployments.length).toBe(before);
  });

  it('do nothing in a raid without Infiltration Points, or before the raid is live', () => {
    const open = new BattleSession(setupFor(false), data, 'live');
    expect(squadPlan(open.sim, { point: 0, formation: 'together', order: 'tanks' })).toEqual([]);
    expect(open.orderSquad({ point: 0, formation: 'together', order: 'tanks' })).toBe(0);
    const scouting = new BattleSession(setupFor(true), data, 'scout');
    expect(scouting.orderSquad({ point: 0, formation: 'together', order: 'tanks' })).toBe(0);
  });
});
