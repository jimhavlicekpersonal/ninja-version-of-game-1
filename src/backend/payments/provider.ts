/**
 * All real-money purchases go through a PaymentProvider. The web build uses
 * MockPaymentProvider (instant success). Phase 6 adds StoreKit for iOS.
 */
export type PaymentResult = { ok: true; transactionId: string } | { ok: false; reason: 'cancelled' | 'failed' | 'unavailable'; message: string };

export interface ProductRequest {
  productId: string;
  name: string;
  usd: number;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when purchases cannot be made on this device/build. */
  available(): boolean;
  purchase(req: ProductRequest): Promise<PaymentResult>;
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
