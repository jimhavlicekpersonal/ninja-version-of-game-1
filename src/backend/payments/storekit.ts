import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { PaymentProvider, PaymentResult, ProductRequest } from './provider';

interface TkStorePlugin {
  getProducts(opts: { ids: string[] }): Promise<{ products: { id: string; displayName: string; displayPrice: string; price: number }[] }>;
  purchase(opts: { productId: string }): Promise<{ transactionId: string; productId: string }>;
  startListening(): Promise<void>;
  addListener(event: 'transaction', cb: (t: { transactionId: string; productId: string }) => void): Promise<PluginListenerHandle>;
}

const TkStore = registerPlugin<TkStorePlugin>('TkStore');

/** Real purchases on iPhone through StoreKit 2 (the native TkStore plugin in ios/App/App). */
export class StoreKitPaymentProvider implements PaymentProvider {
  readonly name = 'storekit';

  available(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  async purchase(req: ProductRequest): Promise<PaymentResult> {
    try {
      const r = await TkStore.purchase({ productId: req.productId });
      return { ok: true, transactionId: `ios-${r.transactionId}` };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const reason = err.code === 'cancelled' ? 'cancelled' : err.code === 'unavailable' ? 'unavailable' : 'failed';
      return { ok: false, reason, message: err.message ?? 'The purchase did not go through.' };
    }
  }

  /** Purchases approved later (Ask to Buy) are delivered through this callback. */
  async listen(onTransaction: (productId: string, transactionId: string) => void): Promise<void> {
    await TkStore.addListener('transaction', (t) => onTransaction(t.productId, `ios-${t.transactionId}`));
    await TkStore.startListening();
  }
}

/** Used where no store is wired up yet (the Android app until Google Play Billing is added). */
export class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = 'unavailable';
  available(): boolean {
    return false;
  }
  async purchase(): Promise<PaymentResult> {
    return { ok: false, reason: 'unavailable', message: 'Purchases are not available in this version of the app yet.' };
  }
}
