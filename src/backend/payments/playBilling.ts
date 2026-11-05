/**
 * Google Play Billing on Android (roadmap step 36), through the native
 * TkBilling plugin (android/app/src/main/java/.../TkBillingPlugin.java).
 * Used only in builds made with VITE_PLAY_BILLING=1 (payments/select.ts).
 * Every product is a consumable: the server consumes a purchase once it has
 * checked and delivered it; without a server the game consumes it itself.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { PaymentProvider, PaymentResult, ProductRequest, StorePrice, StoreReceipt } from './provider';

interface PlayPurchase {
  purchaseToken: string;
  productId: string;
  orderId: string | null;
}

/** One product as Google Play lists it for this account and country (TkBillingPlugin.getProducts). */
interface PlayProduct {
  id: string;
  displayName: string;
  /** Play's own formatted price (OneTimePurchaseOfferDetails.getFormattedPrice). */
  displayPrice: string;
  /** ISO 4217 (getPriceCurrencyCode). */
  currencyCode?: string;
  /** getPriceAmountMicros. */
  priceMicros?: number;
}

interface TkBillingPlugin {
  /** `unavailable`: ids Play did not return (not set up, or not sold in this country). */
  getProducts(opts: { ids: string[] }): Promise<{ products: PlayProduct[]; unavailable?: string[] }>;
  purchase(opts: { productId: string; accountId?: string }): Promise<PlayPurchase>;
  unfinished(): Promise<{ purchases: PlayPurchase[] }>;
  consume(opts: { purchaseToken: string }): Promise<void>;
  addListener(event: 'purchase', cb: (p: PlayPurchase) => void): Promise<PluginListenerHandle>;
}

const TkBilling = registerPlugin<TkBillingPlugin>('TkBilling');

const receiptOf = (p: PlayPurchase): StoreReceipt => ({ store: 'google', storeProductId: p.productId, receipt: p.purchaseToken, storeTransactionId: p.orderId ?? p.purchaseToken });

export class PlayBillingPaymentProvider implements PaymentProvider {
  readonly name = 'play';
  readonly store = 'google' as const;

  available(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async purchase(req: ProductRequest): Promise<PaymentResult> {
    try {
      const p = await TkBilling.purchase({ productId: req.storeProductId ?? req.productId, ...(req.accountToken ? { accountId: req.accountToken } : {}) });
      return { ok: true, transactionId: `google:${p.orderId ?? p.purchaseToken.slice(0, 40)}`, receipt: receiptOf(p) };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const reason = err.code === 'cancelled' ? 'cancelled' : err.code === 'unavailable' ? 'unavailable' : err.code === 'pending' ? 'pending' : 'failed';
      return { ok: false, reason, message: err.message ?? 'The purchase did not go through.' };
    }
  }

  /**
   * Play's localized prices (GLOBAL-007), keyed by store product id. A product
   * Play did not return is missing: it cannot be bought in this storefront.
   * Throws when Play cannot be reached (the shop then shows no price).
   */
  async prices(storeProductIds: string[]): Promise<Record<string, StorePrice>> {
    const out: Record<string, StorePrice> = {};
    const ids = [...new Set(storeProductIds.filter(Boolean))];
    if (!ids.length) return out;
    const { products } = await TkBilling.getProducts({ ids });
    for (const p of products) {
      if (!ids.includes(p.id) || !p.displayPrice) continue;
      out[p.id] = {
        formatted: p.displayPrice,
        ...(p.currencyCode ? { currency: p.currencyCode } : {}),
        ...(Number.isFinite(p.priceMicros) ? { micros: p.priceMicros } : {}),
      };
    }
    return out;
  }

  async finish(receipt: StoreReceipt): Promise<void> {
    // Already consumed by the server in the usual case; consuming twice is harmless.
    await TkBilling.consume({ purchaseToken: receipt.receipt }).catch(() => undefined);
  }

  async unfinished(): Promise<StoreReceipt[]> {
    return (await TkBilling.unfinished()).purchases.map(receiptOf);
  }

  /** Payments that complete later (pending payment methods). */
  async listen(onReceipt: (receipt: StoreReceipt) => void): Promise<void> {
    await TkBilling.addListener('purchase', (p) => onReceipt(receiptOf(p)));
  }
}
