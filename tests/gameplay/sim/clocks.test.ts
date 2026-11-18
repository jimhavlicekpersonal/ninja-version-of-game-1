/** P5-09 (RET-12): one daily clock. The chest, the streak's skip week and the stipend roll at the player's midnight. */
import { describe, expect, it } from 'vitest';
import { chestReady } from '../../../src/gameplay/sim/daily';
import { localDayIndex } from '../../../src/gameplay/sim/calendar';
import { dayIndex } from '../../../src/gameplay/sim/pass';
import { stipendStatus } from '../../../src/gameplay/sim/stipend';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const D0 = data.pass.epoch + 400 * DAY; // a UTC midnight

function ahead(hours: number): VillageState {
  const { state } = newGame();
  return { ...state, localTime: { offsetMinutes: hours * 60, setAt: 0 } };
}

describe('the chest rolls at the player\'s midnight (P5-09)', () => {
  it('after the first claim on the new clock, one chest per local day', () => {
    let s = ahead(10);
    s = must(s, { type: 'openDailyChest' }, D0 + 20 * HOUR); // local 06:00 the next day
    expect(s.daily.local).toBe(true);
    expect(s.daily.lastDay).toBe(localDayIndex(s, D0 + 20 * HOUR, data));
    // UTC midnight passes, the local day does not: no second chest.
    expect(applyCommand(s, { type: 'openDailyChest' }, D0 + 25 * HOUR, data).ok).toBe(false);
    // The local midnight (UTC 14:00 the next day): the next chest.
    expect(chestReady(s, D0 + 38 * HOUR - 1, data)).toBe(false);
    expect(chestReady(s, D0 + 38 * HOUR, data)).toBe(true);
  });

  it('the switch never allows a second chest on the day it happens', () => {
    // A save from before the switch: opened on UTC day D0, local day already the next one (UTC+10 at 20:00 UTC).
    const s = ahead(10);
    s.daily = { ...s.daily, lastDay: dayIndex(D0 + 20 * HOUR, data), step: 1 };
    delete s.daily.local;
    expect(applyCommand(s, { type: 'openDailyChest' }, D0 + 21 * HOUR, data)).toMatchObject({ ok: false, code: 'ALREADY_CLAIMED' });
    // The next UTC day: one claim, and from then on the local day.
    const r = must(s, { type: 'openDailyChest' }, D0 + DAY + 1 * HOUR);
    expect(r.daily.local).toBe(true);
    expect(applyCommand(r, { type: 'openDailyChest' }, D0 + DAY + 2 * HOUR, data).ok).toBe(false);
  });

  it('the refusal no longer names UTC', () => {
    const s = must(ahead(0), { type: 'openDailyChest' }, D0 + HOUR);
    const r = applyCommand(s, { type: 'openDailyChest' }, D0 + 2 * HOUR, data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toMatch(/UTC/);
  });
});

describe('the stipend rolls at the player\'s midnight (P5-09)', () => {
  it('one payment per local day after the first claim on the new clock', () => {
    let s = ahead(-8);
    s = must(s, { type: 'grantPurchase', productId: data.store.stipend!.id, transactionId: 't', verified: true }, D0);
    s = must(s, { type: 'claimStipend' }, D0 + 2 * HOUR); // local 18:00 the day before
    expect(s.stipend.local).toBe(true);
    // Local midnight is UTC 08:00.
    expect(stipendStatus(s, D0 + 7 * HOUR, data).claimable).toBe(false);
    expect(stipendStatus(s, D0 + 8 * HOUR, data).claimable).toBe(true);
  });
});
