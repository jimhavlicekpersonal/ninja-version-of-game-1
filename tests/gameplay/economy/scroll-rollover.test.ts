/**
 * Retention audit RET-03 / economy ECO-02 / exploit audit XPL-11 (2026-11-16): a Season Scroll season that ends
 * pays every tier the player unlocked and did not claim, paid premium tiers included. It used to discard them.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { computeOfflineProgress } from '../../../src/gameplay/sim/offline';
import { passSeason, passSeasonEndsAt, unlockedTier } from '../../../src/gameplay/sim/pass';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, createNewVillage, passTierReward, unclaimedPassTiers } from '../../../src/gameplay/sim/village';

const T0 = Date.UTC(2026, 10, 16, 12);
const DAY = 86_400_000;

/** A village with room in storage, `tiers` Scroll tiers unlocked, none claimed. */
function village(tiers: number, premium: boolean): VillageState {
  const s = createNewVillage(T0, data);
  s.resources = { ...s.resources, acorns: 0, dew: 0 };
  s.pass.points = tiers * data.pass.pointsPerTier;
  if (premium) {
    s.pass.premium = true;
    s.purchases = [{ id: 'apple:scroll-1', productId: data.pass.productId, at: T0, usd: 4.99 }];
  }
  return s;
}
const sum = (s: VillageState, tiers: number, track: 'free' | 'premium', k: 'acorns' | 'dew' | 'moonstones') =>
  Array.from({ length: tiers }, (_, i) => passTierReward(s, i + 1, track, data)?.[k] ?? 0).reduce((a, b) => a + b, 0);

describe('Season Scroll rollover', () => {
  it('pays the free tiers that were unlocked and unclaimed when the season ends', () => {
    const s = village(3, false);
    expect(unlockedTier(s, data)).toBe(3);
    const end = passSeasonEndsAt(T0, data);
    const jade = s.resources.moonstones;
    const wantJade = sum(s, 3, 'free', 'moonstones');
    const wantCoins = sum(s, 3, 'free', 'acorns');
    const { state, rewards } = advance(s, end + 1000, data);
    expect(state.pass.season).toBe(passSeason(end + 1000, data));
    expect(state.pass.points).toBe(0);
    expect(state.resources.moonstones).toBe(jade + wantJade);
    expect(state.resources.acorns).toBe(wantCoins);
    expect(rewards.map((r) => r.kind === 'reward' && r.source)).toEqual(['pass_end:free:1', 'pass_end:free:2', 'pass_end:free:3']);
  });

  it('a command that is first to cross the season end reports what was paid, and ends in the same village', () => {
    const s = village(2, false);
    const at = passSeasonEndsAt(T0, data) + 1000;
    const viaTick = advance(s, at, data).state;
    const r = applyCommand(s, { type: 'saveArmyPreset', name: 'a', army: { hedgehog_roller: 1 } }, at, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.filter((e) => e.kind === 'reward').map((e) => e.kind === 'reward' && e.source)).toEqual(['pass_end:free:1', 'pass_end:free:2']);
    // Whichever comes first, the timer or a command, the village holds the same resources and Scroll.
    expect(r.state.resources).toEqual(viaTick.resources);
    expect(r.state.pass).toEqual(viaTick.pass);
    expect(r.state.stats).toEqual(viaTick.stats);
  });

  it('pays the premium tiers too, and keeps them on the purchase so a refund takes them back', () => {
    const s = village(4, true);
    const jade = s.resources.moonstones;
    const want = sum(s, 4, 'free', 'moonstones') + sum(s, 4, 'premium', 'moonstones');
    expect(want).toBeGreaterThan(0);
    const { state, rewards } = advance(s, passSeasonEndsAt(T0, data) + 1000, data);
    expect(state.resources.moonstones).toBe(jade + want);
    expect(rewards).toHaveLength(8);
    const bought = state.purchases.find((p) => p.id === 'apple:scroll-1')!;
    expect(bought.premium?.granted.moonstones ?? 0).toBe(sum(s, 4, 'premium', 'moonstones'));
    // The refund takes back what the Scroll's premium track gave, including what the roll paid.
    const refunded = applyCommand(state, { type: 'revokePurchase', transactionId: 'apple:scroll-1' }, passSeasonEndsAt(T0, data) + 2000, data);
    expect(refunded.ok).toBe(true);
    if (refunded.ok) expect(refunded.state.resources.moonstones).toBe(jade + sum(s, 4, 'free', 'moonstones'));
  });

  it('never pays a tier twice: claimed tiers are left out, and a second roll pays nothing', () => {
    const s = village(3, false);
    const claimed = applyCommand(s, { type: 'claimTier', tier: 1, track: 'free' }, T0, data);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(unclaimedPassTiers(claimed.state, data)).toEqual([{ tier: 2, track: 'free' }, { tier: 3, track: 'free' }]);
    const first = advance(claimed.state, passSeasonEndsAt(T0, data) + 1000, data);
    expect(first.rewards).toHaveLength(2);
    const again = advance(first.state, passSeasonEndsAt(T0, data) + 2000, data);
    expect(again.rewards).toHaveLength(0);
    expect(again.state.resources).toEqual(first.state.resources);
  });

  it('pays nothing extra while the season is still running', () => {
    const s = village(5, true);
    const { state, rewards } = advance(s, T0 + DAY, data);
    expect(rewards).toHaveLength(0);
    expect(state.resources.moonstones).toBe(s.resources.moonstones);
    expect(unclaimedPassTiers(state, data)).toHaveLength(10);
  });

  it('reports what did not fit instead of dropping it silently', () => {
    const s = village(3, false);
    const cap = advance(s, T0, data).state;
    cap.resources.acorns = 1e12; // far above any storage: nothing more fits
    const { rewards } = advance(cap, passSeasonEndsAt(T0, data) + 1000, data);
    const lost = rewards.filter((r) => r.kind === 'reward' && r.overflow && (r.overflow.acorns ?? 0) > 0);
    expect(lost.length).toBeGreaterThan(0);
  });

  it('a player who was away over the season end is told what the roll paid', () => {
    const s = village(2, false);
    s.lastSeenAt = T0;
    const { summary } = computeOfflineProgress(s, passSeasonEndsAt(T0, data) + DAY, data, { botRaids: false });
    expect(summary.scroll.map((r) => r.kind === 'reward' && r.source)).toEqual(['pass_end:free:1', 'pass_end:free:2']);
  });
});
