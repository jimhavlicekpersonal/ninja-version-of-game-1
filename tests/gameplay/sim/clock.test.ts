import { describe, expect, it } from 'vitest';
import { FakeClock, OffsetClock } from '../../../src/gameplay/sim/clock';

describe('Clock', () => {
  it('FakeClock only moves when advanced', () => {
    const c = new FakeClock(1000);
    expect(c.now()).toBe(1000);
    c.advanceSeconds(10);
    expect(c.now()).toBe(11_000);
    c.advanceHours(1);
    expect(c.now()).toBe(3_611_000);
  });

  it('OffsetClock adds a live offset', () => {
    const base = new FakeClock(5000);
    let offset = 0;
    const c = new OffsetClock(base, () => offset);
    expect(c.now()).toBe(5000);
    offset = 3_600_000;
    expect(c.now()).toBe(3_605_000);
  });
});
