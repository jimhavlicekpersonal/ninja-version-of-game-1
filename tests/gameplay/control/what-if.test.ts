/**
 * P6-02 (CMB-02): the post-raid review is a real battle. Its numbers equal a battle fought with the review's
 * deployments, through the point it names; reviewing the point the raid used gives the raid's own result.
 */
import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { WhatIfRun, whatIfDeployments } from '../../../src/gameplay/control/whatIf';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { pointAt } from '../../../src/gameplay/sim/battle/infiltration';
import type { BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';

function raid(keep: number) {
  const army = botArmy(keep, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = troopLevelCapAt(keep, data, t);
  const setup: BattleSetup = { seed: 77 + keep, base: generateOpponent(keep * 7919 + 13, keep, data), army, levels, infiltration: true };
  const s = new BattleSession(structuredClone(setup), data, 'live');
  s.orderSquad({ point: 0, formation: 'file', order: 'tanks' });
  for (let i = 0; i < 6000 && !s.sim.ended; i++) s.update(100);
  return { setup, deployments: s.deployments, result: s.result() };
}

describe('the post-raid review (P6-02)', () => {
  const { setup, deployments, result } = raid(9);
  const points = createBattle(structuredClone(setup), data).entry!.points.length;

  it("reviewing the point of a one-point raid gives the raid's own result", () => {
    // A raid that fits one point (its cover): the review of that point moves nobody.
    const entry = createBattle(structuredClone(setup), data).entry!;
    const one = deployments.filter((d) => pointAt(entry, d.x, d.y) === 0);
    expect(whatIfDeployments(setup, one, 0, data)).toEqual(one.map((d) => ({ tick: d.tick, troop: d.troop, x: d.x, y: d.y })));
    const own = runBattle(structuredClone(setup), one, data).result;
    const run = new WhatIfRun(setup, one, 0, data);
    while (!run.advance(50));
    expect(run.outcome().result.hash).toBe(own.hash);
    // And the raid itself replays (the review starts from the same seed and setup).
    expect(runBattle(structuredClone(setup), deployments, data).result.hash).toBe(result.hash);
  });

  it('every other point: the numbers equal a real battle with those deployments, all through that point', () => {
    const entry = createBattle(structuredClone(setup), data).entry!;
    for (let p = 1; p < points; p++) {
      const run = new WhatIfRun(setup, deployments, p, data);
      let slices = 0;
      while (!run.advance(40)) slices++;
      expect(slices).toBeGreaterThan(3);
      const real = runBattle(structuredClone(setup), whatIfDeployments(setup, deployments, p, data), data).result;
      expect(run.outcome().result).toEqual(real);
      for (const d of run.deployments) if (data.troops[d.troop]) expect(pointAt(entry, d.x, d.y)).toBe(p);
      const o = run.outcome();
      expect(o.sent).toBeGreaterThan(0);
      expect(o.sent).toBeLessThanOrEqual(o.total);
    }
  });
});
