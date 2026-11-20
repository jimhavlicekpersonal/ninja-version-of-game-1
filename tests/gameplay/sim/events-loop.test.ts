/**
 * P5-01 (RET-01) and P5-02: the 28-day event loop, the dated festivals, goal progress per occurrence and the weekly
 * Gauntlet (one fortress per occurrence and Keep).
 */
import { describe, expect, it } from 'vitest';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { activeEvents, eventsBetween } from '../../../src/gameplay/sim/events';
import { activeGoalEvents, gauntletBase, goalEventViews } from '../../../src/gameplay/sim/goalEvents';
import { createRng } from '../../../src/gameplay/sim/rng';
import { migrate, serialize } from '../../../src/gameplay/sim/save';
import type { GoalEventState, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, battleLoadout, bountyBattleSeed } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const YEAR_FROM = Date.UTC(2027, 2, 1);

function atHall(state: VillageState, hall: number): VillageState {
  return { ...state, buildings: state.buildings.map((b) => (data.buildings[b.type].category === 'hall' ? { ...b, level: hall } : b)) };
}

describe('the year of events (P5-01 done-when)', () => {
  const windows = eventsBetween(YEAR_FROM, YEAR_FROM + 365 * DAY, data);

  it('a player meets at least twelve distinct event names in the next 365 days', () => {
    expect(new Set(windows.map((w) => w.name)).size).toBeGreaterThanOrEqual(12);
  });

  it('no two consecutive weeks are identical', () => {
    const week = (i: number) => {
      const from = YEAR_FROM + i * 7 * DAY;
      return eventsBetween(from, from + 7 * DAY, data)
        .map((w) => `${w.id}@${Math.max(w.start, from) - from}-${Math.min(w.end, from + 7 * DAY) - from}`)
        .map((x) => x.replace(/^(\w+?)(_\d+)?@/, '$1@'))
        .sort()
        .join(',');
    };
    for (let i = 0; i < 52; i++) expect(week(i + 1), `weeks ${i} and ${i + 1}`).not.toBe(week(i));
  });

  it('at most half of all hours have an event running', () => {
    let running = 0;
    for (let t = YEAR_FROM; t < YEAR_FROM + 365 * DAY; t += HOUR) if (activeEvents(t, data).length) running++;
    expect(running / (365 * 24)).toBeLessThanOrEqual(0.5);
  });

  it('each festival comes once a year on its date, keyed by the year, with a look on its top step that is never sold', () => {
    for (const f of data.events.dated!) {
      const occ = windows.filter((w) => w.id === f.id);
      expect(occ.length, f.id).toBe(1);
      expect(occ[0].key).toBe(`${f.id}#${new Date(occ[0].start).getUTCFullYear()}`);
      const top = f.goal!.ladder[f.goal!.ladder.length - 1];
      const skin = data.cosmetics.hallSkins.find((k) => k.id === top.look)!;
      expect(skin.earned, f.id).toBe(true);
      const { state } = newGame();
      expect(applyCommand({ ...state, resources: { ...state.resources, moonstones: 99_999 } }, { type: 'buySkin', skin: skin.id }, 0, data)).toMatchObject({ ok: false, code: 'LOCKED' });
    }
  });

  it('every goal entry of the loop has a new id (a 28-day period renumbers every key)', () => {
    const ids = data.events.schedule.filter((e) => e.goal).map((e) => e.id);
    expect(ids).not.toContain('bounty_hunt');
  });
});

/** A battle against a goal event's fortress, the way the app sends it. */
function attack(s: VillageState, key: string, t: number) {
  const view = goalEventViews(s, t, data).find((v) => v.event.key === key)!;
  const army = { hedgehog_roller: 60, beetle_brute: 6 };
  const ready: VillageState = { ...s, army };
  const loadout = battleLoadout(ready, data);
  const setup = { seed: bountyBattleSeed(ready.seed, ready.nextSeed), base: view.base, ...loadout, infiltration: true };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, loadout.army, createRng(3), data, loadout.levels, probe.entry);
  return applyCommand(ready, { type: 'bountyEnd', eventKey: key, record: { at: t, opponentName: 'x', setup, deployments } }, t, data);
}

describe('goal progress per occurrence (P5-01)', () => {
  // Find a moment where two goal events overlap (a Bounty beside the Gauntlet).
  const both = (() => {
    for (let t = data.events.epoch; t < data.events.epoch + 28 * DAY; t += HOUR) {
      const g = activeGoalEvents(t, data);
      if (g.length >= 2) return { t, keys: g.map((x) => x.key) };
    }
    throw new Error('no overlap');
  })();

  it('alternating attacks between two running goal events never pays a step twice', () => {
    const { state } = newGame();
    let s = atHall(state, 5);
    const paid: Record<string, number[]> = {};
    for (let i = 0; i < 6; i++) {
      const key = both.keys[i % 2];
      const r = attack(s, key, both.t + i * 60_000);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
      const e = r.events.find((x) => x.kind === 'bounty_end')!;
      if (e.kind !== 'bounty_end') return;
      for (const step of e.steps) {
        expect(paid[key] ?? [], `${key} step ${step} paid twice`).not.toContain(step);
        (paid[key] ??= []).push(step);
      }
    }
    for (const key of both.keys) expect(s.goalEvents.find((g) => g.key === key)!.claimed.sort()).toEqual((paid[key] ?? []).sort());
  });

  it('a v24 save written before the list existed is repaired on load (review M4)', () => {
    const { state, clock } = newGame();
    const file = serialize(state, clock.now()) as unknown as { version: number; village: Record<string, unknown> };
    delete file.village.goalEvents;
    file.village.goalEvent = null;
    expect(migrate(file, data).village.goalEvents).toEqual([]);
  });

  it('nothing is settled for a goal event later than a battle and a short grace after it ended (review M5)', () => {
    const { state } = newGame();
    const s = atHall(state, 5);
    const w = activeGoalEvents(both.t, data)[0];
    const view = goalEventViews(s, both.t, data).find((v) => v.event.key === w.key)!;
    const loadout = battleLoadout({ ...s, army: { hedgehog_roller: 10 } }, data);
    const cmd = (at: number) => ({ type: 'bountyEnd' as const, eventKey: w.key, record: { at, opponentName: 'x', setup: { seed: bountyBattleSeed(s.seed, s.nextSeed), base: view.base, ...loadout, infiltration: true }, deployments: [] } });
    const late = w.end + data.battle.durationSeconds * 1000 + 31 * 60_000;
    expect(applyCommand({ ...s, army: { hedgehog_roller: 10 } }, cmd(w.end - 1000), late, data)).toMatchObject({ ok: false, code: 'NOT_AVAILABLE' });
    expect(applyCommand({ ...s, army: { hedgehog_roller: 10 } }, cmd(w.end - 1000), w.end + 60_000, data).ok).toBe(true);
  });

  it('save v24 turns the one stored slot into the list, keeping its claimed steps', () => {
    const { state, clock } = newGame();
    const old = serialize(state, clock.now()) as unknown as { version: number; village: Record<string, unknown> };
    old.version = 23;
    const slot: GoalEventState = { key: 'bounty_hunt#20', best: 2, bestDestruction: 71, claimed: [0, 1, 2] };
    old.village.goalEvent = slot;
    delete old.village.goalEvents;
    const out = migrate(old, data);
    expect(out.village.goalEvents).toEqual([slot]);
    expect((out.village as unknown as Record<string, unknown>).goalEvent).toBeUndefined();
  });
});

describe('the weekly Gauntlet (P5-02)', () => {
  const gauntlets = eventsBetween(YEAR_FROM, YEAR_FROM + 21 * DAY, data).filter((w) => data.events.schedule.find((e) => e.id === w.id)?.goal?.kind === 'gauntlet');
  const goal = data.events.schedule.find((e) => e.goal?.kind === 'gauntlet')!.goal!;

  it('runs every week', () => {
    expect(gauntlets.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < gauntlets.length; i++) expect(gauntlets[i].start - gauntlets[i - 1].start).toBe(7 * DAY);
  });

  it('two villages with different seeds at one Keep get the identical base for an occurrence, and a different one the next', () => {
    const a = newGame().state;
    const b = { ...newGame().state, seed: a.seed + 12345 };
    const t = gauntlets[0].start + HOUR;
    const va = goalEventViews(atHall(a, 8), t, data).find((v) => v.event.key === gauntlets[0].key)!;
    const vb = goalEventViews(atHall(b, 8), t, data).find((v) => v.event.key === gauntlets[0].key)!;
    expect(vb.base).toEqual(va.base);
    expect(gauntletBase(gauntlets[1].key, 8, goal, data)).not.toEqual(va.base);
    expect(gauntletBase(gauntlets[0].key, 9, goal, data)).not.toEqual(va.base);
    expect(va.base.practice).toMatch(/Gauntlet/);
    expect(va.base.buildings.every((x) => !x.loot)).toBe(true);
  });

  it('carries its modifiers: power, wall power and a rival clan\'s tempers from the Keep that unlocks tempering', () => {
    const base = gauntletBase(gauntlets[0].key, 12, goal, data);
    expect(base.power).toBe(goal.power);
    expect(base.wallPower).toBe(goal.wallPower);
    expect(base.buildings.some((x) => x.temper)).toBe(true);
  });

  it('pays its star ladder once per occurrence', () => {
    let s = atHall(newGame().state, 5);
    const key = gauntlets[0].key;
    const t = gauntlets[0].start + HOUR;
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = attack(s, key, t + i * 60_000);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
      const e = r.events.find((x) => x.kind === 'bounty_end')!;
      if (e.kind === 'bounty_end') for (const step of e.steps) {
        expect(seen).not.toContain(step);
        seen.push(step);
      }
    }
  });
});
