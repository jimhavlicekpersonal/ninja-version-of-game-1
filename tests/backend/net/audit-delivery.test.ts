/**
 * Worldwide audit (2026-11-05) delivery findings, game side:
 * - GLOBAL-003: a store transaction is finished only after a save holding the
 *   grant has landed; a failed save leaves it open, and the next start
 *   delivers it exactly once.
 * - GLOBAL-005: a cancelled purchase releases its intent; a pending one holds it.
 * - GLOBAL-013: `deliverUnfinishedReport` says what is still waiting, so the
 *   game can retry on the next reconnection.
 */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import type { PaymentProvider, PaymentResult, ProductRequest, PurchaseVerifier, StoreReceipt } from '../../../src/backend/payments/provider';
import { MemorySaveStore, type MemorySlot } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import type { SaveFile } from '../../../src/gameplay/sim/save';

/** A store that keeps transactions open until finished, like StoreKit and Play. */
class FakeStore implements PaymentProvider {
  readonly name = 'fake';
  readonly store = 'apple' as const;
  open: StoreReceipt[] = [];
  next: 'ok' | 'cancelled' | 'pending' = 'ok';
  private n = 100;
  available() {
    return true;
  }
  async purchase(req: ProductRequest): Promise<PaymentResult> {
    if (this.next !== 'ok') return { ok: false, reason: this.next, message: this.next };
    const id = String(++this.n);
    const receipt: StoreReceipt = { store: 'apple', storeProductId: req.storeProductId!, storeTransactionId: id, receipt: `jws-${id}` };
    this.open.push(receipt);
    return { ok: true, transactionId: `apple:${id}`, receipt };
  }
  async finish(r: StoreReceipt) {
    this.open = this.open.filter((x) => x.storeTransactionId !== r.storeTransactionId);
  }
  async unfinished() {
    return [...this.open];
  }
}

/** A save store whose writes can fail like a full disk ("Quota exceeded"). */
class FlakySaveStore extends MemorySaveStore {
  full = false;
  constructor(slot: MemorySlot) {
    super(slot);
  }
  override async save(file: SaveFile): Promise<void> {
    if (this.full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return super.save(file);
  }
}

const clock = { now: () => Date.UTC(2026, 10, 5, 12) };
const analytics = () => new Analytics(new MemoryEventStore(), clock, 'test');

async function start(slot: MemorySlot, payments: PaymentProvider) {
  const store = new FlakySaveStore(slot);
  const { controller } = await GameController.start({ clock, store, data, analytics: analytics(), payments });
  if (controller.state.profile.under18 === null) controller.dispatch({ type: 'setProfile', under18: false });
  await controller.save();
  return { controller, store };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('GLOBAL-003: durable delivery before finishing the store transaction', () => {
  it('keeps the transaction open when the save fails, then delivers it exactly once after a restart', async () => {
    const slot: MemorySlot = { data: null };
    const pay = new FakeStore();
    const a = await start(slot, pay);
    const jade = a.controller.state.resources.moonstones;
    a.store.full = true;
    const r = await a.controller.purchase('moonstones_1');
    // Delivered on screen, but honestly reported as not saved, and still open in the store.
    expect(r).toMatchObject({ ok: true, unsaved: true });
    expect(a.controller.state.resources.moonstones - jade).toBe(100);
    expect(pay.open).toHaveLength(1);
    // The app is killed: the stored village never got the Jade.
    const b = await start(slot, pay);
    expect(b.controller.state.resources.moonstones).toBe(jade);
    expect(await b.controller.deliverUnfinished()).toBe(1);
    expect(b.controller.state.resources.moonstones - jade).toBe(100);
    await settle();
    expect(pay.open).toEqual([]);
    // Once more (Restore purchases, another start): nothing is delivered twice.
    expect(await b.controller.deliverUnfinished()).toBe(0);
    const c = await start(slot, pay);
    expect(c.controller.state.resources.moonstones - jade).toBe(100);
  });

  it('finishes a waiting transaction as soon as a later save lands', async () => {
    const slot: MemorySlot = { data: null };
    const pay = new FakeStore();
    const a = await start(slot, pay);
    a.store.full = true;
    await a.controller.purchase('moonstones_1');
    expect(pay.open).toHaveLength(1);
    a.store.full = false; // space freed
    await a.controller.save();
    await settle();
    expect(pay.open).toEqual([]);
  });

  it('recognises a purchase saved before a crash that left it unfinished', async () => {
    const slot: MemorySlot = { data: null };
    const pay = new FakeStore();
    const a = await start(slot, pay);
    const jade = a.controller.state.resources.moonstones;
    // The save lands but the app dies before finishing: put the receipt back as the store would.
    await a.controller.purchase('moonstones_1');
    await settle();
    const left = { store: 'apple' as const, storeProductId: 'jade_pouch', storeTransactionId: '101', receipt: 'jws-101' };
    pay.open = [left];
    const b = await start(slot, pay);
    expect(b.controller.state.resources.moonstones - jade).toBe(100);
    await b.controller.deliverUnfinished();
    expect(b.controller.state.resources.moonstones - jade).toBe(100);
    await settle();
    expect(pay.open).toEqual([]);
  });
});

describe('GLOBAL-005 / GLOBAL-013: intents and retries from the game', () => {
  function verifier(log: string[], redeemDown = false): PurchaseVerifier {
    return {
      intent: async () => ({ accountToken: 'tok-1', storeProductId: 'jade_pouch' }),
      redeem: async (r) => {
        if (redeemDown) throw Object.assign(new Error('offline'), { retryable: true });
        return { transactionId: `apple:${r.storeTransactionId}`, productId: 'moonstones_1', usd: 0.99, heldOnServer: false, already: false };
      },
      history: async () => [],
      release: async (token, outcome) => void log.push(`${token}:${outcome}`),
    };
  }

  it('releases the intent of a cancelled purchase and marks a pending one', async () => {
    const pay = new FakeStore();
    const { controller } = await start({ data: null }, pay);
    const log: string[] = [];
    controller.purchaseVerifier = () => verifier(log);
    pay.next = 'cancelled';
    expect(await controller.purchase('moonstones_1')).toMatchObject({ ok: false, code: 'cancelled' });
    pay.next = 'pending';
    expect(await controller.purchase('moonstones_1')).toMatchObject({ ok: false, code: 'pending' });
    expect(log).toEqual(['tok-1:cancelled', 'tok-1:pending']);
  });

  it('reports purchases still waiting for the server, and delivers them when it is back', async () => {
    const pay = new FakeStore();
    const { controller } = await start({ data: null }, pay);
    controller.purchaseVerifier = () => verifier([], true);
    const r = await controller.purchase('moonstones_1');
    expect(r).toMatchObject({ ok: false, code: 'PENDING' });
    expect(await controller.deliverUnfinishedReport()).toEqual({ delivered: 0, left: 1 });
    // A second outage in the same session changes nothing; the next reconnection delivers it.
    expect(await controller.deliverUnfinishedReport()).toEqual({ delivered: 0, left: 1 });
    controller.purchaseVerifier = () => verifier([]);
    expect(await controller.deliverUnfinishedReport()).toEqual({ delivered: 1, left: 0 });
    await settle();
    expect(pay.open).toEqual([]);
  });
});
