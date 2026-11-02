/** Limited-time events and offers: deadlines are real and never move. */
import { describe, expect, it } from 'vitest';
import { activeEvents, eventEffect, eventsBetween, upcomingEvents } from '../../src/sim/events';
import { triggerOffer } from '../../src/sim/offers';
import { troopLevel } from '../../src/sim/data';
import type { VillageState } from '../../src/sim/types';
import { advance, applyCommand } from '../../src/sim/village';
import { data, must, newGame } from './helpers';

const HOUR = 3_600_000;

describe('event schedule', () => {
  it('repeats exactly every period, independent of the player', () => {
    const p = data.events.periodDays * 24 * HOUR;
    const t = data.events.epoch + 5 * p + 10 * HOUR;
    const a = activeEvents(t, data).map((e) => [e.id, e.end - t]);
    const b = activeEvents(t + p, data).map((e) => [e.id, e.end - (t + p)]);
    expect(a).toEqual(b);
  });

  it('an event ends exactly at its end time', () => {
    const first = eventsBetween(data.events.epoch, data.events.epoch + 1, data)[0];
    expect(activeEvents(first.end - 1, data).map((e) => e.key)).toContain(first.key);
    expect(activeEvents(first.end, data).map((e) => e.key)).not.toContain(first.key);
  });

  it('lists what comes next', () => {
    const t = data.events.epoch + 30 * HOUR;
    const next = upcomingEvents(t, 3, data);
    expect(next).toHaveLength(3);
    for (const e of next) expect(e.start).toBeGreaterThan(t);
    expect(next[0].start).toBeLessThan(next[1].start);
  });

  it('effects apply only while the event runs', () => {
    const swift = data.events.schedule.find((e) => e.effect.trainingDiscount)!;
    const t = data.events.epoch + (swift.startHour + 1) * HOUR;
    expect(eventEffect(t, data).trainingDiscount).toBe(swift.effect.trainingDiscount);
    expect(eventEffect(data.events.epoch + (swift.startHour + swift.durationHours) * HOUR, data).trainingDiscount).toBe(0);
  });

  it('training costs less during Swift Paws', () => {
    const swift = data.events.schedule.find((e) => e.effect.trainingDiscount)!;
    const g = newGame({ dew: 1000 });
    const t0 = data.events.epoch + 14 * 24 * HOUR * 10 + (swift.startHour + 1) * HOUR;
    let s: VillageState = { ...g.state, createdAt: t0, lastSeenAt: t0 };
    s = must(s, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, t0);
    s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, t0);
    s = advance(s, t0 + 60_000, data).state;
    const r = applyCommand(s, { type: 'train', troop: 'hedgehog_roller' }, t0 + 60_000, data);
    if (!r.ok) throw new Error(r.message);
    const full = troopLevel(data, 'hedgehog_roller', 1).cost.dew!;
    expect(r.state.training[0].cost.dew).toBe(Math.round(full * (1 - swift.effect.trainingDiscount!)));
  });
});

describe('offer deadlines', () => {
  it('a shown offer keeps its deadline: triggering again neither resets nor extends it', () => {
    const { state, clock } = newGame();
    const s = structuredClone(state);
    const t0 = clock.now() + 10 * HOUR;
    const rule = triggerOffer(s, 'heavy_defense_loss', t0, data)!;
    expect(rule).not.toBeNull();
    const expires = s.offers.active[0].expiresAt;
    expect(triggerOffer(s, 'heavy_defense_loss', t0 + HOUR, data)).toBeNull();
    expect(s.offers.active[0].expiresAt).toBe(expires);
    // After it runs out, it does not come straight back: the cooldown applies.
    expect(triggerOffer(s, 'heavy_defense_loss', expires + 1, data)).toBeNull();
    expect(s.offers.active).toHaveLength(0);
    expect(triggerOffer(s, 'heavy_defense_loss', t0 + rule.cooldownHours * HOUR, data)).not.toBeNull();
  });
});
