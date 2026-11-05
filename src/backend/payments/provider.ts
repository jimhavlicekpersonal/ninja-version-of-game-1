/**
 * All real-money purchases go through a PaymentProvider: StoreKit on iPhone,
 * Google Play Billing on Android (only in builds made with VITE_PLAY_BILLING=1),
 * none on the public web build (UnavailablePaymentProvider).
 * MockPaymentProvider (instant success, no money) is used only in the testing
 * sandbox and in tests, never with a real save or a server (see main.ts).
 *
 * With a server that checks receipts (roadmap Phase 4), the game asks it
 * first (`PurchaseVerifier.intent`: age cap, a token tying the purchase to the
 * player), pays, sends the store's receipt (`redeem`), delivers what the
 * server confirmed, and only then finishes the store transaction.
 */
import type { PurchaseStore, PurchaseView, RedeemResponse } from '../net/protocol';

/** What a store gives the game to prove a purchase. */
export interface StoreReceipt {
  store: PurchaseStore;
  /** The product's id in the store. */
  storeProductId: string;
  /** Apple: the transaction's JWS. Google: the purchase token. */
  receipt: string;
  /** The store's own transaction id (Apple) or order id (Google). */
  storeTransactionId: string;
}

export type PaymentResult = { ok: true; transactionId: string; receipt?: StoreReceipt } | { ok: false; reason: 'cancelled' | 'failed' | 'unavailable' | 'pending'; message: string };

export interface ProductRequest {
  productId: string;
  name: string;
  usd: number;
  /** The product's id in the store (store.storeProductIds). */
  storeProductId?: string;
  /** The server's purchase intent (Apple appAccountToken, Google obfuscatedAccountId). */
  accountToken?: string;
}

/** A product's price as this device's store shows it (GLOBAL-007): the storefront's currency, taxes and promotions. */
export interface StorePrice {
  /** The store's own formatted price, e.g. "R$ 24,90". */
  formatted: string;
  /** ISO 4217 code when the store gives one. */
  currency?: string;
  /** Price in micros of `currency` when known. */
  micros?: number;
}

export interface PaymentProvider {
  readonly name: string;
  /** The store whose receipts this provider gives (none for the mock store). */
  readonly store?: PurchaseStore;
  /** False when purchases cannot be made on this device/build. */
  available(): boolean;
  purchase(req: ProductRequest): Promise<PaymentResult>;
  /** Tell the store the purchase was delivered (StoreKit finish; Play consume). */
  finish?(receipt: StoreReceipt): Promise<void>;
  /** Paid but not finished yet: interrupted purchases, approvals that came while the game was closed. */
  unfinished?(): Promise<StoreReceipt[]>;
  /**
   * Prices from the store, keyed by store product id. A product the store did
   * not return is missing: it cannot be bought in this storefront.
   */
  prices?(storeProductIds: string[]): Promise<Record<string, StorePrice>>;
}

/** The server's side of a purchase (roadmap Phase 4). */
export interface PurchaseVerifier {
  intent(store: PurchaseStore, productId: string, under18: boolean | null): Promise<{ accountToken: string; storeProductId: string }>;
  redeem(receipt: StoreReceipt): Promise<RedeemResponse>;
  history(): Promise<PurchaseView[]>;
  /** The store said cancelled (frees the under-18 cap hold) or pending (holds it until approved): GLOBAL-005. */
  release?(accountToken: string, outcome: 'cancelled' | 'pending'): Promise<void>;
}

export interface MockSale extends ProductRequest {
  transactionId: string;
  at: number;
}

/** Instant success; records every sale so tests and the debug viewer can see it. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly sales: MockSale[] = [];
  private counter = 0;
  constructor(private readonly now: () => number = () => Date.now()) {}
  available(): boolean {
    return true;
  }
  async purchase(req: ProductRequest): Promise<PaymentResult> {
    const transactionId = `mock-${this.now().toString(36)}-${++this.counter}`;
    this.sales.push({ ...req, transactionId, at: this.now() });
    console.info(`[MockPaymentProvider] sold ${req.productId} ($${req.usd.toFixed(2)}) as ${transactionId}`);
    return { ok: true, transactionId };
  }
}
