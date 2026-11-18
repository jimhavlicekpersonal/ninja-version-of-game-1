/**
 * P6-03 (defense opportunity 2): the defense report from the record alone. Kept = raidable minus taken; the entry
 * point from the raider's first warrior; the first buildings to fall by replay (only under the record's rules); the
 * side raiders break through is a free suggestion in `nextObjective`.
 */
import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent, totalLoot } from '../../../src/gameplay/sim/battle/basegen';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import { breachSide, defenseKept, firstToFall, raidEntry } from '../../../src/gameplay/sim/defenseReport';
import { nextObjective } from '../../../src/gameplay/sim/objective';
import { data, newGame } from './helpers';

function raidRecord(at: number, rules: number | undefined = SIM_RULES): BattleRecord {
  const setup = { seed: 9, base: generateOpponent(4242, 6, data), army: { beetle_brute: 8, hedgehog_roller: 20 }, levels: { beetle_brute: 3, hedgehog_roller: 3 }, infiltration: true };
  const s = new BattleSession(structuredClone(setup), data, 'live');
  s.orderSquad({ point: 2, formation: 'file', order: 'tanks' });
  for (let i = 0; i < 6000 && !s.sim.ended; i++) s.update(100);
  return { id: 'd1', kind: 'defense', at, opponentName: 'Raider', setup, deployments: s.deployments, result: s.result(), rules, simulated: true };
}

describe('the defense report (P6-03)', () => {
  const r = raidRecord(1000);

  it('kept is what was raidable minus what was taken, with its share', () => {
    const k = defenseKept(r);
    const raidable = totalLoot(r.setup.base);
    for (const [key, v] of Object.entries(raidable)) expect(k.kept[key as 'acorns']).toBe(v - Math.min(v, r.result.loot[key as 'acorns'] ?? 0));
    expect(k.share).toBeGreaterThanOrEqual(0);
    expect(k.share).toBeLessThanOrEqual(1);
  });

  it("the entry point is the first warrior's point", () => {
    expect(raidEntry(r, data)).toBe('C');
  });

  it('the first buildings to fall come from a replay, and only under the same rules', () => {
    const fell = firstToFall(r, data)!;
    expect(fell.length).toBeGreaterThan(0);
    expect(fell.length).toBeLessThanOrEqual(3);
    for (const t of fell) expect(data.buildings[t].category).not.toBe('hedge');
    expect(firstToFall({ ...r, rules: SIM_RULES - 1 }, data)).toBeNull();
  });

  it('the side raiders break through feeds the objective chip as a free suggestion', () => {
    const now = 2 * 86_400_000;
    const won = { ...r, at: now - 3600_000, result: { ...r.result, stars: Math.max(1, r.result.stars) } };
    expect(breachSide([won], now, data)).toBe('C');
    expect(breachSide([{ ...won, result: { ...won.result, stars: 0 } }], now, data)).toBeNull();
    expect(breachSide([{ ...won, at: now - 4 * 86_400_000 }], now, data)).toBeNull();
    // It takes the place of "wait for the builders" or "nothing", never of anything else.
    const { state, clock } = newGame();
    state.resources = { ...state.resources, acorns: 0, dew: 0 };
    for (const b of state.buildings) b.upgrade = { startedAt: clock.now(), endsAt: now + 3600_000, toLevel: b.level + 1 } as never;
    const without = nextObjective(structuredClone(state), now, data);
    state.defenseLog = [won];
    const withIt = nextObjective(state, now, data);
    expect(without.kind === 'builders' || without.kind === 'none').toBe(true);
    expect(withIt.kind).toBe('defendSide');
    if (withIt.kind === 'defendSide') expect(withIt.point).toBe('C');
  });
});
