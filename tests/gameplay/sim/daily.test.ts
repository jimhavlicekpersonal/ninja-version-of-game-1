/** Daily chest (odds shown, free, not rerollable) and the visit streak (never wiped). */
import { describe, expect, it } from 'vitest';
import { chestContents, chestOdds, chestOutcome, chestReady, nextChestAt, streakAfterClaim } from '../../../src/gameplay/sim/daily';
import { dayIndex } from '../../../src/gameplay/sim/pass';
import { productInfo } from '../../../src/gameplay/sim/monetization';
import { mixSeed } from '../../../src/gameplay/sim/rng';
import type { DailyState } from '../../../src/gameplay/sim/types';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

const DAY = 86_400_000;

describe('daily chest', () => {
  it('shows every outcome with odds that add up to 100%', () => {
    const odds = chestOdds(data);
    expect(odds.map((o) => o.id)).toEqual(data.daily.chest.outcomes.map((o) => o.id));
    expect(odds.reduce((s, o) => s + o.percent, 0)).toBeCloseTo(100, 6);
    for (const o of odds) expect(o.percent).toBeGreaterThan(0);
  });

  it('the shown odds match what the chest actually gives', () => {
    // 400 villages (seeded the way new villages are) opening a chest every day for 100 days.
    const counts: Record<string, number> = {};
    let n = 0;
    for (let v = 0; v < 400; v++) {
      const seed = mixSeed(1_767_000_000 + v * 7_919, v);
      for (let day = 400; day < 500; day++) {
        const id = chestOutcome(seed, day, data);
        counts[id] = (counts[id] ?? 0) + 1;
        n++;
      }
    }
    for (const o of chestOdds(data)) expect(Math.abs(((counts[o.id] ?? 0) * 100) / n - o.percent)).toBeLessThan(1);
  });

  it('opens once a day for free, grants exactly what it shows, and cannot be rerolled', () => {
    const { state, clock } = newGame();
    const s0 = { ...state, resources: { ...state.resources, moonstones: 9999 } };
    expect(chestReady(s0, clock.now(), data)).toBe(true);
    const r = applyCommand(s0, { type: 'openDailyChest' }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ev = r.events.find((e) => e.kind === 'daily_chest');
    if (!ev || ev.kind !== 'daily_chest') throw new Error('no chest event');
    const day = dayIndex(clock.now(), data);
    expect(ev.outcome).toBe(chestOutcome(s0.seed, day, data));
    expect(ev.grants).toEqual(chestContents(ev.outcome, 1, 1, data));
    // No Moonstones were spent, and a second open the same day fails even with plenty of Moonstones.
    expect(r.state.resources.moonstones).toBe(9999 + (ev.grants.moonstones ?? 0));
    const again = applyCommand(r.state, { type: 'openDailyChest' }, clock.now() + 60_000, data);
    expect(again.ok).toBe(false);
    // Reloading (re-applying to the saved state from before) gives the same outcome.
    const replay = applyCommand(s0, { type: 'openDailyChest' }, clock.now() + 3_600_000, data);
    if (replay.ok && dayIndex(clock.now() + 3_600_000, data) === day) expect(replay.events[0]).toEqual(r.events[0]);
    expect(chestReady(r.state, nextChestAt(clock.now(), data), data)).toBe(true);
  });

  it('is never sold: no product, offer or pack opens a chest or grants streak skips', () => {
    for (const p of data.store.packs) expect(Object.keys(productInfo(data, p.id)!.grants)).toEqual(['moonstones']);
    for (const o of data.offers.rules) for (const k of Object.keys(o.contents)) expect(['acorns', 'dew', 'moonstones']).toContain(k);
    const productIds = [...data.store.packs.map((p) => p.id), ...data.offers.rules.map((o) => o.productId), data.pass.productId];
    for (const id of productIds) expect(id).not.toMatch(/chest|streak|skip/i);
    // The only way to open it is the free command; it has no paid variant.
    const { state, clock } = newGame();
    const opened = must(state, { type: 'openDailyChest' }, clock.now());
    expect(opened.stats.moonstonesSpent).toBe(0);
  });
});

describe('streak', () => {
  const d = (over: Partial<DailyState>): DailyState => ({ lastDay: -1, step: 0, skipsLeft: 1, skipWeek: -1, history: [], ...over });

  it('climbs one step per day up to the top of the ladder', () => {
    let st = d({});
    for (let day = 700; day < 715; day++) {
      const a = streakAfterClaim(st, day, data);
      st = { ...st, lastDay: day, step: a.step, skipsLeft: a.skipsLeft, skipWeek: a.skipWeek };
    }
    expect(st.step).toBe(data.daily.streak.steps.length);
  });

  it('a missed day uses the free weekly skip and keeps the streak', () => {
    const a = streakAfterClaim(d({ lastDay: 700, step: 5, skipsLeft: 1, skipWeek: 100 }), 702, data);
    expect(a.skipped).toBe(1);
    expect(a.steppedBack).toBe(0);
    expect(a.step).toBe(6);
  });

  it('without a skip, each missed day moves back one step; it never resets to zero', () => {
    const a = streakAfterClaim(d({ lastDay: 700, step: 6, skipsLeft: 0, skipWeek: 100 }), 703, data);
    expect(a.steppedBack).toBe(2);
    expect(a.step).toBe(5);
    const long = streakAfterClaim(d({ lastDay: 700, step: 7, skipsLeft: 0, skipWeek: 100 }), 800, data);
    expect(long.step).toBe(1);
  });

  it('skips refill every week', () => {
    const a = streakAfterClaim(d({ lastDay: 699, step: 3, skipsLeft: 0, skipWeek: 99 }), 701, data);
    expect(Math.floor(701 / 7)).toBe(100);
    expect(a.skipped).toBe(1);
    expect(a.step).toBe(4);
  });

  it('higher steps give bigger chests, scaled to the hall level', () => {
    const id = data.daily.chest.outcomes[0].id;
    expect(chestContents(id, 3, 7, data).acorns!).toBeGreaterThan(chestContents(id, 3, 1, data).acorns!);
    expect(chestContents(id, 6, 1, data).acorns!).toBeGreaterThan(chestContents(id, 1, 1, data).acorns!);
  });

  it('opening on consecutive days through the command builds the streak', () => {
    const { state, clock } = newGame();
    let s = state;
    for (let i = 0; i < 3; i++) {
      s = must(s, { type: 'openDailyChest' }, clock.now() + i * DAY);
    }
    expect(s.daily.step).toBe(3);
    expect(s.daily.history).toHaveLength(3);
  });
});
