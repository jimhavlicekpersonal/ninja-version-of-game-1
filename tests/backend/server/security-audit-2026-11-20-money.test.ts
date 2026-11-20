/**
 * Security audit 2026-11-20 (docs/store/WORLDWIDE_AUDIT.md "2026-11-20 security audit"): money and the
 * command batch. Each test reproduces a finding against the code before the fix.
 *
 * C1 (critical): commands sharing one seq in a batch inherited the first one's pre-replay verdict, so a
 * server-only command (staffAdjust, a forged grantPurchase) or battles past the budget went through.
 * P1 (high): an open intent for a cheap product covered a receipt for a dear one, past the under-18 cap.
 * P2 (medium): a verified purchase skipped the game's own check, so a one-time offer that was never shown could be
 * bought over and over into a server-held village.
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
let txn = 91_000;
function appleTxn(storeId: string, accountToken: string | null): string {
  const id = String(++txn);
  const head = `${b64({ alg: 'ES256', x5c: chain })}.${b64({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: storeId, purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment: 'Production', ...(accountToken ? { appAccountToken: accountToken } : {}) })}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key: pem('leaf.key'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const apple = () => new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], now: () => Date.now() });

describe('security audit 2026-11-20: one command per seq (C1)', () => {
  it('a batch with a repeated seq is refused whole; nothing server-only is applied', async () => {
    const w = world();
    const ann = await w.player('Ann');
    const before = deserialize((await ann.startVillage()).file, data);
    await expect(
      ann.sendCommands({
        device: 'device-mint0002',
        stateHash: '',
        commands: [
          { seq: 1, t: w.now(), command: { type: 'setLocalTime', minutes: 0 } as never },
          { seq: 1, t: w.now(), command: { type: 'staffAdjust', resources: { moonstones: 1_000_000 } } as never },
          { seq: 1, t: w.now(), command: { type: 'grantPurchase', productId: data.pass.productId, transactionId: 'forged-1', verified: true } as never },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const after = deserialize((await ann.getVillage()).file, data);
    expect(after.resources.moonstones).toBe(before.resources.moonstones);
    expect(after.pass.premium).toBe(false);
  });

  it('a server-only command is refused under a fresh seq too', async () => {
    const w = world();
    const ann = await w.player('Ann');
    await ann.startVillage();
    const r = await ann.sendCommands({ device: 'device-mint0003', stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'staffAdjust', resources: { moonstones: 1 } } as never }] });
    expect(r.results[0]).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
  });
});

describe('security audit 2026-11-20: the under-18 cap counts what the receipt bought (P1)', () => {
  it('a $0.99 intent does not cover a $99.99 receipt', async () => {
    const w = world({ shared: { payments: { apple: apple(), google: null } } as never });
    const kid = await w.player('Kid');
    const cheap = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: true });
    await expect(kid.redeem({ store: 'apple', storeProductId: 'jade_hoard', receipt: appleTxn('jade_hoard', cheap.accountToken) })).rejects.toMatchObject({ code: 'purchase_refused' });
    expect((await kid.purchaseHistory()).purchases).toHaveLength(0);
  });

  it('a matching intent still delivers (honest purchase unchanged)', async () => {
    const w = world({ shared: { payments: { apple: apple(), google: null } } as never });
    const kid = await w.player('Kid');
    const intent = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: true });
    const r = await kid.redeem({ store: 'apple', storeProductId: 'jade_pinch', receipt: appleTxn('jade_pinch', intent.accountToken) });
    expect(r.already).toBe(false);
  });
});

describe('security audit 2026-11-20: offers only while offered (P2)', () => {
  const adult = async () => {
    const w = world({ shared: { payments: { apple: apple(), google: null } } as never });
    const p = await w.player('Ann');
    await p.startVillage();
    await p.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
    return { w, p };
  };

  it('an offer the village was not shown cannot be reserved', async () => {
    const { w, p } = await adult();
    expect(deserialize((await p.getVillage())!.file, data).offers.active).toHaveLength(0);
    await expect(p.purchaseIntent({ store: 'apple', productId: 'offer_starter', under18: false })).rejects.toMatchObject({ code: 'purchase_refused' });
    expect(w).toBeDefined();
  });

  it('an offer paid with another product\'s intent is not delivered', async () => {
    const { p } = await adult();
    const pinch = await p.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: false });
    await expect(p.redeem({ store: 'apple', storeProductId: 'offer_starter', receipt: appleTxn('offer_starter', pinch.accountToken) })).rejects.toMatchObject({ code: 'purchase_refused' });
    expect(deserialize((await p.getVillage())!.file, data).purchases).toHaveLength(0);
  });

  it('an offer the village is shown is bought and delivered as before', async () => {
    const { w, p } = await adult();
    const row = (await w.repo.getVillage(p.id))!;
    const state = deserialize(row.file, data);
    const rule = data.offers.rules.find((o) => o.productId === 'offer_starter')!;
    state.offers.active = [{ id: rule.id, shownAt: w.now(), expiresAt: w.now() + 3_600_000 }];
    expect(await w.repo.saveVillage({ ...row, file: serialize(state, row.at), revision: row.revision + 1 }, row.revision, [], [])).toBe(true);
    const intent = await p.purchaseIntent({ store: 'apple', productId: 'offer_starter', under18: false });
    expect((await p.redeem({ store: 'apple', storeProductId: 'offer_starter', receipt: appleTxn('offer_starter', intent.accountToken) })).already).toBe(false);
    expect(deserialize((await p.getVillage())!.file, data).purchases.map((x) => x.productId)).toEqual(['offer_starter']);
  });

  it('a Jade pack is unchanged', async () => {
    const { p } = await adult();
    const pinch = await p.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: false });
    expect((await p.redeem({ store: 'apple', storeProductId: 'jade_pinch', receipt: appleTxn('jade_pinch', pinch.accountToken) })).already).toBe(false);
  });
});
