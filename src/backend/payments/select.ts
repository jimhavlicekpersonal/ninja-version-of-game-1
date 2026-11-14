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

/**
 * Third verification fixes 2026-11-14 (8f): the designed-but-not-live content preview (`?sandbox&preview`,
 * `withPreview`) only in a development build (`npm run dev`), or with `?debug&preview` in a build made with
 * `VITE_ALLOW_PREVIEW=1`. The deploy workflow never sets it, so the public web build always plays the shipped data.
 */
export function previewAllowed(search: string, build: { dev: boolean; allowPreview: boolean }): boolean {
  const q = new URLSearchParams(search);
  if (!isSandbox(search) || !q.has('preview')) return false;
  return build.dev || (q.has('debug') && build.allowPreview);
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
