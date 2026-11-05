import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { PaymentProvider, PaymentResult, ProductRequest, StorePrice, StoreReceipt } from './provider';

interface AppleTransaction {
  transactionId: string;
  productId: string;
  /** The signed transaction (jwsRepresentation) the server checks. */
  jws: string;
}

interface TkStorePlugin {
  getProducts(opts: { ids: string[] }): Promise<{ products: { id: string; displayName: string; displayPrice: string; price: number; currency?: string }[] }>;
  purchase(opts: { productId: string; appAccountToken?: string }): Promise<AppleTransaction>;
  finish(opts: { transactionId: string }): Promise<void>;
  unfinished(): Promise<{ transactions: AppleTransaction[] }>;
  startListening(): Promise<void>;
  addListener(event: 'transaction', cb: (t: AppleTransaction) => void): Promise<PluginListenerHandle>;
}

const TkStore = registerPlugin<TkStorePlugin>('TkStore');

const receiptOf = (t: AppleTransaction): StoreReceipt => ({ store: 'apple', storeProductId: t.productId, receipt: t.jws, storeTransactionId: t.transactionId });

/** Real purchases on iPhone through StoreKit 2 (the native TkStore plugin in ios/App/App). */
export class StoreKitPaymentProvider implements PaymentProvider {
  readonly name = 'storekit';
  readonly store = 'apple' as const;

  available(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  async purchase(req: ProductRequest): Promise<PaymentResult> {
    try {
      const r = await TkStore.purchase({ productId: req.storeProductId ?? req.productId, ...(req.accountToken ? { appAccountToken: req.accountToken } : {}) });
      return { ok: true, transactionId: `apple:${r.transactionId}`, receipt: receiptOf(r) };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const reason = err.code === 'cancelled' ? 'cancelled' : err.code === 'unavailable' ? 'unavailable' : err.code === 'pending' ? 'pending' : 'failed';
      return { ok: false, reason, message: err.message ?? 'The purchase did not go through.' };
    }
  }

  async finish(receipt: StoreReceipt): Promise<void> {
    await TkStore.finish({ transactionId: receipt.storeTransactionId });
  }

  async unfinished(): Promise<StoreReceipt[]> {
    return (await TkStore.unfinished()).transactions.map(receiptOf);
  }

  /** The App Store's own prices for this storefront (displayPrice: currency, taxes and promotions included). */
  async prices(storeProductIds: string[]): Promise<Record<string, StorePrice>> {
    const out: Record<string, StorePrice> = {};
    for (const p of (await TkStore.getProducts({ ids: storeProductIds })).products) {
      out[p.id] = { formatted: p.displayPrice, ...(p.currency ? { currency: p.currency } : {}), ...(Number.isFinite(p.price) ? { micros: Math.round(p.price * 1e6) } : {}) };
    }
    return out;
  }

  /** Purchases approved later (Ask to Buy) are delivered through this callback. */
  async listen(onReceipt: (receipt: StoreReceipt) => void): Promise<void> {
    await TkStore.addListener('transaction', (t) => onReceipt(receiptOf(t)));
    await TkStore.startListening();
  }
}

/** Used where no store is wired up (the public web build; Android builds without VITE_PLAY_BILLING). */
export class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = 'unavailable';
  available(): boolean {
    return false;
  }
  async purchase(): Promise<PaymentResult> {
    return { ok: false, reason: 'unavailable', message: 'Purchases are not available in this version of the app yet.' };
  }
}
