/** The re-simulation benchmark (roadmap step 18) runs and reports sensible numbers (timings themselves are not asserted). */
import { describe, expect, it } from 'vitest';
import { benchmarkBattles } from '../../../server/bench';
import { defaultData } from '../../../src/gameplay/sim/data';

describe('runBattle benchmark', () => {
  it('times real battles per Keep', () => {
    const [row] = benchmarkBattles(defaultData, { keeps: [2], battles: 2, warmup: 0 });
    expect(row).toMatchObject({ keep: 2, battles: 2 });
    expect(row.medianMs).toBeGreaterThan(0);
    expect(row.maxMs).toBeGreaterThanOrEqual(row.medianMs);
    expect(row.meanTicks).toBeGreaterThan(0);
    expect(row.buildings).toBeGreaterThan(5);
    expect(row.troops).toBeGreaterThan(5);
  });
});
