/**
 * Japan C17: the staff report of the unused paid Jade balance on a 資金決済法 base date (docs/legal/JAPAN.md
 * section 3). Japanese-storefront Production purchases only, refunds before the base date left out, free Jade
 * spent first (server-held villages: the ledger balance at the base date; device-held: all paid Jade), yen at
 * the price paid, the ¥10,000,000 threshold and the deposit; every run kept as a staff action.
 */
import { describe, expect, it } from 'vitest';
import { latestBaseDate, JP_THRESHOLD_YEN } from '../../../server/core/japanBalance';
import { MemoryRepo, type PurchaseRow } from '../../../server/repo';
import { world } from './harness';
import { setup } from './httpHarness';

const STAFF = 'staff-token-0123456789-abcdefgh';
const BASE = '2026-09-30';
const BASE_END = Date.parse('2026-09-30T15:00:00Z') - 1; // 24:00 JST

const purchase = (p: Partial<PurchaseRow> & Pick<PurchaseRow, 'transactionId' | 'playerId' | 'productId' | 'at'>): PurchaseRow => ({
  store: 'apple',
  cents: 1999,
  environment: 'Production',
  status: 'credited',
  refundedAt: null,
  ref: p.transactionId,
  heldOnServer: false,
  storefront: 'JPN',
  currency: 'JPY',
  priceMicros: 3_000_000_000, // ¥3,000
  ...p,
});

describe('Japan C17: unused paid balance on a base date', () => {
  it('counts Japanese Production purchases, free Jade first, values them at the yen paid, and keeps the run', async () => {
    const w = world({ start: Date.parse('2026-10-10T00:00:00Z') });
    const repo = w.repo as MemoryRepo;
    const before = BASE_END - 86_400_000;
    // Ann (server-held village): bought 1,300 Jade for ¥3,000 and has 500 Jade on the base date → 500 unused paid.
    await repo.addPurchase(purchase({ transactionId: 'a1', playerId: 'ann', productId: 'moonstones_4', at: before }));
    repo.ledgerRows.push({ playerId: 'ann', at: before + 1000, resource: 'moonstones', delta: 1300, balance: 1500, reason: 'purchase:apple', ref: 'a1' });
    repo.ledgerRows.push({ playerId: 'ann', at: before + 2000, resource: 'moonstones', delta: -1000, balance: 500, reason: 'command:topUp', ref: '3' });
    // After the base date: ignored.
    repo.ledgerRows.push({ playerId: 'ann', at: BASE_END + 1000, resource: 'moonstones', delta: 2000, balance: 2500, reason: 'purchase:apple', ref: 'a9' });
    // Bo (device-held, Play, no price): 600 Jade, all counted, valued at the average yen per Jade.
    await repo.addPurchase(purchase({ store: 'google', transactionId: 'b1', playerId: 'bo', productId: 'moonstones_3', at: before, storefront: 'JP', currency: null, priceMicros: null }));
    // Left out: another storefront, a sandbox purchase, one refunded before the base date, one after it.
    await repo.addPurchase(purchase({ transactionId: 'c1', playerId: 'cy', productId: 'moonstones_4', at: before, storefront: 'USA', currency: 'USD', priceMicros: 19_990_000 }));
    await repo.addPurchase(purchase({ transactionId: 'd1', playerId: 'di', productId: 'moonstones_4', at: before, environment: 'Sandbox' }));
    await repo.addPurchase(purchase({ transactionId: 'e1', playerId: 'ed', productId: 'moonstones_4', at: before, status: 'refunded', refundedAt: before + 10 }));
    await repo.addPurchase(purchase({ transactionId: 'f1', playerId: 'fu', productId: 'moonstones_4', at: BASE_END + 10 }));
    // Refunded only after the base date: still counted on the base date.
    await repo.addPurchase(purchase({ transactionId: 'g1', playerId: 'gi', productId: 'moonstones_1', at: before, status: 'refunded', refundedAt: BASE_END + 10, priceMicros: 300_000_000 }));

    const r = await w.core.admin.japanBalance('accountant', BASE);
    expect(r.baseDate).toBe(BASE);
    expect(r.baseAt).toBe(BASE_END);
    expect(r.purchasers).toBe(3); // ann, bo, gi
    expect(r.paidJade).toBe(1300 + 600 + 100);
    expect(r.unusedPaidJade).toBe(500 + 600 + 100);
    expect(r.serverHeldPlayers).toBe(1);
    expect(r.deviceHeldPlayers).toBe(2);
    // Ann ¥3,000/1,300 Jade × 500; Gi ¥300/100 × 100; Bo at the average of the priced (¥3,300 / 1,400 Jade) × 600.
    expect(r.unusedYen).toBe(Math.floor((3000 / 1300) * 500 + 300 + (3300 / 1400) * 600));
    expect(r.exceeds).toBe(false);
    expect(r.depositDueYen).toBeNull();
    expect(r.notifyBy).toBe('2026-11-30');
    expect(r.thresholdYen).toBe(JP_THRESHOLD_YEN);
    expect(repo.staffRows.find((a) => a.action === 'jp-unused-balance')).toMatchObject({ actor: 'accountant', detail: expect.objectContaining({ baseDate: BASE, unusedPaidJade: 1200 }) });
  });

  it('second verification 2026-11-14: Clan Stipend Jade still to be delivered is owed in full; the figure is labelled an upper bound', async () => {
    const w = world({ start: Date.parse('2026-10-10T00:00:00Z') });
    const repo = w.repo as MemoryRepo;
    const st = w.data.store.stipend!;
    const total = st.payments * st.jadePerPayment;
    const before = BASE_END - 10 * 86_400_000;
    await repo.addPurchase(purchase({ transactionId: 's1', playerId: 'su', productId: st.id, at: before }));
    // Five payments claimed by the base date, 40 Jade left in the balance; a sixth after it does not count.
    let bal = 0;
    for (let i = 0; i < 5; i++) {
      bal += st.jadePerPayment;
      repo.ledgerRows.push({ playerId: 'su', at: before + (i + 1) * 86_400_000, resource: 'moonstones', delta: st.jadePerPayment, balance: bal, reason: 'command:claimStipend', ref: String(i) });
    }
    repo.ledgerRows.push({ playerId: 'su', at: before + 6 * 86_400_000, resource: 'moonstones', delta: 40 - bal, balance: 40, reason: 'command:topUp', ref: '9' });
    repo.ledgerRows.push({ playerId: 'su', at: BASE_END + 1000, resource: 'moonstones', delta: st.jadePerPayment, balance: 40 + st.jadePerPayment, reason: 'command:claimStipend', ref: '10' });
    const r = await w.core.admin.japanBalance('accountant', BASE);
    const owed = total - 5 * st.jadePerPayment;
    expect(r.undeliveredStipendJade).toBe(owed);
    expect(r.unusedPaidJade).toBe(40 + owed);
    expect(r.upperBound).toBe(true);
    expect(r.notes.join(' ')).toMatch(/Upper bound/);
  });

  it('over ¥10,000,000: says so and gives the deposit due (half)', async () => {
    const w = world({ start: Date.parse('2026-10-10T00:00:00Z') });
    const repo = w.repo as MemoryRepo;
    for (let i = 0; i < 800; i++) await repo.addPurchase(purchase({ transactionId: `x${i}`, playerId: `p${i}`, productId: 'moonstones_5', at: BASE_END - 5000, priceMicros: 15_000_000_000 }));
    const r = await w.core.admin.japanBalance('accountant', BASE);
    expect(r.unusedYen).toBe(12_000_000);
    expect(r.exceeds).toBe(true);
    expect(r.depositDueYen).toBe(6_000_000);
  });

  it('only base dates that have ended; the default is the latest one', async () => {
    const w = world({ start: Date.parse('2026-10-10T00:00:00Z') });
    await expect(w.core.admin.japanBalance('a', '2026-10-01')).rejects.toMatchObject({ status: 400 });
    await expect(w.core.admin.japanBalance('a', '2027-03-31')).rejects.toMatchObject({ status: 400 });
    expect((await w.core.admin.japanBalance('a', undefined)).baseDate).toBe('2026-09-30');
    expect(latestBaseDate(Date.parse('2026-09-30T14:00:00Z'))).toBe('2026-03-31');
    expect(latestBaseDate(Date.parse('2026-09-30T15:00:00Z'))).toBe('2026-09-30');
    expect(latestBaseDate(Date.parse('2027-02-01T00:00:00Z'))).toBe('2026-09-30');
  });

  it('is a staff route', async () => {
    const s = setup({ adminTokens: { accountant: STAFF } });
    expect((await s.call('GET', '/admin/v1/reports/jp-unused-balance?date=2026-03-31')).status).toBe(401);
    const ok = await s.call('GET', '/admin/v1/reports/jp-unused-balance?date=2026-03-31', STAFF);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ baseDate: '2026-03-31', purchasers: 0, unusedYen: null, exceeds: false });
  });
});
