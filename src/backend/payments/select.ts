/**
 * Which purchase path a build uses, and whether it runs as the testing
 * sandbox. Kept pure so the rules are tested (audit F01/F02):
 * - the instant mock store (no money, instant success) only in the sandbox;
 * - StoreKit on iPhone outside the sandbox;
 * - Google Play Billing on Android, only in builds made with VITE_PLAY_BILLING=1
 *   (the owner turns it on once the Play products and server keys exist);
 * - otherwise (the public web build) purchases are unavailable.
 */
import type { PaymentProvider } from './provider';

/** The testing sandbox is opt-in by address: `?sandbox` or `?debug`. */
export function isSandbox(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('sandbox') || q.has('debug');
}

type PaymentPath = 'storekit' | 'play' | 'mock' | 'unavailable';

export function paymentPath(platform: string, sandbox: boolean, playBilling = false): PaymentPath {
  if (sandbox) return 'mock';
  if (platform === 'ios') return 'storekit';
  return platform === 'android' && playBilling ? 'play' : 'unavailable';
}

/** Build the provider for a path (the factories are passed in so this stays free of platform code). */
export function choosePaymentProvider(path: PaymentPath, make: Record<PaymentPath, () => PaymentProvider>): PaymentProvider {
  return make[path]();
}
