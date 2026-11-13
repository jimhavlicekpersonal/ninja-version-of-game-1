/**
 * Report section 5 step 6 (docs/audit/STATE_OF_THE_GAME.md): the offer funnel and the Jade faucets
 * (economy E01, E02, E03, E05, E19).
 */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { MockPaymentProvider } from '../../../src/backend/payments/provider';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { triggerOffer } from '../../../src/gameplay/sim/offers';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';
import { migrate, serialize } from '../../../src/gameplay/sim/save';
import { addStipend, claimStipend } from '../../../src/gameplay/sim/stipend';
import { skipCost, trainingSkipCost } from '../../../src/gameplay/sim/economy';

const HOUR = 3_600_000;
const T = Date.UTC(2026, 10, 2, 12);

async function controller() {
  const clock = new FakeClock();
  const payments = new MockPaymentProvider(() => clock.now());
  const { controller: c } = await GameController.start({ clock, store: new MemorySaveStore(), analytics: new Analytics(new MemoryEventStore(), clock, 't'), data, payments });
  await c.replace({ ...c.state, buildings: c.state.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle') });
  return { c, clock };
}

/** A day-old village with a Keep 4 and plenty to spend, so the Keep upgrade is a long wait. */
async function readyForLongWait(c: GameController, extra: Partial<VillageState> = {}) {
  await c.replace({
    ...c.state,
    createdAt: c.now() - 25 * HOUR,
    resources: { ...c.state.resources, acorns: 2_000_000, dew: 2_000_000 },
    buildings: c.state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 4 } : b)),
    ...extra,
  });
  return c.state.buildings.find((b) => b.type === 'elder_toadstool')!;
}

describe('E01: the Starter Pack is not lost to a refused first try', () => {
  it('a long wait before the age is known keeps the Starter for a later long wait', async () => {
    const { c } = await controller();
    const shown: string[] = [];
    c.onOffer((r) => shown.push(r.id));
    const keep = await readyForLongWait(c);
    expect(c.dispatch({ type: 'upgrade', id: keep.id }).ok).toBe(true);
    expect(shown).toEqual([]); // age unknown: no offers at all
    expect(c.state.flags.longWaitSeen).toBe(false);
    // The upgrade is stopped (this fixture's storage could not hold a cancel's refund, balance audit CU-7).
    await c.replace({ ...c.state, buildings: c.state.buildings.map((b) => (b.id === keep.id ? { ...b, upgrade: null } : b)) });
    c.dispatch({ type: 'setProfile', under18: false, ageBand: 'adult' });
    expect(c.dispatch({ type: 'upgrade', id: keep.id }).ok).toBe(true);
    expect(shown).toEqual(['starter_pack']);
    expect(c.state.flags.longWaitSeen).toBe(true);
  });

  it('a village that lost it before this fix (flag set, never shown) gets it back', async () => {
    const { c } = await controller();
    const shown: string[] = [];
    c.onOffer((r) => shown.push(r.id));
    c.dispatch({ type: 'setProfile', under18: false, ageBand: 'adult' });
    const keep = await readyForLongWait(c, { flags: { longWaitSeen: true } });
    expect(c.dispatch({ type: 'upgrade', id: keep.id }).ok).toBe(true);
    expect(shown).toEqual(['starter_pack']);
  });

  it('the Artisan\'s Bundle waits until the Starter Pack has been shown', () => {
    const s = createNewVillage(0, data);
    const now = 30 * HOUR;
    s.profile.under18 = false;
    s.profile.ageBand = 'adult';
    expect(triggerOffer(s, 'all_builders_busy', now, data)).toBeNull();
    expect(triggerOffer(s, 'first_long_wait', now, data)?.id).toBe('starter_pack');
    expect(triggerOffer(s, 'all_builders_busy', now + HOUR, data)?.id).toBe('builder_pack');
  });
});

describe('E03: the Clan Stipend is the entry product, not the ceiling', () => {
  it('pays less than the $9.99 Box in all, and more Jade per dollar than any pack', () => {
    const st = data.store.stipend!;
    const box = data.store.packs.find((p) => p.usd === 9.99)!;
    expect(st.payments * st.jadePerPayment).toBeLessThan(box.moonstones);
    for (const p of data.store.packs) expect((st.payments * st.jadePerPayment) / st.usd).toBeGreaterThan(p.moonstones / p.usd);
  });

  it('a stipend bought before the price change keeps paying 20 a payment (save v18)', () => {
    const s = createNewVillage(0, data);
    const old = { ...serialize(s, 0), version: 17 } as unknown as { version: number; village: Record<string, unknown> };
    old.village.stipend = { left: 3, lastDay: -1 };
    const v = migrate(old, data).village;
    expect(v.stipend).toEqual({ left: 3, lastDay: -1, jade: 60 });
    let paid = 0;
    for (let d = 0; d < 3; d++) paid += claimStipend(v, T + d * 86_400_000, data) ?? 0;
    expect(paid).toBe(60);
    // A new one adds the new rate on top.
    addStipend(v, data);
    expect(v.stipend.jade).toBe(data.store.stipend!.payments * data.store.stipend!.jadePerPayment);
  });
});

describe('E05: less free Jade, cheaper time', () => {
  it('the streak\'s own Jade comes once a week at the top step, not every day', () => {
    let s = createNewVillage(T, data);
    const top = data.daily.streak.steps.length;
    let streakJadeTotal = 0;
    for (let d = 0; d < 28; d++) {
      const r = applyCommand(s, { type: 'openDailyChest' }, T + d * 86_400_000, data);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
      streakJadeTotal += s.daily.history[s.daily.history.length - 1].streakJade ?? 0;
    }
    expect(s.daily.step).toBe(top);
    const per = data.daily.streak.steps[top - 1].moonstones!;
    // Days 7..28 at the top step: 22 days used to pay 22 times; now at most once in every 7 days.
    expect(streakJadeTotal).toBeLessThanOrEqual(per * 4);
    expect(streakJadeTotal).toBeGreaterThanOrEqual(per * 3);
  });

  it('building skips cost ~40% less; finishing an army keeps its price (skip-and-raid)', () => {
    expect(skipCost(86_400, data)).toBe(180);
    expect(trainingSkipCost(7200, 1, data)).toBeGreaterThan(skipCost(7200, data));
  });
});

describe('E19: more to spend Jade on', () => {
  it('Keep looks to aim for: locked below their Keep, bought once at it', () => {
    const gated = data.cosmetics.hallSkins.filter((k) => k.minKeep);
    expect(gated.length).toBeGreaterThanOrEqual(3);
    const look = gated[0];
    const s = createNewVillage(0, data);
    s.resources.moonstones = 10_000;
    const r = applyCommand(s, { type: 'buySkin', skin: look.id }, 1, data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(`Keep ${look.minKeep}`);
    const keep = s.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
    keep.level = look.minKeep!;
    const ok = applyCommand(s, { type: 'buySkin', skin: look.id }, 1, data);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.state.resources.moonstones).toBe(10_000 - look.moonstones);
  });

  it('reaching a Keep level offers the Keep Celebration (after the Starter Pack), sold as its own store product', async () => {
    const { c, clock } = await controller();
    const shown: string[] = [];
    c.onOffer((r) => shown.push(r.id));
    c.dispatch({ type: 'setProfile', under18: false, ageBand: 'adult' });
    const keep = await readyForLongWait(c);
    await c.replace({ ...c.state, offers: { ...c.state.offers, lastShown: { starter_pack: c.now() - 100 * HOUR } } });
    expect(c.dispatch({ type: 'upgrade', id: keep.id }).ok).toBe(true);
    clock.advanceHours(24 * 8);
    c.tick();
    expect(shown).toContain('keep_pack');
    expect(data.store.storeProductIds?.offer_keep).toBe('offer_keep');
  });
});
