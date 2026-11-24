/**
 * Money audit 2026-11-24, server side.
 * - MONEY-02: an offer shown to an adult stayed buyable on the server after the player said they are under 18
 *   (`purchaseIntent` ran `canPurchase`, which did not check `offersAllowed`).
 * - MONEY-03: Sandbox redeems read the per-buyer test credit and the server-wide daily cap outside the transaction
 *   that writes the row, so parallel redeems all passed the same headroom. Memory, and Postgres with
 *   TEST_DATABASE_URL (where the advisory locks matter).
 * - MONEY-04: `ageGroupFor` took the server-held village's "adult" over the game's stated "under 18".
 */
import { createHash, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppleVerifier } from '../../../server/payments/apple';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { world } from './harness';
import { repoFactories } from './pg';

const dir = resolve(__dirname, '../fixtures/appstore');
const pem = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const der = (f: string) => new X509Certificate(pem(f)).raw.toString('base64');
const chain = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
const rootFp = createHash('sha256').update(new X509Certificate(pem('root.pem')).raw).digest('hex');
const BUNDLE = 'com.toadstoolkingdoms.app';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
let txn = 241_000;
function appleTxn(storeId: string, accountToken: string | null, environment = 'Production'): string {
  const id = String(++txn);
  const head = `${b64({ alg: 'ES256', x5c: chain })}.${b64({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: storeId, purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment, ...(accountToken ? { appAccountToken: accountToken } : {}) })}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key: pem('leaf.key'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const apple = () => new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], now: () => Date.now() });

async function adultWithVillage() {
  const w = world({ shared: { payments: { apple: apple(), google: null } } as never });
  const p = await w.player('Ann');
  await p.startVillage();
  await p.sendCommands({ device: 'device-money001', stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false, ageBand: 'adult' } }] });
  return { w, p };
}

describe('MONEY-02: an offer is not sold after the player says they are under 18', () => {
  it('purchaseIntent for a shown offer is refused once the village says 13 to 17', async () => {
    const { w, p } = await adultWithVillage();
    const row = (await w.repo.getVillage(p.id))!;
    const state = deserialize(row.file, data);
    const rule = data.offers.rules.find((o) => o.productId === 'offer_starter')!;
    state.offers.active = [{ id: rule.id, shownAt: w.now(), expiresAt: w.now() + 3_600_000 }];
    expect(await w.repo.saveVillage({ ...row, file: serialize(state, row.at), revision: row.revision + 1 }, row.revision, [], [])).toBe(true);
    await p.sendCommands({ device: 'device-money001', stateHash: '', commands: [{ seq: 2, t: w.now(), command: { type: 'setProfile', under18: true, ageBand: '13to17' } }] });
    const v = deserialize((await p.getVillage())!.file, data);
    expect(v.profile.under18).toBe(true);
    expect(v.offers.active.some((a) => a.id === rule.id)).toBe(true);
    await expect(p.purchaseIntent({ store: 'apple', productId: 'offer_starter', under18: true })).rejects.toMatchObject({ code: 'purchase_refused' });
    // A Jade pack within the cap still sells.
    await expect(p.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: true })).resolves.toBeTruthy();
  });
});

describe('MONEY-04: a stated under 18 is never outvoted by the village', () => {
  it('a server village that says adult, with an intent that says under 18, is held to the minor cap', async () => {
    const { p } = await adultWithVillage();
    expect(deserialize((await p.getVillage())!.file, data).profile.under18).toBe(false);
    // $99.99 is above the $50 monthly cap.
    await expect(p.purchaseIntent({ store: 'apple', productId: 'moonstones_6', under18: true })).rejects.toMatchObject({ code: 'purchase_refused', parts: [expect.objectContaining({ key: 'purchase.minor_cap' })] });
    // And the answer is kept: a later "adult" does not lift it.
    await expect(p.purchaseIntent({ store: 'apple', productId: 'moonstones_6', under18: false })).rejects.toMatchObject({ code: 'purchase_refused', parts: [expect.objectContaining({ key: 'purchase.minor_cap' })] });
  });

  it('an adult village with an adult answer is unchanged', async () => {
    const { p } = await adultWithVillage();
    await expect(p.purchaseIntent({ store: 'apple', productId: 'moonstones_6', under18: false })).resolves.toBeTruthy();
  });
});

describe('MONEY-03: parallel Sandbox redeems keep the test-credit caps', () => {
  for (const [name, makeRepo] of repoFactories) {
    it(`six parallel jade_bag redeems against a $10 per-buyer cap credit exactly two (${name})`, async () => {
      const w = world({ repo: await makeRepo(), shared: { payments: { apple: apple(), google: null, testCreditCapUsd: 10 } } as never });
      const p = await w.player('Ann');
      const intents = [];
      for (let i = 0; i < 6; i++) intents.push(await p.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false, device: 'device-money003' }));
      const out = await Promise.allSettled(intents.map((i) => p.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: appleTxn('jade_bag', i.accountToken, 'Sandbox') })));
      expect(out.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      for (const r of out) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'purchase_refused' });
      expect((await p.purchaseHistory()).purchases).toHaveLength(2);
    });

    it(`six players redeeming at once against a $10 server-wide daily cap credit exactly two (${name})`, async () => {
      const w = world({ repo: await makeRepo(), shared: { payments: { apple: apple(), google: null, testCreditCapUsd: 100 }, policy: { sandboxDailyCapUsd: 10 } } as never });
      const buyers = [];
      for (let i = 0; i < 6; i++) {
        const p = await w.player(`Buyer ${i}`);
        buyers.push({ p, intent: await p.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false, device: `device-money3${i}0` }) });
      }
      const out = await Promise.allSettled(buyers.map(({ p, intent }) => p.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: appleTxn('jade_bag', intent.accountToken, 'Sandbox') })));
      expect(out.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });
  }
});
