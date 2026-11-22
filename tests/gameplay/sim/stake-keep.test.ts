/** Beast Mode GT-10: stakes open from `raids.stakes.minKeep`, where three stars stop being the usual result. */
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { stakeOptions, stakesOpenAt, validStake } from '../../../src/gameplay/sim/carry';

describe('GT-10: stakes by Keep', () => {
  it('below minKeep no stake can be declared; from it on both are offered', () => {
    const min = defaultData.raids.stakes!.minKeep!;
    expect(min).toBe(6);
    expect(stakesOpenAt(min - 1, defaultData)).toBe(false);
    expect(stakeOptions(defaultData, min - 1)).toEqual([]);
    expect(validStake(3, defaultData, min - 1)).toBe(false);
    expect(stakeOptions(defaultData, min)).toEqual([2, 3]);
    expect(validStake(3, defaultData, min)).toBe(true);
    // Without a Keep (a stake the server already fixed) the rule does not apply.
    expect(validStake(3, defaultData)).toBe(true);
  });
});
