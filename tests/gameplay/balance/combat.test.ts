/**
 * Attack vs defense at matched strength, with real battles (#5, #7, #8).
 *
 * The attacker is the simple bot plan (everything from one side, toughest
 * troops first) with a full army at its hall's research cap, the same plan
 * bot raiders use against the player. A thoughtful player does better.
 */
import { describe, expect, it } from 'vitest';
import { maxHousingAtHall } from '../../../src/gameplay/sim/army';
import { createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { createRng } from '../../../src/gameplay/sim/rng';

interface Outcome {
  destruction: number;
  oneStar: number;
  threeStar: number;
}

function fight(baseHall: number, bias: number, army: Record<string, number>, level: number, n = 10): Outcome {
  let d = 0;
  let one = 0;
  let three = 0;
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, level]));
  for (let i = 0; i < n; i++) {
    const base = generateOpponent(1000 + i * 7919, baseHall, data, { levelBias: bias });
    const setup = { seed: 42 + i, base, army, levels, infiltration: true };
    const probe = createBattle(setup, data);
    const deps = botDeployments(probe.deployable, probe.grid.size, army, createRng(9 + i), data, levels, probe.entry);
    const { result } = runBattle(setup, deps, data);
    d += result.destruction;
    if (result.stars >= 1) one++;
    if (result.stars === 3) three++;
  }
  return { destruction: d / n, oneStar: one / n, threeStar: three / n };
}

describe('attack vs defense at the same hall (#5)', () => {
  for (const hall of [3, 4, 5, 6]) {
    it(`hall ${hall}: a full army usually wins, but rarely wipes out a typical base`, { timeout: 60_000 }, () => {
      const o = fight(hall, 0.5, botArmy(hall, 1, data), troopLevelCapAt(hall, data));
      // It used to be close to 100% destruction and 3 stars every time.
      expect(o.destruction).toBeGreaterThanOrEqual(45);
      expect(o.destruction).toBeLessThanOrEqual(85);
      expect(o.oneStar).toBeGreaterThanOrEqual(0.6);
      expect(o.threeStar).toBeLessThanOrEqual(0.5);
    });
  }

  it('a base a hall above is much harder', { timeout: 60_000 }, () => {
    const same = fight(4, 0.5, botArmy(4, 1, data), troopLevelCapAt(4, data));
    const above = fight(5, 0.2, botArmy(4, 1, data), troopLevelCapAt(4, data));
    expect(above.destruction).toBeLessThan(same.destruction - 15);
  });
});

describe('army make-up matters (#7)', () => {
  it('a mixed army beats the same housing of Hedgehogs alone', { timeout: 60_000 }, () => {
    for (const hall of [4, 6]) {
      const lvl = troopLevelCapAt(hall, data);
      const mixed = fight(hall, 0.5, botArmy(hall, 1, data), lvl, 8);
      const hedgehogs = fight(hall, 0.5, { hedgehog_roller: maxHousingAtHall(hall, data) }, lvl, 8);
      expect(mixed.destruction).toBeGreaterThan(hedgehogs.destruction + 15);
    }
  });
});
