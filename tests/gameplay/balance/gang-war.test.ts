/**
 * Gang War balance (roadmap step 69): model Gangs of four fight simulated
 * wars with real battles at several Keeps.
 *
 * - A coordinated relay (two strikes per base, the second starting from
 *   `relayCarry` of the first's damage) must beat the same two strikes made
 *   solo (best of two) by a clear but limited margin. Carrying all the damage
 *   3-starred nearly every base (measured 2.8-3.0★ against 1.6-2.3★), which is
 *   why only half carries over.
 * - War chests stay a modest share of raid income at every Keep, ordered
 *   win > draw > loss, with nothing random.
 */
import { describe, expect, it } from 'vitest';
import { battleDamage, createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent, totalLoot } from '../../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, BattleResult } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { scaleReward } from '../../../src/gameplay/sim/economy';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { createRng } from '../../../src/gameplay/sim/rng';
import { carryRelayDamage } from '../../../src/gameplay/sim/social/gangWar';

function strike(base: BaseLayout, keep: number, seed: number, startDamage?: Record<string, number>) {
  const army = botArmy(keep, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = Math.max(1, Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length));
  const setup = { seed, base, army, levels, infiltration: true, ...(startDamage ? { startDamage } : {}) };
  const probe = createBattle(setup, data);
  return runBattle(setup, botDeployments(probe.deployable, probe.grid.size, army, createRng(seed + 7), data, levels, probe.entry), data);
}

const better = (a: BattleResult, b: BattleResult) => (a.stars > b.stars || (a.stars === b.stars && a.destruction >= b.destruction) ? a : b);

/** A Gang of four takes on four bases: 8 strikes, solo or as 4 relays of two. */
function war(keep: number, w: number) {
  let solo = { stars: 0, destruction: 0 };
  let relay = { stars: 0, destruction: 0, three: 0 };
  for (let b = 0; b < 4; b++) {
    const base = generateOpponent(keep * 1000 + w * 10 + b, keep, data);
    for (const x of base.buildings) x.loot = {};
    const s1 = strike(base, keep, w * 100 + b * 3 + 1);
    const s2 = strike(base, keep, w * 100 + b * 3 + 2);
    const best = better(s1.result, s2.result);
    solo = { stars: solo.stars + best.stars, destruction: solo.destruction + best.destruction };
    const r2 = strike(base, keep, w * 100 + b * 3 + 2, carryRelayDamage(battleDamage(s1.sim), data)).result;
    const rb = better(r2, s1.result);
    relay = { stars: relay.stars + rb.stars, destruction: relay.destruction + rb.destruction, three: relay.three + (rb.stars === 3 ? 1 : 0) };
  }
  return { solo, relay };
}

describe('Gang War balance (step 69)', () => {
  it('a coordinated relay beats solo strikes by a clear but limited margin', { timeout: 180_000 }, () => {
    for (const keep of [4, 8, 12]) {
      let solo = { stars: 0, destruction: 0 };
      let relay = { stars: 0, destruction: 0, three: 0 };
      const wars = 2;
      for (let w = 0; w < wars; w++) {
        const r = war(keep, w);
        solo = { stars: solo.stars + r.solo.stars, destruction: solo.destruction + r.solo.destruction };
        relay = { stars: relay.stars + r.relay.stars, destruction: relay.destruction + r.relay.destruction, three: relay.three + r.relay.three };
      }
      const n = wars * 4;
      const starGain = (relay.stars - solo.stars) / n;
      const destructionGain = (relay.destruction - solo.destruction) / n;
      const label = `Keep ${keep}: relay +${starGain.toFixed(2)}★, +${destructionGain.toFixed(1)}%, three-stars ${relay.three}/${n}`;
      // Clear: coordinating is worth it. Limited: it is not a guaranteed sweep.
      expect(starGain, label).toBeGreaterThan(0.05);
      expect(destructionGain, label).toBeGreaterThan(2);
      expect(starGain, label).toBeLessThan(0.9);
      expect(relay.three / n, label).toBeLessThanOrEqual(0.75);
    }
  });

  it('war chests are fixed, ordered, and a modest share of one base worth of loot', () => {
    const r = data.social.gangWar.rewards;
    const soft = (c: { acorns?: number; dew?: number }) => (c.acorns ?? 0) + (c.dew ?? 0);
    expect(soft(r.win)).toBeGreaterThan(soft(r.draw));
    expect(soft(r.draw)).toBeGreaterThan(soft(r.loss));
    expect((r.win.moonstones ?? 0) <= data.social.groveRaid.rewards.win.moonstones!).toBe(true);
    for (const keep of [4, 6, 8, 10, 12, 15]) {
      const loot = Array.from({ length: 6 }, (_, i) => soft(totalLoot(generateOpponent(9000 + i, keep, data))));
      const avg = loot.reduce((a, b) => a + b, 0) / loot.length;
      const win = soft(scaleReward(r.win, keep, data));
      // One war a day at most: a win pays well under a single good raid's worth would compound to.
      expect(win / avg, `Keep ${keep}`).toBeGreaterThan(0.25);
      expect(win / avg, `Keep ${keep}`).toBeLessThan(1.25);
    }
  });
});
