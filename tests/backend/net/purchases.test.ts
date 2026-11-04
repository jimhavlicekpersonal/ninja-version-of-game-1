/**
 * The game's side of checked purchases (roadmap steps 35-37): ask the server,
 * pay, redeem, deliver, then finish the store transaction; a purchase paid
 * while the server is unreachable stays unfinished and is delivered later;
 * Restore purchases brings this season's Scroll to a new device.
 */
import { describe, expect, it } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { Connection, type KeyValue } from '../../../src/backend/net/connection';
import { ServerError, type ServerPort } from '../../../src/backend/net/ports';
import type { PaymentProvider, PaymentResult, ProductRequest, StoreReceipt } from '../../../src/backend/payments/provider';
import { paymentPath } from '../../../src/backend/payments/select';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { deserialize } from '../../../src/gameplay/sim/save';
import { signJws, TEST_BUNDLE, testAppleVerifier } from '../fixtures/appstore/sign';
import { world } from '../server/harness';

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
}

/** StoreKit as the game sees it: signed transactions, unfinished until finished. */
class FakeStoreKit implements PaymentProvider {
  readonly name = 'fake-storekit';
  readonly store = 'apple' as const;
  unfinishedList: StoreReceipt[] = [];
  requests: ProductRequest[] = [];
  private n = 5000;
  available() {
    return true;
  }
  async purchase(req: ProductRequest): Promise<PaymentResult> {
    this.requests.push(req);
    const id = String(++this.n);
    const receipt: StoreReceipt = {
      store: 'apple',
      storeProductId: req.storeProductId!,
      storeTransactionId: id,
      receipt: signJws({ transactionId: id, originalTransactionId: id, bundleId: TEST_BUNDLE, productId: req.storeProductId, purchaseDate: 1, environment: 'Sandbox', type: 'Consumable', ...(req.accountToken ? { appAccountToken: req.accountToken } : {}) }),
    };
    this.unfinishedList.push(receipt);
    return { ok: true, transactionId: `apple:${id}`, receipt };
  }
  async finish(r: StoreReceipt) {
    this.unfinishedList = this.unfinishedList.filter((x) => x.storeTransactionId !== r.storeTransactionId);
  }
  async unfinished() {
    return [...this.unfinishedList];
  }
}

async function setup(opts: { serverVillage?: boolean; under18?: boolean } = {}) {
  const w = world({ shared: { payments: { apple: testAppleVerifier() } } });
  const clock = { now: () => w.now() };
  const store = new FakeStoreKit();
  const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false, payments: store });
  let down = false;
  const inner = new InProcessServerAdapter(w.core);
  // A port that can lose the network.
  const port = new Proxy(inner, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        if (down && prop !== 'hasIdentity') return Promise.reject(new ServerError(0, 'network', 'offline'));
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as unknown as ServerPort;
  const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
  await conn.sync();
  if (opts.serverVillage) await conn.village!.enable('new');
  controller.dispatch({ type: 'setProfile', under18: opts.under18 ?? false });
  controller.purchaseVerifier = () => conn.purchaseVerifier('apple');
  return { w, controller, conn, store, inner, setDown: (v: boolean) => (down = v) };
}

describe('checked purchases: the game side', () => {
  it('asks first, pays the store id, delivers what the server confirmed, then finishes', async () => {
    const s = await setup({ serverVillage: true });
    const jade = s.controller.state.resources.moonstones;
    const r = await s.controller.purchase('moonstones_1');
    expect(r).toMatchObject({ ok: true });
    expect(s.store.requests[0]).toMatchObject({ storeProductId: 'jade_pouch', accountToken: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(s.controller.state.resources.moonstones - jade).toBe(100);
    expect(s.store.unfinishedList).toEqual([]);
    // The server's village has it too, and the two economies agree.
    const server = deserialize((await s.inner.getVillage())!.file, s.w.data);
    expect(server.resources.moonstones).toBe(s.controller.state.resources.moonstones);
    expect(s.controller.state.purchases.at(-1)!.id).toMatch(/^apple:/);
  });

  it('keeps a paid purchase unfinished while the server is unreachable, and delivers it once', async () => {
    const s = await setup();
    const jade = s.controller.state.resources.moonstones;
    const intent = s.conn.purchaseVerifier('apple')!;
    // Paid just as the connection drops.
    const realRedeem = intent.redeem;
    s.controller.purchaseVerifier = () => ({ ...intent, redeem: async (r) => (s.setDown(true), realRedeem(r)) });
    const r = await s.controller.purchase('moonstones_2');
    expect(r).toMatchObject({ ok: false, code: 'PENDING' });
    expect(s.controller.state.resources.moonstones).toBe(jade);
    expect(s.store.unfinishedList).toHaveLength(1);
    s.setDown(false);
    s.controller.purchaseVerifier = () => s.conn.purchaseVerifier('apple');
    expect(await s.controller.deliverUnfinished()).toBe(1);
    expect(s.controller.state.resources.moonstones - jade).toBe(280);
    expect(s.store.unfinishedList).toEqual([]);
    expect(await s.controller.deliverUnfinished()).toBe(0);
  });

  it('is refused before paying when the under-18 cap is reached', async () => {
    const s = await setup({ under18: true });
    expect((await s.controller.purchase('moonstones_5')).ok).toBe(true); // 49.99
    const r = await s.controller.purchase('moonstones_1');
    expect(r).toMatchObject({ ok: false });
    expect(s.store.requests).toHaveLength(1); // the store was never asked the second time
  });

  it('restores this season\'s Season Scroll on a new village', async () => {
    const s = await setup();
    expect((await s.controller.purchase(s.w.data.pass.productId)).ok).toBe(true);
    expect(s.controller.state.pass.premium).toBe(true);
    // A new village on this device (same player): the Scroll comes back with Restore purchases.
    s.controller.state.pass.premium = false;
    s.controller.state.purchases = [];
    expect(await s.controller.restorePurchases()).toEqual({ delivered: 0, restored: 1 });
    expect(s.controller.state.pass.premium).toBe(true);
    expect(await s.controller.restorePurchases()).toEqual({ delivered: 0, restored: 0 });
  });

  it('a village kept on the server cannot buy through a server that does not check the store', async () => {
    const w = world();
    const clock = { now: () => w.now() };
    const store = new FakeStoreKit();
    const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false, payments: store });
    const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => new InProcessServerAdapter(w.core), log: () => undefined });
    await conn.sync();
    controller.dispatch({ type: 'setProfile', under18: false });
    // On the device: trusted, as before Phase 4.
    expect(conn.purchaseVerifier('apple')).toBeNull();
    await conn.village!.enable('new');
    controller.dispatch({ type: 'setProfile', under18: false });
    controller.purchaseVerifier = () => conn.purchaseVerifier('apple');
    expect(await controller.purchase('moonstones_1')).toMatchObject({ ok: false, code: 'REFUSED' });
    expect(store.requests).toEqual([]);
  });

  it('Google Play Billing is used only in builds that turn it on', () => {
    expect(paymentPath('android', false)).toBe('unavailable');
    expect(paymentPath('android', false, true)).toBe('play');
    expect(paymentPath('web', false, true)).toBe('unavailable');
    expect(paymentPath('android', true, true)).toBe('mock');
  });
});
