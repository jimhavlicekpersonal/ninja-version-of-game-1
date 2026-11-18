/** P2-14 (built-not-live opportunity 4): the garrison crew. Defense, trap and support builds take no Village Artisan. */
import { describe, expect, it } from 'vitest';
import { nextObjective } from '../../../src/gameplay/sim/objective';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, builderStatus, onGarrisonCrew, topUpQuote } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const withCrew = (n: number | undefined): GameData => ({ ...data, economy: { ...data.economy, garrisonCrew: n } });

/** A Keep 6 village whose two artisans are both busy, with a Kunai Tower and a Repair Crane at level 1. */
function busyVillage(now: number): VillageState {
  const { state } = newGame({ acorns: 5_000_000, dew: 5_000_000 });
  const busy = { toLevel: 2, startedAt: now, endsAt: now + 86_400_000, cost: {} };
  const buildings = state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 6, upgrade: { ...busy, toLevel: 7 } } : b));
  const lodge = buildings.find((b) => b.type === 'beaver_lodge')!;
  lodge.upgrade = busy;
  buildings.push(
    { id: 'tower', type: 'acorn_cannon', level: 1, x: 4, y: 4, upgrade: null, collector: null } as VillageState['buildings'][number],
    { id: 'crane', type: 'clockwork_repairer', level: 1, x: 8, y: 4, upgrade: null, collector: null } as VillageState['buildings'][number],
  );
  return { ...state, buildings };
}

describe('P2-14: the garrison crew', () => {
  it('is live in data, free and never sold', () => {
    expect(data.economy.garrisonCrew).toBe(2);
    expect(JSON.stringify(data.store)).not.toContain('garrison');
    expect(JSON.stringify(data.offers)).not.toContain('garrison');
  });

  it('absent or 0 plays exactly as before: a defense waits for an artisan', () => {
    const { clock } = newGame();
    const s = busyVillage(clock.now());
    for (const d of [withCrew(undefined), withCrew(0)]) {
      expect(builderStatus(s, d, clock.now(), 'acorn_cannon').free).toBe(0);
      const r = applyCommand(s, { type: 'upgrade', id: 'tower' }, clock.now(), d);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('NO_FREE_BUILDER');
    }
  });

  it('with the crew a defense and a support counter start while every artisan is busy; other builds still wait', () => {
    const { clock } = newGame();
    const s = busyVillage(clock.now());
    const d = withCrew(2);
    expect(builderStatus(s, d, clock.now()).free).toBe(0);
    const tower = applyCommand(s, { type: 'upgrade', id: 'tower' }, clock.now(), d);
    expect(tower.ok).toBe(true);
    if (!tower.ok) return;
    // The decision recorded in economy.json: support (the Repair Crane, the Smoke Brazier) joins the crew.
    expect(onGarrisonCrew('clockwork_repairer', d)).toBe(true);
    const crane = applyCommand(tower.state, { type: 'upgrade', id: 'crane' }, clock.now(), d);
    expect(crane.ok).toBe(true);
    if (!crane.ok) return;
    // Two crew builds running: a third waits.
    expect(builderStatus(crane.state, d, clock.now(), 'acorn_cannon').free).toBe(0);
    const lodge = crane.state.buildings.find((b) => b.type === 'beaver_lodge' && !b.upgrade);
    if (lodge) expect(applyCommand(crane.state, { type: 'upgrade', id: lodge.id }, clock.now(), d).ok).toBe(false);
  });

  it('a crew build raises no "all artisans busy" offer, and a top-up for one is offered', () => {
    const { clock } = newGame();
    const s = busyVillage(clock.now());
    const d = withCrew(2);
    const tower = applyCommand(s, { type: 'upgrade', id: 'tower' }, clock.now(), d);
    expect(tower.ok).toBe(true);
    if (tower.ok) expect(tower.events.some((e) => e.kind === 'trigger' && e.trigger === 'all_builders_busy')).toBe(false);
    const poor: VillageState = { ...s, resources: { ...s.resources, acorns: 0, dew: 0 } };
    expect(topUpQuote(poor, { type: 'upgrade', id: 'tower' }, clock.now(), d)).not.toBeNull();
    expect(topUpQuote(poor, { type: 'upgrade', id: 'tower' }, clock.now(), withCrew(0))).toBeNull();
  });

  it('the next-objective chip sees the crew', () => {
    const { clock } = newGame();
    const b = busyVillage(clock.now());
    // Today's chest and calendar day already opened (they come first).
    const s: VillageState = { ...b, daily: { ...b.daily, lastDay: 1e9 }, calendar: { ...(b.calendar ?? { claimed: 0, lastDay: 0 }), lastDay: 1e9 } as VillageState['calendar'] };
    const o = nextObjective(s, clock.now(), withCrew(2));
    expect(o.kind).toBe('upgrade');
    if (o.kind === 'upgrade') expect(onGarrisonCrew(o.type, data)).toBe(true);
    expect(nextObjective(s, clock.now(), withCrew(0)).kind).not.toBe('upgrade');
  });
});
