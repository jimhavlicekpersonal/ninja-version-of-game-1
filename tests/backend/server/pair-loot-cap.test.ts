/** Beast Mode 2026-11-21 GT-17: the per-pair daily loot cap (pure part and its policy knob). */
import { describe, expect, it } from 'vitest';
import { policyFromEnv } from '../../../server/config';
import { DEFAULT_POLICY } from '../../../server/core/context';
import { pairCapped } from '../../../server/core/pvp';
import type { BattleResult } from '../../../src/gameplay/sim/battle/types';

const result = (acorns: number, dew: number) => ({ stars: 1, destruction: 50, loot: { acorns, dew }, used: {} }) as unknown as BattleResult;

describe('pair loot cap (GT-17)', () => {
  it('a second raid on the same defender the same day pays at most what is left of the cap', () => {
    expect(pairCapped(result(800, 300), {}, 1000).loot).toEqual({ acorns: 800, dew: 300 });
    expect(pairCapped(result(800, 300), { acorns: 700, dew: 900 }, 1000).loot).toEqual({ acorns: 300, dew: 100 });
    expect(pairCapped(result(800, 300), { acorns: 1200, dew: 1000 }, 1000).loot).toEqual({});
    expect(pairCapped(result(800, 300), { acorns: 1000 }, 1000).loot).toEqual({ dew: 300 });
  });

  it('defaults to half the storage cap and can be set from 0 to 1', () => {
    expect(DEFAULT_POLICY.pairDailyLootShare).toBe(0.5);
    expect(policyFromEnv({ PAIR_DAILY_LOOT_SHARE: '0.25' }).pairDailyLootShare).toBe(0.25);
    expect(() => policyFromEnv({ PAIR_DAILY_LOOT_SHARE: '2' })).toThrow();
  });
});
