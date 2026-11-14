/**
 * Remnant audit (2026-11-06): refunds of the two products whose value is not in `grants`.
 * - A Clan Stipend refund used to cancel only the payments still waiting: claimed Jade stayed, and the
 *   Jade still owed paid out with the next stipend (buy, refund, buy: 720 Jade for one paid stipend).
 * - A Season Scroll refund only switched the premium track off: claimed premium rewards and the
 *   Scroll-only look stayed.
 * - A reversed refund gave nothing back for either.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { passSeason } from '../../../src/gameplay/sim/pass';
import { migrate, serialize, SAVE_VERSION } from '../../../src/gameplay/sim/save';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 20, 12);
const st = data.store.stipend!;
const SOLD = st.payments * st.jadePerPayment;

function run(s: VillageState, cmd: Command, t: number): VillageState {
  const r = applyCommand(s, cmd, t, data);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.message}`);
  return r.state;
}

/** Jade the stipend paid out in this test file's claims (league season chests also add Jade over a month). */
let paid = 0;

/** Claim one payment a day for `days` days; returns the state and the time after. */
function claimDays(s: VillageState, t: number, days: number): [VillageState, number] {
  for (let d = 0; d < days; d++) {
    t += DAY;
    const r = applyCommand(s, { type: 'claimStipend' }, t, data);
    if (!r.ok) continue;
    s = r.state;
    for (const e of r.events) if (e.kind === 'stipend_claimed') paid += e.moonstones;
  }
  return [s, t];
}

describe('Clan Stipend refunds', () => {
  it('a refund before any claim leaves nothing owed, so the next stipend pays only its own Jade', () => {
    let t = T;
    let s = createNewVillage(t, data);
    const jade0 = s.resources.moonstones;
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }, t);
    expect(s.purchases.at(-1)!.stipend).toEqual({ payments: st.payments, jade: SOLD });
    s = run(s, { type: 'revokePurchase', transactionId: 'apple:1' }, t);
    expect(s.stipend).toMatchObject({ left: 0, jade: 0 });
    expect(s.resources.moonstones).toBe(jade0);
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:2', verified: true }, t);
    paid = 0;
    [s, t] = claimDays(s, t, st.payments + 10);
    expect(paid).toBe(SOLD);
  });

  it('Jade already claimed comes back too, as a debt when it was spent', () => {
    let t = T;
    let s = createNewVillage(t, data);
    const jade0 = s.resources.moonstones;
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }, t);
    [s, t] = claimDays(s, t, 10);
    expect(s.resources.moonstones - jade0).toBe(10 * st.jadePerPayment);
    s = run(s, { type: 'revokePurchase', transactionId: 'apple:1' }, t);
    expect(s.resources.moonstones).toBe(jade0);
    expect(s.stipend).toMatchObject({ left: 0, jade: 0 });
    // Claimed, spent, then refunded: the claimed Jade is a debt.
    let u = createNewVillage(t, data);
    u = run(u, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:3', verified: true }, t);
    [u, t] = claimDays(u, t, st.payments);
    u.resources.moonstones = 0;
    u = run(u, { type: 'revokePurchase', transactionId: 'apple:3' }, t);
    expect(u.resources.moonstones).toBe(-SOLD);
  });

  it('with two stipends running, refunding one leaves exactly one stipend of Jade in all', () => {
    let t = T;
    let s = createNewVillage(t, data);
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }, t);
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'google:2', verified: true }, t);
    paid = 0;
    [s, t] = claimDays(s, t, 10);
    s = run(s, { type: 'revokePurchase', transactionId: 'google:2' }, t);
    [s, t] = claimDays(s, t, 2 * st.payments);
    expect(paid).toBe(SOLD);
    expect(s.stipend).toMatchObject({ left: 0, jade: 0 });
  });

  it('a second refund of the same purchase takes nothing more; a reversed refund gives back exactly what it took', () => {
    let t = T;
    let s = createNewVillage(t, data);
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }, t);
    [s, t] = claimDays(s, t, 10);
    const before = structuredClone({ resources: s.resources, stipend: s.stipend });
    s = run(s, { type: 'revokePurchase', transactionId: 'apple:1' }, t);
    const refunded = structuredClone(s.resources);
    expect(applyCommand(s, { type: 'revokePurchase', transactionId: 'apple:1' }, t, data)).toMatchObject({ ok: false, code: 'ALREADY_CLAIMED' });
    expect(s.resources).toEqual(refunded);
    s = run(s, { type: 'reinstatePurchase', transactionId: 'apple:1' }, t);
    expect({ resources: s.resources, stipend: s.stipend }).toEqual(before);
    expect(s.purchases[0].refund).toBeUndefined();
    // Refunded again later: taken back again.
    s = run(s, { type: 'revokePurchase', transactionId: 'apple:1' }, t);
    expect(s.resources).toEqual(refunded);
  });
});

describe('Season Scroll refunds', () => {
  /** A Keep 8 village that reached every tier this season, bought the Scroll and claimed every premium tier. */
  function claimedAll(t: number) {
    let s = createNewVillage(t, data);
    s.buildings = s.buildings.map((b) => (['storage', 'hall'].includes(data.buildings[b.type].category) ? { ...b, level: Math.min(8, data.buildings[b.type].levels.length) } : b));
    s.pass.season = passSeason(t, data);
    s.pass.points = data.pass.tiers.length * data.pass.pointsPerTier;
    const before = structuredClone(s);
    s = run(s, { type: 'grantPurchase', productId: data.pass.productId, transactionId: 'apple:9', verified: true }, t);
    for (const tier of data.pass.tiers) s = run(s, { type: 'claimTier', tier: tier.tier, track: 'premium' }, t);
    return { before, s };
  }

  it('takes back every claimed premium reward and the Scroll-only look, and lets a new Scroll claim again', () => {
    const { before, s: claimed } = claimedAll(T);
    const look = data.cosmetics.hallSkins.find((k) => k.passOnly)!.id;
    expect(claimed.cosmetics.owned).toContain(look);
    expect(claimed.resources.moonstones).toBeGreaterThan(before.resources.moonstones);
    const wearing = run(claimed, { type: 'equipSkin', skin: look }, T);
    const s = run(wearing, { type: 'revokePurchase', transactionId: 'apple:9' }, T);
    expect(s.resources).toEqual(before.resources);
    expect(s.cosmetics.owned).not.toContain(look);
    expect(s.cosmetics.hallSkin).toBe(data.cosmetics.hallSkins[0].id);
    expect(s.pass.premium).toBe(false);
    expect(s.pass.claimedPremium).toEqual([]);
    // Bought again this season: the tiers can be claimed again (the first rewards were taken back).
    const again = run(s, { type: 'grantPurchase', productId: data.pass.productId, transactionId: 'apple:10', verified: true }, T);
    expect(applyCommand(again, { type: 'claimTier', tier: 1, track: 'premium' }, T, data).ok).toBe(true);
  });

  it('what was spent becomes a debt; a reversed refund gives everything back', () => {
    const { s: claimed } = claimedAll(T);
    const full = structuredClone({ resources: claimed.resources, cosmetics: claimed.cosmetics, pass: claimed.pass });
    claimed.resources.moonstones = 0;
    let s = run(claimed, { type: 'revokePurchase', transactionId: 'apple:9' }, T);
    const granted = claimed.purchases.find((p) => p.id === 'apple:9')!.premium!.granted;
    expect(s.resources.moonstones).toBe(-(granted.moonstones ?? 0));
    s = run(s, { type: 'reinstatePurchase', transactionId: 'apple:9' }, T);
    expect(s.resources.moonstones).toBe(0);
    expect(s.resources.acorns).toBe(full.resources.acorns);
    expect(s.cosmetics.owned.sort()).toEqual([...full.cosmetics.owned].sort());
    expect(s.pass.premium).toBe(true);
    expect([...s.pass.claimedPremium].sort((a, b) => a - b)).toEqual([...full.pass.claimedPremium].sort((a, b) => a - b));
  });

  it('a Scroll refunded in a later season still gives back what its claims gave, and leaves this season alone', () => {
    const { s: claimed } = claimedAll(T);
    const granted = claimed.purchases.find((p) => p.id === 'apple:9')!.premium!.granted;
    const later = T + data.pass.seasonDays * DAY;
    // The same month passing without a refund (collectors, a league chest), for comparison.
    const control = advance(structuredClone(claimed), later, data).state;
    // The season rolls over when the command runs (advance): the new season has no premium to switch off.
    const s = run(claimed, { type: 'revokePurchase', transactionId: 'apple:9' }, later);
    for (const k of ['acorns', 'dew', 'moonstones'] as const) expect(s.resources[k], k).toBe(control.resources[k] - (granted[k] ?? 0));
    expect(s.pass.season).toBe(passSeason(later, data));
    expect(s.pass.premium).toBe(false);
  });
});

describe('a village the server keeps (economy: false)', () => {
  it('changes the stipend, the Scroll and looks, never the resources the server already changed', () => {
    let t = T;
    let s = createNewVillage(t, data);
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }, t);
    [s, t] = claimDays(s, t, 5);
    const resources = structuredClone(s.resources);
    s = run(s, { type: 'revokePurchase', transactionId: 'apple:1', economy: false }, t);
    expect(s.resources).toEqual(resources);
    expect(s.stipend).toMatchObject({ left: 0, jade: 0 });
    s = run(s, { type: 'reinstatePurchase', transactionId: 'apple:1', economy: false }, t);
    expect(s.resources).toEqual(resources);
    expect(s.stipend.left).toBe(st.payments - 5);
  });
});

describe('save v20', () => {
  it('a stipend with no payments left owes nothing (a refund used to leave its Jade owed)', () => {
    const s = createNewVillage(T, data);
    const file = { ...serialize(s, T), version: 19 };
    (file.village as VillageState).stipend = { left: 0, lastDay: 3, jade: SOLD };
    const out = migrate(structuredClone(file), data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(23);
    expect(out.village.stipend).toEqual({ left: 0, lastDay: 3, jade: 0 });
    // A running stipend keeps what it owes.
    (file.village as VillageState).stipend = { left: 4, lastDay: 3, jade: 48 };
    expect(migrate(structuredClone(file), data).village.stipend).toEqual({ left: 4, lastDay: 3, jade: 48 });
  });

  it('a stipend bought on such a pool pays only its own Jade even before the save is migrated', () => {
    let t = T;
    let s = createNewVillage(t, data);
    s.stipend = { left: 0, lastDay: -1, jade: SOLD };
    s = run(s, { type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }, t);
    paid = 0;
    [s, t] = claimDays(s, t, st.payments + 5);
    expect(paid).toBe(SOLD);
  });
});

describe('the game applies the server\'s refund records (GameController.settleRefunds)', () => {
  async function controller() {
    const { GameController } = await import('../../../src/gameplay/control/controller');
    const { FakeClock } = await import('../../../src/gameplay/sim/clock');
    const { MemorySaveStore } = await import('../../../src/backend/persist/saveStore');
    const { Analytics, MemoryEventStore } = await import('../../../src/backend/analytics/events');
    const { MockPaymentProvider } = await import('../../../src/backend/payments/provider');
    const clock = new FakeClock(T);
    const { controller: c } = await GameController.start({ clock, store: new MemorySaveStore(), analytics: new Analytics(new MemoryEventStore(), clock, 't'), data, payments: new MockPaymentProvider(() => clock.now()) });
    let history: { transactionId: string; store: 'apple' | 'google'; productId: string; usd: number; at: number; status: 'credited' | 'refunded' }[] = [];
    c.purchaseVerifier = () => ({ intent: async () => ({ accountToken: 'x', storeProductId: 'x' }), redeem: async () => { throw new Error('unused'); }, history: async () => history });
    return { c, setHistory: (h: typeof history) => (history = h) };
  }

  it('takes back a refunded purchase on a village on the device once, and gives it back when the refund is reversed', async () => {
    const { c, setHistory } = await controller();
    expect(c.dispatch({ type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true }).ok).toBe(true);
    expect(c.dispatch({ type: 'grantPurchase', productId: 'moonstones_1', transactionId: 'apple:2', verified: true }).ok).toBe(true);
    const jade = c.state.resources.moonstones;
    const entry = { store: 'apple' as const, usd: 1, at: T };
    setHistory([{ ...entry, transactionId: 'apple:1', productId: st.id, status: 'refunded' }, { ...entry, transactionId: 'apple:2', productId: 'moonstones_1', status: 'refunded' }, { ...entry, transactionId: 'apple:99', productId: 'moonstones_1', status: 'refunded' }]);
    expect(await c.settleRefunds(false)).toEqual({ revoked: 2, reinstated: 0 });
    expect(c.state.stipend).toMatchObject({ left: 0, jade: 0 });
    expect(c.state.resources.moonstones).toBe(jade - 100);
    expect(await c.settleRefunds(false)).toEqual({ revoked: 0, reinstated: 0 });
    setHistory([{ ...entry, transactionId: 'apple:2', productId: 'moonstones_1', status: 'credited' }]);
    expect(await c.settleRefunds(false)).toEqual({ revoked: 0, reinstated: 1 });
    expect(c.state.resources.moonstones).toBe(jade);
  });

  it('on a village the server keeps, leaves the resources to the server', async () => {
    const { c, setHistory } = await controller();
    c.dispatch({ type: 'grantPurchase', productId: st.id, transactionId: 'apple:1', verified: true });
    c.dispatch({ type: 'grantPurchase', productId: 'moonstones_1', transactionId: 'apple:2', verified: true });
    const resources = structuredClone(c.state.resources);
    setHistory([{ transactionId: 'apple:1', store: 'apple', productId: st.id, usd: 2.99, at: T, status: 'refunded' }, { transactionId: 'apple:2', store: 'apple', productId: 'moonstones_1', usd: 1.99, at: T, status: 'refunded' }]);
    expect(await c.settleRefunds(true)).toEqual({ revoked: 2, reinstated: 0 });
    expect(c.state.resources).toEqual(resources);
    expect(c.state.stipend).toMatchObject({ left: 0, jade: 0 });
  });
});
