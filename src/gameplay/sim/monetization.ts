/** Real-money products and the rules around buying them. Payment itself happens outside the sim. */
import type { Cost, GameData, VillageState } from './types';

export type ProductKind = 'pack' | 'pass' | 'offer';

export interface ProductInfo {
  id: string;
  kind: ProductKind;
  name: string;
  usd: number;
  grants: Cost;
}

export function productInfo(data: GameData, productId: string): ProductInfo | null {
  const pack = data.store.packs.find((p) => p.id === productId);
  if (pack) return { id: pack.id, kind: 'pack', name: pack.name, usd: pack.usd, grants: { moonstones: pack.moonstones } };
  if (productId === data.pass.productId) return { id: productId, kind: 'pass', name: `${data.pass.name} (premium)`, usd: data.pass.usd, grants: {} };
  const offer = data.offers.rules.find((o) => o.productId === productId);
  if (offer) return { id: productId, kind: 'offer', name: offer.title, usd: offer.usd, grants: { ...offer.contents } };
  return null;
}

/** Month key (UTC) for spend tracking. */
function monthOf(t: number): number {
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function spentThisMonth(state: VillageState, now: number): number {
  const m = monthOf(now);
  return Math.round(state.purchases.filter((p) => monthOf(p.at) === m).reduce((s, p) => s + p.usd, 0) * 100) / 100;
}

export function spentTotal(state: VillageState): number {
  return Math.round(state.purchases.reduce((s, p) => s + p.usd, 0) * 100) / 100;
}

export type PurchaseCheck = { ok: true; product: ProductInfo } | { ok: false; code: 'UNKNOWN_PRODUCT' | 'AGE_UNKNOWN' | 'SPEND_CAP' | 'ALREADY_OWNED' | 'OFFER_EXPIRED'; message: string };

/** Can this player buy this product right now? Checked before asking the payment provider. */
export function canPurchase(state: VillageState, productId: string, now: number, data: GameData): PurchaseCheck {
  const product = productInfo(data, productId);
  if (!product) return { ok: false, code: 'UNKNOWN_PRODUCT', message: 'That item is not available.' };
  if (state.profile.under18 === null) return { ok: false, code: 'AGE_UNKNOWN', message: 'Please tell us your age group first.' };
  if (product.kind === 'pass' && state.pass.premium) return { ok: false, code: 'ALREADY_OWNED', message: 'You already have the premium Season Scroll this season.' };
  if (product.kind === 'offer') {
    const rule = data.offers.rules.find((o) => o.productId === productId)!;
    const active = state.offers.active.find((a) => a.id === rule.id && a.expiresAt > now);
    if (!active) return { ok: false, code: 'OFFER_EXPIRED', message: 'This offer has ended.' };
  }
  if (state.profile.under18) {
    const cap = data.store.minorMonthlyCapUsd;
    if (spentThisMonth(state, now) + product.usd > cap + 1e-9) {
      return { ok: false, code: 'SPEND_CAP', message: `Monthly spending limit of $${cap.toFixed(2)} reached for players under 18.` };
    }
  }
  return { ok: true, product };
}
