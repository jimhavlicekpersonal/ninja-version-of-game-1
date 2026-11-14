/**
 * Game-theory batch 2026-11-13, part two: economy E16 and E27, the GUI requests (scout tips for the army
 * brought; refusal and close-call parameters) and growth 7's research and army goals.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { scoutReport } from '../../../src/gameplay/sim/battle/scout';
import { nextObjective } from '../../../src/gameplay/sim/objective';
import { taskEligible } from '../../../src/gameplay/sim/pass';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, builderStatus, scoutBattleSeed } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from '../sim/helpers';

const SHINOBI = 'hedgehog_roller';
const setKeep = (s: VillageState, level: number): VillageState => ({ ...s, buildings: s.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level } : b)) });

function armyVillage(dew: number) {
  const g = newGame({ acorns: 1500, dew: 1500, moonstones: 5000 });
  let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(3600);
  s = advance(s, g.clock.now(), data).state;
  s = { ...s, resources: { ...s.resources, dew } };
  return { ...g, state: s };
}

describe('E27: Shadow Trial tasks only while the next tiers are within reach', () => {
  const tpl = data.pass.weeklyChallenges.find((t) => t.stat === 'trialsCleared')!;
  it('offered while the next tiers are at or below the Keep and not past the growth limit', () => {
    const { state } = newGame();
    const at = (keep: number, best: number) => taskEligible(tpl, 2, { ...setKeep(state, keep), trials: { best } }, data, 7);
    expect(at(1, 0)).toBe(true); // tiers 1-2: Keep 1 fortresses
    expect(at(1, 3)).toBe(false); // tier 5 is a Keep 2 fortress
    expect(at(15, 40)).toBe(true);
    expect(at(15, 58)).toBe(true); // tiers 59 and 60
    expect(at(15, 60)).toBe(true); // tiers 61 and 62: the first two past the ladder (x1.06, x1.1236)
    expect(at(15, 61)).toBe(false); // tier 63 is 19% past the ladder: it used to be offered forever
    expect(at(15, 200)).toBe(false);
  });
});

describe('E16: abandoning the scouted offline opponent after sending warriors in', () => {
  function scouted() {
    const { state, clock } = armyVillage(1000);
    const now = clock.now() + 3_600_000;
    let s = must(state, { type: 'train', troop: SHINOBI, count: 5 }, clock.now());
    s = { ...advance(s, now, data).state, trophies: 500 };
    s = must(s, { type: 'scout', paid: false }, now);
    const base = { name: 'x', hallLevel: 1, trophies: 500, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }] };
    const setup = { seed: scoutBattleSeed(s.scout!.seed), base, army: { [SHINOBI]: 5 }, infiltration: true };
    return { s, setup, now };
  }
  const sent = [{ tick: 0, troop: SHINOBI, x: 0, y: 0 }];

  it('is a lost attack: honor goes and so does the opponent (no free look at its defenses)', () => {
    const { s, setup, now } = scouted();
    expect(s.army[SHINOBI]).toBe(5);
    const out = must(s, { type: 'abandonBattle', record: { at: now, opponentName: 'x', setup, deployments: sent } }, now);
    expect(out.scout).toBeNull();
    expect(out.trophies).toBeLessThan(500);
    expect(out.army[SHINOBI]).toBe(4);
  });

  it('with nobody sent in, nothing happens and the opponent stays', () => {
    const { s, setup, now } = scouted();
    const out = must(s, { type: 'abandonBattle', record: { at: now, opponentName: 'x', setup, deployments: [] } }, now);
    expect(out.scout).toEqual(s.scout);
    expect(out.trophies).toBe(500);
  });

  it('2026-11-14: another battle seed in the record does not keep the opponent (the village decides from its own scout)', () => {
    const { s, setup, now } = scouted();
    const out = must(s, { type: 'abandonBattle', record: { at: now, opponentName: 'x', setup: { ...setup, seed: setup.seed + 1 }, deployments: sent } }, now);
    expect(out.scout).toBeNull();
    expect(out.trophies).toBeLessThan(500);
  });

  it('2026-11-14: with no opponent scouted, an abandon only spends the warriors', () => {
    const { s, setup, now } = scouted();
    const out = must({ ...s, scout: null }, { type: 'abandonBattle', record: { at: now, opponentName: 'x', setup, deployments: sent } }, now);
    expect(out.trophies).toBe(500);
    expect(out.army[SHINOBI]).toBe(4);
  });

  it('an online raid (with a ticket) is left to the server', () => {
    const { s, setup, now } = scouted();
    const out = must(s, { type: 'abandonBattle', record: { at: now, opponentName: 'x', setup, deployments: sent, ticket: 't1' } }, now);
    expect(out.trophies).toBe(500);
  });
});

describe('GUI requests', () => {
  it('scout tips never name a warrior the attacker did not bring (filtered before the list is cut to three)', () => {
    let covered = 0;

    for (let seed = 1; seed <= 40; seed++) {
      const base = generateOpponent(seed * 31, 3 + (seed % 4), data);
      const all = scoutReport(base, data).tips;
      const plain = scoutReport(base, data, { [SHINOBI]: 30 }).tips;
      for (const tip of plain) expect(tip).not.toMatch(/Saboteur|Kite Raider|Tunnel Runner|sending kites/);
      const cover = all.find((t) => t.startsWith('Defenses cover each other'));
      if (cover) {
        covered++;
        expect(scoutReport(base, data, { saboteur: 2 }).tips).toContain(cover);

      }
    }
    expect(covered).toBeGreaterThan(0);

  });

  it('a refusal carries its numbers and ids beside the English message', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 0 });
    const r = applyCommand(state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NOT_ENOUGH_RESOURCES');
    expect(r.message).toMatch(/^Not enough resources/);
    expect(r.params?.cost).toEqual(data.buildings.burrow_barracks.levels[0].cost);
  });
});

describe('growth 7: research and army goals', () => {
  /** Keep 2, every builder busy (so the goal is not an upgrade), chest and calendar claimed. */
  function busy(dew: number) {
    const { state, clock } = armyVillage(dew);
    let s = setKeep(state, 2);
    const total = builderStatus(s, data, clock.now()).total;
    let n = 0;
    s = {
      ...s,
      daily: { ...s.daily, lastDay: 1e9 },
      calendar: { ...s.calendar, lastDay: 1e9 },
      buildings: s.buildings.map((b) => (n < total && data.buildings[b.type].category !== 'hall' && b.level >= 1 && !b.upgrade ? (n++, { ...b, upgrade: { toLevel: b.level + 1, startedAt: clock.now(), endsAt: clock.now() + 86_400_000, cost: {} } }) : b)),
    };
    expect(builderStatus(s, data, clock.now()).free).toBe(0);
    return { s, now: clock.now() };
  }

  it('a free research lane with research the village can pay for', () => {
    const { s, now } = busy(data.troops[SHINOBI].levels[1].research!.cost.dew!);
    const o = nextObjective(s, now, data);
    expect(o.kind).toBe('research');
    if (o.kind === 'research') expect(o.lanesFree).toBeGreaterThan(0);
  });

  it('camps with room and nothing training: train (when research is out of reach)', () => {
    const level2 = data.troops[SHINOBI].levels[1].research!.cost.dew!;
    const { s, now } = busy(Math.min(level2 - 1, 100));
    const o = nextObjective(s, now, data);
    expect(o.kind).toBe('train');
    if (o.kind === 'train') expect(o.space).toBeGreaterThan(0);
  });
});
