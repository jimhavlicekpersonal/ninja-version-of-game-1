/**
 * Beast Mode 2026-11-21 (docs/audit/bulletproof-2026-11-21/PROGRESS.md): money paths on the server.
 *
 * ECO-01: two intents for one one-time product (the Season Scroll, an offer, the Clan Stipend) both passed, and a
 * second Scroll receipt for a village that already had it was granted again (the second payment bought nothing).
 */
import { createHash, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppleVerifier } from '../../../server/payments/apple';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { storeProductId } from '../../../src/gameplay/sim/monetization';
import { deserialize } from '../../../src/gameplay/sim/save';
import { world } from './harness';

const dir = resolve(__dirname, '../fixtures/appstore');
const pem = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const der = (f: string) => new X509Certificate(pem(f)).raw.toString('base64');
const chain = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
const rootFp = createHash('sha256').update(new X509Certificate(pem('root.pem')).raw).digest('hex');
const BUNDLE = 'com.toadstoolkingdoms.app';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
let txn = 121_000;
export function appleTxn(storeId: string, accountToken: string | null): string {
  const id = String(++txn);
  const head = `${b64({ alg: 'ES256', x5c: chain })}.${b64({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: storeId, purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment: 'Production', ...(accountToken ? { appAccountToken: accountToken } : {}) })}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key: pem('leaf.key'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const apple = () => new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], now: () => Date.now() });
const SCROLL = data.pass.productId;
const SCROLL_STORE = storeProductId(data, SCROLL);

async function adult(server = true) {
  const w = world({ shared: { payments: { apple: apple(), google: null } } as never });
  const p = await w.player('Ann');
  if (server) {
    await p.startVillage();
    await p.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
  }
  return { w, p };
}

describe('ECO-01: one open intent per one-time product', () => {
  it('two Scroll intents: the second is refused while the first is open (server village)', async () => {
    const { p } = await adult();
    await p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false });
    await expect(p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false })).rejects.toMatchObject({ code: 'purchase_refused', message: expect.stringContaining('already in progress') });
  });

  it('two Scroll intents: refused for a device-held village too', async () => {
    const { p } = await adult(false);
    await p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false });
    await expect(p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false })).rejects.toMatchObject({ code: 'purchase_refused' });
  });

  it('a cancelled intent frees the rule; Jade packs are unaffected', async () => {
    const { p } = await adult();
    const first = await p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false });
    await p.releaseIntent({ accountToken: first.accountToken, outcome: 'cancelled' });
    await expect(p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false })).resolves.toMatchObject({ storeProductId: SCROLL_STORE });
    await p.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: false });
    await expect(p.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: false })).resolves.toBeTruthy();
  });

  it('a second Scroll receipt for a premium village is not granted and not credited', async () => {
    const { w, p } = await adult();
    const a = await p.purchaseIntent({ store: 'apple', productId: SCROLL, under18: false });
    // A second open intent from before this rule (or a race the lock did not see): written straight to the store.
    await w.repo.addIntent({ id: 'b0000000-0000-4000-8000-000000000001', playerId: p.id, productId: SCROLL, cents: 499, at: w.now(), used: false, holdUntil: w.now() + 1_800_000, device: null });
    expect((await p.redeem({ store: 'apple', storeProductId: SCROLL_STORE, receipt: appleTxn(SCROLL_STORE, a.accountToken) })).already).toBe(false);
    await expect(p.redeem({ store: 'apple', storeProductId: SCROLL_STORE, receipt: appleTxn(SCROLL_STORE, 'b0000000-0000-4000-8000-000000000001') })).rejects.toMatchObject({ code: 'conflict' });
    const v = deserialize((await p.getVillage())!.file, data);
    expect(v.purchases.filter((x) => x.productId === SCROLL)).toHaveLength(1);
    expect((await p.purchaseHistory()).purchases).toHaveLength(1);
  });
});
