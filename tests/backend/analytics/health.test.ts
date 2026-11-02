/** The device health view (backend/analytics/events.ts healthReport). */
import { describe, expect, it } from 'vitest';
import { healthReport, type AnalyticsEvent, type AnalyticsEventName } from '../../../src/backend/analytics/events';
import { defaultData } from '../../../src/gameplay/sim/data';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 4, 1, 9);
const e = (name: AnalyticsEventName, at: number, props: Record<string, unknown> = {}): AnalyticsEvent => ({ name, at, session: 's', props });

describe('health report', () => {
  it('reads tutorial, retention, battles, searches, PvP repeat and defender return from events', () => {
    const events = [
      e('session_start', t0),
      e('tutorial_step', t0 + 60_000, { step: 9, done: true }),
      e('opponent_search', t0 + 120_000, { ok: true, humans: 0, searched: false }),
      e('raid_end', t0 + 300_000, { human: false }),
      e('session_start', t0 + DAY + 3600_000),
      e('opponent_search', t0 + DAY + 3700_000, { ok: true, humans: 1, searched: true }),
      e('raid_end', t0 + DAY + 3800_000, { human: true }),
      e('opponent_search', t0 + DAY + 3900_000, { ok: true, humans: 0, searched: true }),
      e('raid_end', t0 + DAY + 4000_000, { human: true }),
      e('defense_seen', t0 + DAY + 3600_000, { raids: 2 }),
      e('session_start', t0 + 2 * DAY + 1000),
    ];
    const r = healthReport(events, t0 + 3 * DAY, defaultData.competition.health);
    expect(r.tutorialDone).toBe(true);
    expect(r.returned).toEqual({ day1: true, day7: null, day30: null });
    expect(r.activeDays).toBe(3);
    expect(r.battlesPerActiveDay).toBeCloseTo(1, 6);
    expect(r.searchSuccess).toBe(1);
    expect(r.humanAvailability).toBe(0.5);
    expect(r.humanBattles).toBe(2);
    expect(r.pvpRepeat).toBe(true);
    expect(r.defensesSeen).toBe(1);
    expect(r.returnedAfterDefense).toBe(1);
    // A device that never came back on day 1.
    expect(healthReport([e('session_start', t0)], t0 + 3 * DAY, defaultData.competition.health).returned.day1).toBe(false);
  });
});
