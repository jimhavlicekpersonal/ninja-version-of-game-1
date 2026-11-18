/**
 * P6-11 (PLY-05): live battles get the replay's speed button once every warrior is in. Speed scales real time only:
 * deployments keep their tick, so a battle watched at 2x (or 4x, or switched mid-fight) ends with the same result
 * hash and replays the same (protected item 43).
 */
import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { result, runBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';

function setupAt(keep: number): BattleSetup {
  const army = botArmy(keep, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = troopLevelCapAt(keep, data, t);
  return { seed: 4242 + keep, base: generateOpponent(keep * 7919 + 5, keep, data), army, levels, infiltration: true };
}

/** Deploy the whole army by squad order, then watch at `speeds` (switching every 3 s of real time) to the end. */
function fight(setup: BattleSetup, speeds: number[]) {
  const s = new BattleSession(structuredClone(setup), data, 'live');
  s.orderSquad({ point: 1, formation: 'together', order: 'tanks' });
  let frame = 0;
  // Frames of uneven length, as a phone gives them.
  for (let i = 0; i < 20000 && !s.sim.ended; i++) {
    s.speed = speeds[Math.floor(i / 180) % speeds.length];
    s.update(16 + (i % 3) * 9);
    frame++;
  }
  expect(s.sim.ended).toBe(true);
  return { res: result(s.sim), deployments: s.deployments, frame };
}

describe('watching a live battle faster (P6-11)', () => {
  for (const keep of [5, 12]) {
    it(`at Keep ${keep}: 1x, 2x, 4x and a switch mid-fight end with the same result hash`, () => {
      const setup = setupAt(keep);
      const one = fight(setup, [1]);
      const two = fight(setup, [2]);
      const four = fight(setup, [4]);
      const mixed = fight(setup, [1, 2, 4, 2]);
      for (const other of [two, four, mixed]) {
        expect(other.res.hash).toBe(one.res.hash);
        expect(other.deployments).toEqual(one.deployments);
      }
      // Faster in real time.
      expect(two.frame).toBeLessThan(one.frame);
      // And the record replays to the same hash.
      expect(runBattle(structuredClone(setup), two.deployments, data).result.hash).toBe(one.res.hash);
    });
  }
});
