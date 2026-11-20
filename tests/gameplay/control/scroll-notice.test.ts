/**
 * Review of the Season Scroll settlement, 2026-11-17 (SCR-01, SCR-07; SCR-04's in-session toast belonged to the
 * event-based payout, replaced at the merge by `claimSeasonLeftovers`): the payout at a season's end must
 * reach the player's eyes on every path the controller has, and must survive the device taking the server's
 * economy. Each case is the reviewer's reproduction.
 */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { passSeason, passSeasonEndsAt } from '../../../src/gameplay/sim/pass';
import { serialize } from '../../../src/gameplay/sim/save';
import { economyOf } from '../../../src/gameplay/sim/serverEconomy';
import { raidPhase } from '../../../src/gameplay/sim/social/groveRaid';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, createNewVillage, type SimEvent } from '../../../src/gameplay/sim/village';

const T0 = Date.UTC(2026, 10, 16, 12);
/** The end of the Scroll season running at T0: Friday 2026-11-27 00:00 UTC, the moment a war-prep offer opens. */
const B = passSeasonEndsAt(T0, data);

function village(tiers: number, join: boolean, lastSeen: number): VillageState {
  let s = createNewVillage(T0, data);
  s.resources = { ...s.resources, acorns: 0, dew: 0 };
  s.tutorial = { step: 99, done: true };
  if (join) {
    const r = applyCommand(s, { type: 'joinGrove' }, T0, data);
    if (!r.ok) throw new Error(`join failed: ${r.message}`);
    s = r.state;
  }
  s.pass.points = tiers * data.pass.pointsPerTier;
  s.lastSeenAt = lastSeen;
  s.raidCheckAt = lastSeen;
  s.shieldUntil = B + 30 * 86_400_000;
  return s;
}

async function boot(s: VillageState, savedAt: number, startAt: number) {
  let t = startAt;
  const clock = { now: () => t };
  const store = new MemorySaveStore();
  await store.save(serialize(s, savedAt) as never);
  const started = await GameController.start({ clock, store, data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: true });
  const heard: SimEvent[][] = [];
  started.controller.onEvents((ev) => heard.push(ev));
  return { ...started, heard, set: (x: number) => (t = x) };
}

describe('the Season Scroll payout is always told', () => {
  it('the season of 2026-11-27 ends at the moment the war-prep offer opens', () => {
    const p = raidPhase(B, data);
    expect(p.phase).not.toBe('live');
    expect(p.nextStart - B).toBeLessThanOrEqual(data.social.groveRaid.prepOfferHours * 3_600_000);
  });

  it('SCR-07: a restart within a minute across the season end still returns the summary', async () => {
    const g = await boot(village(4, false, B - 20_000), B - 20_000, B + 20_000);
    expect(g.offline).not.toBeNull();
    expect(g.offline!.scroll).toBeDefined();
    expect(Object.values(g.offline!.scroll!.granted).some((v) => Number(v) > 0)).toBe(true);
    // And a restart that paid nothing shows no dialog, as before.
    const quiet = await boot(village(4, false, B - 80_000), B - 80_000, B - 60_000);
    expect(quiet.offline).toBeNull();
  });

  it('SCR-01: an economy from before the season end comes with its Scroll, so the device settles again', async () => {
    // The device was away across the season end; the server's stored village is from before it.
    const before = village(4, false, B - 3_600_000);
    const g = await boot(before, B - 3_600_000, B + 6 * 3_600_000);
    const paid = { ...g.controller.state.resources };
    expect(paid.acorns).toBeGreaterThan(0);
    expect(g.controller.state.pass.season).toBe(passSeason(B + 1, data));
    // The server's economy alone (the old behaviour): the payout is gone and nothing brings it back.
    g.controller.adoptEconomy(economyOf(before), []);
    g.controller.tick();
    expect(g.controller.state.resources.acorns).toBe(0);
    // With the Scroll and league season of the same stored village: the next tick pays again, and says so.
    g.controller.adoptEconomy(economyOf(before), [], { pass: before.pass, season: before.season, seasonLog: before.seasonLog });
    g.controller.tick();
    expect(g.controller.state.resources).toEqual(paid);
  });
});
