/**
 * Store purchases on the server (roadmap steps 35-38): App Store JWS checked
 * against a pinned root (a test chain here, never Apple's), Google Play tokens
 * checked with the Play Developer API (faked) and consumed, each transaction
 * credited once, the under-18 cap across devices, history, and refunds that
 * take back what is still in a server-held village.
 */
import { createHash, generateKeyPairSync, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppleVerifier, PurchaseError } from '../../../server/payments/apple';
import { GoogleVerifier, type Fetch } from '../../../server/payments/google';
import { ServerError } from '../../../src/backend/net/ports';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { productForStoreId, storeProductId } from '../../../src/gameplay/sim/monetization';
import { deserialize } from '../../../src/gameplay/sim/save';
import { world } from './harness';
import { repoFactories } from './pg';

const dir = resolve(__dirname, '../fixtures/appstore');
const pem = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const der = (f: string) => new X509Certificate(pem(f)).raw.toString('base64');
const chain = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
const rootFp = createHash('sha256').update(new X509Certificate(pem('root.pem')).raw).digest('hex');
const leafKey = pem('leaf.key');
const BUNDLE = 'com.toadstoolkingdoms.app';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function jws(payload: Record<string, unknown>, x5c = chain, key = leafKey): string {
  const head = `${b64({ alg: 'ES256', x5c })}.${b64(payload)}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
let txn = 1000;
function appleTxn(storeId: string, accountToken: string | null, over: Record<string, unknown> = {}) {
  const id = String(++txn);
  return jws({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: storeId, purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment: 'Sandbox', ...(accountToken ? { appAccountToken: accountToken } : {}), ...over });
}

/** Checked on the real clock: the test certificates were made today and last a century. */
function apple() {
  return new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], now: () => Date.now() });
}

/** A fake Google Play Developer API: tokens it knows, and what was consumed. */
function fakeGoogle() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const tokens = new Map<string, Record<string, unknown>>();
  const consumed: string[] = [];
  const voided: Record<string, unknown>[] = [];
  const fetch: Fetch = async (url, init) => {
    const ok = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'test-access', expires_in: 3600 });
    if (url.includes('/voidedpurchases')) return ok({ voidedPurchases: voided });
    const m = /tokens\/([^:/?]+)(:consume)?$/.exec(url);
    if (m) {
      const t = tokens.get(decodeURIComponent(m[1]));
      if (!t) return ok({ error: { code: 404 } }, 404);
      if (m[2] && init?.method === 'POST') {
        consumed.push(decodeURIComponent(m[1]));
        t.consumptionState = 1;
        return ok({});
      }
      return ok(t);
    }
    return ok({}, 404);
  };
  const account = { client_email: 'play@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  return { tokens, consumed, voided, fetch, account };
}

describe('App Store receipts (step 35)', () => {
  const now = () => Date.now();
  it('accepts a JWS that chains to the pinned root, for our app', () => {
    const t = apple().transaction(appleTxn('jade_pouch', 'aaaaaaaa-0000-4000-8000-000000000001'));
    expect(t).toMatchObject({ productId: 'jade_pouch', bundleId: BUNDLE, environment: 'Sandbox', appAccountToken: 'aaaaaaaa-0000-4000-8000-000000000001' });
  });
  it('refuses another root, a changed payload, another app, a refused environment and a wrong-shaped chain', () => {
    const v = apple();
    expect(() => new AppleVerifier({ bundleIds: [BUNDLE], now }).transaction(appleTxn('jade_pouch', null))).toThrow(PurchaseError); // Apple's real root is pinned by default
    const good = appleTxn('jade_pouch', null);
    const [h, , s] = good.split('.');
    expect(() => v.transaction(`${h}.${b64({ transactionId: '1', productId: 'jade_hoard', bundleId: BUNDLE, environment: 'Sandbox' })}.${s}`)).toThrow(/not genuine/);
    expect(() => v.transaction(appleTxn('jade_pouch', null, { bundleId: 'com.other.app' }))).toThrow(/another app/);
    expect(() => new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], environments: ['Production'], now }).transaction(appleTxn('jade_pouch', null))).toThrow(/Sandbox/);
    // The intermediate in the leaf's place: it lacks the receipt-signing marker.
    expect(() => v.transaction(jws({ transactionId: '9', productId: 'jade_pouch', bundleId: BUNDLE, environment: 'Sandbox' }, [chain[1], chain[1], chain[2]]))).toThrow(PurchaseError);
    // Signed with another key (a self-made leaf cannot sign for the real one).
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => v.transaction(jws({ transactionId: '9', productId: 'jade_pouch', bundleId: BUNDLE, environment: 'Sandbox' }, chain, other))).toThrow(/not genuine/);
  });
  it('reads a server notification and its transaction', () => {
    const inner = appleTxn('jade_pouch', null, { revocationDate: now() });
    const n = apple().notification(jws({ notificationType: 'REFUND', notificationUUID: 'n1', data: { bundleId: BUNDLE, environment: 'Sandbox', signedTransactionInfo: inner } }));
    expect(n.notificationType).toBe('REFUND');
    expect(n.transaction?.revocationDate).toBeGreaterThan(0);
  });
});

describe('product ids in the stores (step 38)', () => {
  it('maps every product the game sells to one store id and back', () => {
    const ids = [...data.store.packs.map((p) => p.id), data.pass.productId, ...data.offers.rules.map((o) => o.productId)];
    const storeIds = ids.map((id) => storeProductId(data, id));
    expect(new Set(storeIds).size).toBe(ids.length);
    for (const [i, id] of ids.entries()) expect(productForStoreId(data, storeIds[i])?.id).toBe(id);
    // A game id renamed away in the stores is not sold under its old name.
    expect(productForStoreId(data, 'moonstones_1')).toBeNull();
    expect(storeProductId(data, 'moonstones_1')).toBe('jade_pouch');
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`purchases on ${label} storage (steps 35-37)`, () => {
    async function setup() {
      const g = fakeGoogle();
      const w = world({ repo: await makeRepo(), shared: { payments: { apple: apple(), google: new GoogleVerifier({ packageName: BUNDLE, account: g.account, fetch: g.fetch, now: () => w.now(), allowTest: true }) } } });
      return { w, g };
    }

    /** A player whose village is on the server and who said they are an adult. */
    async function adult(w: Awaited<ReturnType<typeof setup>>['w']) {
      const p = await w.player('Ann');
      await p.startVillage();
      await p.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
      return p;
    }

    it('credits an App Store purchase once, into the server-held village, and never to another player', async () => {
      const { w } = await setup();
      const ann = await adult(w);
      const before = deserialize((await ann.getVillage())!.file, data).resources.moonstones;
      const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false });
      expect(intent.storeProductId).toBe('jade_bag');
      const receipt = appleTxn('jade_bag', intent.accountToken);
      const r = await ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt });
      expect(r).toMatchObject({ productId: 'moonstones_2', usd: 4.99, heldOnServer: true, already: false });
      const after = deserialize((await ann.getVillage())!.file, data);
      expect(after.resources.moonstones - before).toBe(280);
      expect(after.purchases.map((p) => p.id)).toContain(r.transactionId);
      expect((await ann.ledger(10)).entries[0]).toMatchObject({ resource: 'moonstones', delta: 280, reason: 'purchase:apple' });
      // A retry (the game crashed before finishing the transaction) credits nothing new.
      expect(await ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt })).toMatchObject({ already: true, transactionId: r.transactionId });
      expect(deserialize((await ann.getVillage())!.file, data).resources.moonstones - before).toBe(280);
      // Someone else sending the same receipt is refused.
      const ben = await w.player('Ben');
      await expect(ben.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt })).rejects.toMatchObject({ code: 'conflict' });
      // A purchase made for Ann's intent cannot be redeemed by Ben either.
      const second = appleTxn('jade_bag', (await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false })).accountToken);
      await expect(ben.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: second })).rejects.toMatchObject({ code: 'conflict' });
      expect((await ann.purchaseHistory()).purchases).toEqual([expect.objectContaining({ transactionId: r.transactionId, productId: 'moonstones_2', status: 'credited', store: 'apple' })]);
    });

    it('records a device-village purchase for the game to deliver, and refuses forged receipts', async () => {
      const { w } = await setup();
      const ann = await w.player('Ann');
      const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false });
      const r = await ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: appleTxn('jade_pouch', intent.accountToken) });
      expect(r).toMatchObject({ heldOnServer: false, already: false, productId: 'moonstones_1' });
      await expect(ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: 'not.a.jws' })).rejects.toBeInstanceOf(ServerError);
      await expect(ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: appleTxn('not_ours', null) })).rejects.toMatchObject({ code: 'bad_request' });
    });

    it('keeps a player under 18 within the monthly cap across devices, counting open intents', async () => {
      const { w } = await setup();
      const kid = await w.player('Kid');
      const cap = data.store.minorMonthlyCapUsd; // 50
      // 49.99 goes through …
      const big = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true });
      // … while that intent is open, another 1.99 would pass the cap.
      await expect(kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true })).rejects.toMatchObject({ code: 'purchase_refused' });
      await kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: appleTxn('jade_vault', big.accountToken) });
      await expect(kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true })).rejects.toMatchObject({ code: 'purchase_refused' });
      expect(cap).toBe(50);
      // Next month the cap starts over.
      w.setTime(Date.UTC(2026, 4, 1, 1));
      expect((await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true })).accountToken).toMatch(/^[0-9a-f-]{36}$/);
      // No age group: asked first (a new player). The server remembers the kid's answer (GLOBAL-006).
      const fresh = await w.player('Fresh');
      await expect(fresh.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: null })).rejects.toMatchObject({ code: 'purchase_refused' });
      expect(await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: null })).toMatchObject({ storeProductId: 'jade_pouch' });
    });

    it('reserves the cap atomically: simultaneous intents cannot both pass it (GLOBAL-004)', async () => {
      const { w } = await setup();
      const kid = await w.player('Kid');
      // Two $49.99 intents at once (two taps, two devices): only one fits the $50 cap.
      const both = await Promise.allSettled([1, 2, 3].map(() => kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true })));
      expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(both.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason.code)).toEqual(['purchase_refused', 'purchase_refused']);
    });

    it('frees the cap when a purchase is cancelled and holds it while one is pending (GLOBAL-005)', async () => {
      const { w } = await setup();
      const kid = await w.player('Kid');
      const first = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true });
      await expect(kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true })).rejects.toMatchObject({ code: 'purchase_refused' });
      // The player closed the store sheet: nothing was charged, the hold ends now.
      expect(await kid.releaseIntent({ accountToken: first.accountToken, outcome: 'cancelled' })).toEqual({ changed: true });
      const second = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true });
      // Ask to Buy: still held well past the normal 30 minutes, so a late approval cannot pass the cap.
      await kid.releaseIntent({ accountToken: second.accountToken, outcome: 'pending' });
      w.advance(3 * 24 * 3_600_000);
      await expect(kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true })).rejects.toMatchObject({ code: 'purchase_refused' });
      // A "cancelled" for an intent already used, or someone else's, changes nothing.
      const other = await w.player('Other');
      expect(await other.releaseIntent({ accountToken: second.accountToken, outcome: 'cancelled' })).toEqual({ changed: false });
      await kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: appleTxn('jade_vault', second.accountToken) });
      expect(await kid.releaseIntent({ accountToken: second.accountToken, outcome: 'cancelled' })).toEqual({ changed: false });
      // The approved purchase counts this month.
      await expect(kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true })).rejects.toMatchObject({ code: 'purchase_refused' });
    });

    it('keeps under 18 once said: no device or village can switch it back; staff can (GLOBAL-006)', async () => {
      const { w } = await setup();
      const kid = await w.player('Kid');
      await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: true });
      await kid.startVillage();
      // The game sends "adult" (another device, an edited client, a new village): ignored.
      await kid.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
      expect(deserialize((await kid.getVillage())!.file, data).profile.under18).not.toBe(false);
      w.advance(31 * 24 * 3_600_000);
      await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: false });
      await expect(kid.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false })).rejects.toMatchObject({ code: 'purchase_refused' });
      // Support checked: staff clear it, and the player is asked again.
      await w.core.admin.resetAge('staff', kid.id, { note: 'parent confirmed adult account holder' });
      expect(deserialize((await kid.getVillage())!.file, data).profile.under18).toBeNull();
      await expect(w.core.admin.resetAge('staff', kid.id, {})).rejects.toMatchObject({ code: 'bad_request' });
    });

    it('takes refunded Jade back from a server-held village, as far as it is still there (App Store notification)', async () => {
      const { w } = await setup();
      const ann = await adult(w);
      const start = deserialize((await ann.getVillage())!.file, data).resources.moonstones;
      const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false });
      const receipt = appleTxn('jade_pouch', intent.accountToken);
      const r = await ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt });
      const id = r.transactionId.slice('apple:'.length);
      const inner = appleTxn('jade_pouch', null, { transactionId: id, originalTransactionId: id, revocationDate: w.now() });
      await w.core.appleNotification({ signedPayload: jws({ notificationType: 'REFUND', notificationUUID: 'n1', data: { bundleId: BUNDLE, environment: 'Sandbox', signedTransactionInfo: inner } }) });
      expect(deserialize((await ann.getVillage())!.file, data).resources.moonstones).toBe(start);
      expect((await ann.purchaseHistory()).purchases[0].status).toBe('refunded');
      expect((await ann.ledger(5)).entries[0]).toMatchObject({ delta: -100, reason: 'refund:apple' });
      // Sent twice: nothing more is taken.
      await w.core.appleNotification({ signedPayload: jws({ notificationType: 'REFUND', notificationUUID: 'n2', data: { bundleId: BUNDLE, environment: 'Sandbox', signedTransactionInfo: inner } }) });
      expect(deserialize((await ann.getVillage())!.file, data).resources.moonstones).toBe(start);
      // A refunded receipt is never redeemed again.
      await expect(ann.redeem({ store: 'apple', storeProductId: 'jade_pouch', receipt: inner })).rejects.toMatchObject({ code: 'bad_request' });
      // A forged notification is refused.
      await expect(w.core.appleNotification({ signedPayload: 'x.y.z' })).rejects.toMatchObject({ status: 400 });
    });

    it('checks and consumes Google Play purchases, and revokes voided ones (step 36)', async () => {
      const { w, g } = await setup();
      const ann = await adult(w);
      const start = deserialize((await ann.getVillage())!.file, data).resources.moonstones;
      const intent = await ann.purchaseIntent({ store: 'google', productId: 'moonstones_3', under18: false });
      g.tokens.set('token-abc-123456', { purchaseState: 0, consumptionState: 0, orderId: 'GPA.1111', purchaseTimeMillis: String(w.now()), obfuscatedExternalAccountId: intent.accountToken, purchaseType: 0 });
      g.tokens.set('token-pending-123', { purchaseState: 2, consumptionState: 0, orderId: 'GPA.2222' });
      const r = await ann.redeem({ store: 'google', storeProductId: 'jade_box', receipt: 'token-abc-123456' });
      expect(r).toMatchObject({ transactionId: 'google:GPA.1111', productId: 'moonstones_3', heldOnServer: true });
      expect(g.consumed).toEqual(['token-abc-123456']);
      expect(deserialize((await ann.getVillage())!.file, data).resources.moonstones - start).toBe(600);
      await expect(ann.redeem({ store: 'google', storeProductId: 'jade_box', receipt: 'token-pending-123' })).rejects.toMatchObject({ code: 'bad_request' });
      await expect(ann.redeem({ store: 'google', storeProductId: 'jade_box', receipt: 'token-unknown-999' })).rejects.toMatchObject({ code: 'bad_request' });
      // Voided (refund or chargeback): the hourly poll takes it back once.
      g.voided.push({ purchaseToken: 'token-abc-123456', orderId: 'GPA.1111', voidedTimeMillis: String(w.now()) });
      expect(await w.core.pollVoided(w.now() - 86_400_000)).toBe(1);
      expect(await w.core.pollVoided(w.now() - 86_400_000)).toBe(0);
      expect(deserialize((await ann.getVillage())!.file, data).resources.moonstones).toBe(start);
    });

    it('lists the stores it checks in /v1/hello, and refuses an unconfigured one before paying', async () => {
      const w = world({ repo: await makeRepo() });
      expect(w.core.hello().features).not.toContain('purchases-apple');
      const ann = await w.player('Ann');
      await expect(ann.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false })).rejects.toMatchObject({ code: 'purchase_refused' });
      const { w: w2 } = await setup();
      expect(w2.core.hello().features).toEqual(expect.arrayContaining(['purchases-apple', 'purchases-google']));
    });
  });
}

describe('service account tokens', () => {
  it('signs an RS256 assertion Google can check', async () => {
    const g = fakeGoogle();
    let body = '';
    const fetch: Fetch = async (url, init) => {
      if (url.includes('oauth2')) body = init?.body ?? '';
      return g.fetch(url, init);
    };
    const v = new GoogleVerifier({ packageName: BUNDLE, account: g.account, fetch, now: () => Date.UTC(2026, 3, 6) });
    g.tokens.set('token-zzz-0000001', { purchaseState: 0, orderId: 'GPA.3', purchaseType: 1 });
    expect((await v.purchase('jade_pouch', 'token-zzz-0000001')).transactionId).toBe('GPA.3');
    const assertion = new URLSearchParams(body).get('assertion')!;
    const [h, p] = assertion.split('.');
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ iss: g.account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher' });
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
  });
});
