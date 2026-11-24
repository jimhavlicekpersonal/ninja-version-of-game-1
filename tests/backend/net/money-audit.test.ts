/**
 * Money audit 2026-11-24, game side.
 * - MONEY-01: before the first hello of a start the device does not know whether the server checks this store
 *   (and holds a receipt over the under-18 cap unfinished), so a device-held village's receipt waits instead of
 *   being trusted and finished. The last hello this device heard stands in; with no server configured, or a
 *   server known not to check that store, receipts stay trusted as before. The trusted path keeps the
 *   under-18 cap.
 */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { Connection, type KeyValue } from '../../../src/backend/net/connection';
import { ServerError, type ServerPort } from '../../../src/backend/net/ports';
import type { PaymentProvider, PaymentResult, StoreReceipt } from '../../../src/backend/payments/provider';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { defaultData as data } from '../../../src/gameplay/sim/data';

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
}

/** A store holding one paid, unfinished transaction (StoreKit replays it at launch). */
class HeldStore implements PaymentProvider {
  readonly name = 'held';
  readonly store = 'apple' as const;
  finished: StoreReceipt[] = [];
  open: StoreReceipt[] = [{ store: 'apple', storeProductId: 'jade_vault', storeTransactionId: '9001', receipt: 'jws-9001' }];
  available() {
    return true;
  }
  async purchase(): Promise<PaymentResult> {
    return { ok: false, reason: 'failed', message: 'not in this test' };
  }
  async finish(r: StoreReceipt) {
    this.finished.push(r);
    this.open = this.open.filter((x) => x.storeTransactionId !== r.storeTransactionId);
  }
  async unfinished() {
    return [...this.open];
  }
}

/** A port whose every call fails or never answers: the first hello has not succeeded. */
function deadPort(mode: 'reject' | 'hang'): ServerPort {
  return new Proxy({} as ServerPort, {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'hasIdentity') return () => false;
      return () => (mode === 'hang' ? new Promise(() => undefined) : Promise.reject(new ServerError(0, 'network', 'offline')));
    },
  });
}

const clock = { now: () => Date.UTC(2026, 10, 24, 12) };

async function game(under18: boolean) {
  const store = new HeldStore();
  const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false, payments: store });
  controller.dispatch({ type: 'setProfile', under18 });
  // A minor who already spent up to the cap this month: the held receipt is over it.
  if (under18) controller.state.purchases.push({ id: 'apple:1', productId: 'moonstones_5', usd: data.store.minorMonthlyCapUsd, at: clock.now(), grants: {} });
  return { controller, store };
}

describe('MONEY-01: a device village before the first hello', () => {
  for (const mode of ['reject', 'hang'] as const) {
    it(`keeps a store receipt unfinished and ungranted while the hello ${mode === 'reject' ? 'fails' : 'hangs'}`, async () => {
      const { controller, store } = await game(true);
      const kv = memoryKv();
      const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv, makePort: () => deadPort(mode), log: () => undefined });
      void conn.sync();
      await new Promise((r) => setTimeout(r, 0));
      expect(conn.serverVillage).toBe(false);
      controller.purchaseVerifier = () => conn.purchaseVerifier('apple');
      expect(conn.purchaseVerifier('apple')).not.toBeNull();
      const jade = controller.state.resources.moonstones;
      const bought = controller.state.purchases.length;
      const r = await controller.deliverReceipt(store.open[0]);
      expect(r).toMatchObject({ ok: false, code: 'PENDING' });
      expect(controller.state.resources.moonstones).toBe(jade);
      expect(controller.state.purchases).toHaveLength(bought);
      expect(store.finished).toEqual([]);
      expect(await controller.deliverUnfinishedReport()).toEqual({ delivered: 0, left: 1 });
      conn.stop();
    });
  }

  it('trusts the store when the last hello from this server said it does not check it (adult)', async () => {
    const { controller, store } = await game(false);
    const kv = memoryKv();
    const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv, makePort: () => deadPort('reject'), log: () => undefined });
    kv.set(`tk.net.helloFeatures:${conn.url}`, JSON.stringify(['server-economy']));
    expect(conn.purchaseVerifier('apple')).toBeNull();
    kv.set(`tk.net.helloFeatures:${conn.url}`, JSON.stringify(['purchases-apple']));
    expect(conn.purchaseVerifier('apple')).not.toBeNull();
    controller.purchaseVerifier = () => null;
    expect(await controller.deliverReceipt(store.open[0])).toMatchObject({ ok: true });
  });

  it('keeps builds with no server trusting the store, and the trusted path keeps the under-18 cap', async () => {
    const { controller, store } = await game(true);
    const conn = new Connection({ game: controller, builtInUrl: '', kv: memoryKv(), log: () => undefined });
    expect(conn.enabled).toBe(false);
    expect(conn.purchaseVerifier('apple')).toBeNull();
    controller.purchaseVerifier = () => conn.purchaseVerifier('apple');
    const jade = controller.state.resources.moonstones;
    const r = await controller.deliverReceipt(store.open[0]);
    expect(r).toMatchObject({ ok: false, code: 'SPEND_CAP' });
    expect(controller.state.resources.moonstones).toBe(jade);
    expect(store.finished).toEqual([]);
  });
});
