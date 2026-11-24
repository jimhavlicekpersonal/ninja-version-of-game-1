/**
 * Money audit 2026-11-24, game rules.
 * - MONEY-02: an offer activated while the player was a stated adult stayed buyable after they said they are under
 *   18: `canPurchase` checked only that it was active, not `offersAllowed`.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { canPurchase } from '../../../src/gameplay/sim/monetization';
import { triggerOffer } from '../../../src/gameplay/sim/offers';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';

const HOUR = 3_600_000;

describe('MONEY-02: offers are sold only to stated adults', () => {
  const shown = () => {
    const s = createNewVillage(0, data);
    const now = 30 * HOUR;
    const adult = applyCommand(s, { type: 'setProfile', under18: false, ageBand: 'adult' }, now, data);
    expect(adult.ok).toBe(true);
    const v = adult.ok ? adult.state : s;
    const rule = triggerOffer(v, 'first_long_wait', now, data);
    expect(rule?.id).toBe('starter_pack');
    return { v, now, productId: rule!.productId };
  };

  it('an adult can buy the offer they were shown', () => {
    const { v, now, productId } = shown();
    expect(canPurchase(v, productId, now, data).ok).toBe(true);
  });

  it('the same offer is refused once the player says they are 13 to 17', () => {
    const { v, now, productId } = shown();
    const minor = applyCommand(v, { type: 'setProfile', under18: true, ageBand: '13to17' }, now + 1000, data);
    expect(minor.ok).toBe(true);
    if (!minor.ok) return;
    expect(minor.state.offers.active.some((a) => a.expiresAt > now + 1000)).toBe(true);
    expect(canPurchase(minor.state, productId, now + 1000, data)).toMatchObject({ ok: false, code: 'OFFER_EXPIRED' });
    // A Jade pack stays buyable (within the cap).
    expect(canPurchase(minor.state, 'moonstones_0', now + 1000, data).ok).toBe(true);
  });
});
