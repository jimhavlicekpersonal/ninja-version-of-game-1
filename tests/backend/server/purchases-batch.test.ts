/**
 * Backend batch 2026-11-13: purchase integrity. Google product cross-check (A11), released holds
 * (GLOBAL-005), refunds per device (A5), Sandbox credit per device and per day (A24), App Store
 * notification dedupe and ordering (A29), local store prices (GLOBAL-007).
 */
import { createHash, generateKeyPairSync, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppleVerifier } from '../../../server/payments/apple';
import { GoogleVerifier, type Fetch } from '../../../server/payments/google';
import { world } from './harness';

const dir = resolve(__dirname, '../fixtures/appstore');
const pem = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const der = (f: string) => new X509Certificate(pem(f)).raw.toString('base64');
const chain = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
const rootFp = createHash('sha256').update(new X509Certificate(pem('root.pem')).raw).digest('hex');
const BUNDLE = 'com.toadstoolkingdoms.app';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function jws(payload: Record<string, unknown>): string {
  const head = `${b64({ alg: 'ES256', x5c: chain })}.${b64(payload)}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key: pem('leaf.key'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
let txn = 70_000;
function appleTxn(storeId: string, accountToken: string | null, over: Record<string, unknown> = {}) {
  const id = String(++txn);
  return jws({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: storeId, purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment: 'Sandbox', ...(accountToken ? { appAccountToken: accountToken } : {}), ...over });
}
const apple = () => new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], now: () => Date.now() });
const DEVICE = 'device-aaaaaaaa';
const payments = (extra: Record<string, unknown> = {}) => ({ payments: { apple: apple(), ...extra } });

describe('A11: Google Play answers are cross-checked', () => {
  it('refuses an answer for another product and an incomplete purchase state', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const tokens = new Map<string, Record<string, unknown>>();
    const fetch: Fetch = async (url) => {
      const ok = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'test-access', expires_in: 3600 });
      const m = /tokens\/([^:/?]+)$/.exec(url);
      const t = m ? tokens.get(decodeURIComponent(m[1]!)) : undefined;
      return t ? ok(t) : ok({}, 404);
    };
    const v = new GoogleVerifier({ packageName: BUNDLE, account: { client_email: 'play@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, fetch, now: () => Date.UTC(2026, 3, 6) });
    tokens.set('token-cheap-000001', { purchaseState: 0, orderId: 'GPA.9', purchaseType: 1, productId: 'jade_pinch' });
    await expect(v.purchase('jade_hoard', 'token-cheap-000001')).rejects.toThrow(/another product/);
    expect((await v.purchase('jade_pinch', 'token-cheap-000001')).transactionId).toBe('GPA.9');
    tokens.set('token-odd-00000001', { purchaseState: 7, orderId: 'GPA.10', purchaseType: 1 });
    await expect(v.purchase('jade_pinch', 'token-odd-00000001')).rejects.toThrow(/not complete/);
  });
});

describe('purchase integrity on the server', () => {
  it('GLOBAL-005: releasing a hold and paying anyway does not take a minor past the cap', async () => {
    const w = world({ shared: payments() });
    const kid = await w.player('Kid');
    const big = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true }); // 49.99
    await kid.releaseIntent({ accountToken: big.accountToken, outcome: 'cancelled' }); // a modified game frees the hold …
    const small = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true }); // … to fit 1.99
    await kid.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: appleTxn('jade_pouch', small.accountToken) });
    // … then pays the "cancelled" one: refused at redeem (51.98 > 50), nothing credited.
    await expect(kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: appleTxn('jade_vault', big.accountToken) })).rejects.toMatchObject({ code: 'purchase_refused' });
    expect((await kid.purchaseHistory()).purchases).toHaveLength(1);
  });

  it('A5: refunds count per device, so a fresh account on the same phone stays paused', async () => {
    const w = world({ shared: payments() });
    const ann = await w.player('Ann');
    for (let i = 0; i < 3; i++) {
      const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false, device: DEVICE });
      const r = await ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: appleTxn('jade_pouch', intent.accountToken) });
      await w.repo.setPurchaseStatus('apple', r.transactionId.slice('apple:'.length), 'refunded', w.now());
    }
    const fresh = await w.player('Ann Again');
    await expect(fresh.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false, device: DEVICE })).rejects.toMatchObject({ code: 'purchase_refused', message: expect.stringMatching(/paused/) });
    // A server-held village played on that phone links the account too, without the intent naming it.
    const held = await w.player('Ann Held');
    await held.startVillage();
    await held.sendCommands({ device: DEVICE, stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
    await expect(held.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false })).rejects.toMatchObject({ code: 'purchase_refused' });
    // Another phone is not affected.
    const other = await w.player('Ben');
    expect((await other.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false, device: 'device-bbbbbbbb' })).accountToken).toBeTruthy();
  });

  it('A24: Sandbox credit is capped per device across accounts, and per day for the whole server', async () => {
    const w = world({ shared: { ...payments({ testCreditCapUsd: 10 }), policy: { sandboxDailyCapUsd: 15 } } });
    const buy = async (p: Awaited<ReturnType<typeof w.player>>, device: string) => {
      const i = await p.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false, device }); // 4.99, Sandbox
      return p.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: appleTxn('jade_bag', i.accountToken) });
    };
    const ann = await w.player('Ann');
    await buy(ann, DEVICE);
    await buy(ann, DEVICE);
    const again = await w.player('Ann Two');
    await expect(buy(again, DEVICE)).rejects.toMatchObject({ code: 'purchase_refused' }); // same phone: 14.97 > 10
    const ben = await w.player('Ben');
    await buy(ben, 'device-bbbbbbbb'); // 14.97 today on the whole server
    const cat = await w.player('Cat');
    await expect(buy(cat, 'device-cccccccc')).rejects.toMatchObject({ code: 'purchase_refused' }); // 19.96 > 15 a day
    w.advance(24 * 3_600_000);
    expect((await buy(cat, 'device-cccccccc')).already).toBe(false);
  });

  it('A29: a repeated App Store notification is applied once, and a late older REFUND does not undo a REFUND_REVERSED', async () => {
    const w = world({ shared: payments() });
    const ann = await w.player('Ann');
    const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false });
    const id = '55501';
    const inner = (over: Record<string, unknown> = {}) => jws({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: 'jade_pouch', purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment: 'Sandbox', ...over });
    await ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: inner({ appAccountToken: intent.accountToken }) });
    const note = (type: string, uuid: string, signedDate: number, over: Record<string, unknown> = {}) => ({ signedPayload: jws({ notificationType: type, notificationUUID: uuid, signedDate, data: { bundleId: BUNDLE, environment: 'Sandbox', signedTransactionInfo: inner(over) } }) });
    const t0 = w.now();
    // Apple reversed the refund (signed later), but that notification arrives first …
    await w.core.appleNotification(note('REFUND_REVERSED', 'u-2', t0 + 2000));
    // … then the refund it reversed, twice (a retry).
    await w.core.appleNotification(note('REFUND', 'u-1', t0 + 1000, { revocationDate: t0 + 1000 }));
    await w.core.appleNotification(note('REFUND', 'u-1', t0 + 1000, { revocationDate: t0 + 1000 }));
    expect((await w.repo.getPurchase('apple', id))!.status).toBe('credited');
    // A newer refund is applied, once.
    await w.core.appleNotification(note('REFUND', 'u-3', t0 + 3000, { revocationDate: t0 + 3000 }));
    expect((await w.repo.getPurchase('apple', id))!.status).toBe('refunded');
  });

  it('GLOBAL-007: a store-reported local price counts in USD with USD_RATES, else the catalog price', async () => {
    const w = world({ shared: { ...payments(), policy: { usdRates: { USD: 1, EUR: 1.1 } } } });
    const ann = await w.player('Ann');
    const i1 = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false });
    // Apple's `price` is in milli-units: 4.49 EUR ≈ 4.94 USD.
    const r1 = await ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: appleTxn('jade_bag', i1.accountToken, { currency: 'EUR', price: 4490 }) });
    expect(r1.usd).toBeCloseTo(4.94, 2);
    const i2 = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false });
    const r2 = await ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: appleTxn('jade_bag', i2.accountToken, { currency: 'JPY', price: 750000 }) });
    expect(r2.usd).toBe(4.99); // no JPY rate: the catalog price
  });
});
