import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { storeErrorMessage, storefrontCountry, type PaymentProvider, type PaymentResult, type ProductRequest, type StorePrice, type StoreReceipt } from './provider';

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
  /** Japan C17: `Storefront.current?.countryCode` (ISO 3166-1 alpha-3, e.g. "JPN"). */
  storefront?(): Promise<{ countryCode?: string }>;
  addListener(event: 'transaction', cb: (t: AppleTransaction) => void): Promise<PluginListenerHandle>;
}

const TkStore = registerPlugin<TkStorePlugin>('TkStore');

const receiptOf = (t: AppleTransaction): StoreReceipt => ({ store: 'apple', storeProductId: t.productId, receipt: t.jws, storeTransactionId: t.transactionId });

/** Real purchases on iPhone through StoreKit 2 (the native TkStore plugin in ios/App/App). */
/** Prices give up after this long (client re-audit item 12): a store that never answers must not leave the shop on "…" forever. */
export const PRICES_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The store did not answer in time.')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

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
      return { ok: false, reason, message: storeErrorMessage(reason, err) };
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
    for (const p of (await withTimeout(TkStore.getProducts({ ids: storeProductIds }), PRICES_TIMEOUT_MS)).products) {
      out[p.id] = { formatted: p.displayPrice, ...(p.currency ? { currency: p.currency } : {}), ...(Number.isFinite(p.price) ? { micros: Math.round(p.price * 1e6) } : {}) };
    }
    return out;
  }

  /** Japan C17: the App Store storefront's country (alpha-2), null when unknown or the plugin is older. */
  async storefront(): Promise<string | null> {
    try {
      return storefrontCountry((await withTimeout(TkStore.storefront!(), PRICES_TIMEOUT_MS)).countryCode);
    } catch {
      return null;
    }
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
