/** P3-07 (PAC-10): the daily drill. */
import { describe, expect, it } from 'vitest';
import { drillArmy, drillAvailable } from '../../../src/gameplay/sim/drill';
import { BATTLE_COMMANDS, PLAYER_COMMANDS } from '../../../src/gameplay/sim/serverEconomy';
import { trialBase } from '../../../src/gameplay/sim/trials';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand } from '../../../src/gameplay/sim/village';
import { data, must, newGame, pointDeploys } from './helpers';

/** A village with a Dojo and a Courtyard (20 space) and no warriors at all. */
function village() {
  const g = newGame({ acorns: 5000, dew: 5000 });
  let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(60);
  s = advance(s, g.clock.now(), data).state;
  return { s: { ...s, resources: { ...s.resources, acorns: 0, dew: 0 } } as VillageState, clock: g.clock };
}

function drill(s: VillageState, now: number, army: Record<string, number> = {}) {
  const real = drillArmy(s, data);
  const setup = { seed: 9, base: trialBase(1, data, 0), army: real };
  const deployments = pointDeploys(setup, Object.keys(real)[0], 10);
  return applyCommand(s, { type: 'drillEnd', record: { at: now, opponentName: 'x', setup: { ...setup, army }, deployments } }, now, data);
}

describe('P3-07: the daily drill', () => {
  it('a player with no warriors still has a full camp to drill with, and nothing is spent', () => {
    const { s, clock } = village();
    expect(Object.keys(s.army)).toHaveLength(0);
    const army = drillArmy(s, data);
    expect(Object.values(army).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const r = drill(s, clock.now());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.army).toEqual(s.army);
    const e = r.events.find((x) => x.kind === 'drill_end')!;
    expect(e.kind === 'drill_end' && e.paid).toBe(true);
    expect(r.state.resources.acorns + r.state.resources.dew).toBeGreaterThan(0);
    expect(r.state.stats.drillsDone).toBe(1);
    expect(r.state.battleLog.at(-1)!.drill).toBe(true);
  });

  it('pays once per local day; the next day pays again', () => {
    const { s, clock } = village();
    const first = drill(s, clock.now());
    if (!first.ok) throw new Error(first.message);
    expect(drillAvailable(first.state, clock.now(), data)).toBe(false);
    const again = drill(first.state, clock.now() + 1000);
    if (!again.ok) throw new Error(again.message);
    const e = again.events.find((x) => x.kind === 'drill_end')!;
    expect(e.kind === 'drill_end' && e.paid).toBe(false);
    expect(again.state.resources).toEqual(first.state.resources);
    const tomorrow = clock.now() + 86_400_000;
    expect(drillAvailable(again.state, tomorrow, data)).toBe(true);
  });

  it('ignores the army the client sends: a forged army fights nothing extra', () => {
    const { s, clock } = village();
    const r = drill(s, clock.now(), { hedgehog_roller: 5000 });
    if (!r.ok) throw new Error(r.message);
    expect(r.state.battleLog.at(-1)!.setup.army).toEqual(drillArmy(s, data));
  });

  it('is replayed and re-simulated by the server', () => {
    expect(PLAYER_COMMANDS.has('drillEnd')).toBe(true);
    expect(BATTLE_COMMANDS.has('drillEnd')).toBe(true);
  });
});

describe('independent review 2026-11-18: drill days come from now', () => {
  it('backdated records cannot pay past days', () => {
    const { s, clock } = village();
    const now = clock.now() + 3 * 86_400_000;
    let st = s;
    let paid = 0;
    for (const back of [3, 2, 1, 0]) {
      const r = drill(st, now - back * 86_400_000 + 1, {});
      // The record's time is the client's word; the paid day is today's.
      const at = applyCommand(st, { type: 'drillEnd', record: { ...(r.ok ? {} : {}), at: now - back * 86_400_000, opponentName: 'x', setup: { seed: 9, base: trialBase(1, data, 0), army: {} }, deployments: (r.ok ? r.state.battleLog.at(-1)!.deployments : []) } }, now, data);
      if (!at.ok) continue;
      if (at.events.some((e) => e.kind === 'drill_end' && e.paid)) paid++;
      st = at.state;
    }
    expect(paid).toBe(1);
  });
});
