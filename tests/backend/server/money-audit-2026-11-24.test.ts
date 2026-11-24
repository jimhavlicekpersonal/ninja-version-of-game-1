/**
 * Money audit 2026-11-24, server side.
 * - MONEY-02: an offer shown to an adult stayed buyable on the server after the player said they are under 18
 *   (`purchaseIntent` ran `canPurchase`, which did not check `offersAllowed`).
 */
import { createHash, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppleVerifier } from '../../../server/payments/apple';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { world } from './harness';

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
