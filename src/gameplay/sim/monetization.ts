/** Real-money products and the rules around buying them. Payment itself happens outside the sim. */
import { topUpOne, topUpScale } from './economy';
import { passSaleOpen } from './pass';
import { capacity } from './resources';
import { stipendStatus } from './stipend';
import type { Cost, GameData, ResourceKind, VillageState } from './types';

export type ProductKind = 'pack' | 'pass' | 'offer' | 'stipend';

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
  const st = data.store.stipend;
  if (st && productId === st.id) return { id: st.id, kind: 'stipend', name: st.name, usd: st.usd, grants: {} };
  return null;
}

function keepOf(state: VillageState, data: GameData): number {
  return Math.max(1, state.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
}

export interface ProductGrants {
  /** Exactly what buying it now delivers. */
  grants: Cost;
  /** Offers: the Coins/Provisions at this Keep before the storage check. */
  scaled: Cost;
  /** Offers: what would not fit in storage, delivered as Jade instead (at the Keep's top-up price, included in `grants.moonstones`). */
  converted: Cost;
  /** Jade the conversion added. */
  convertedJade: number;
}

/**
 * What a product delivers to this village right now (re-audit: offers used to grant
 * their contents raw, ~7x a Keep 1 storage and trivial at Keep 12+).
 *
 * - Jade is never scaled.
 * - Offer Coins/Provisions are written at the Keep 5 economy and scaled by the
 *   top-up scale (`topUpScaleByHall`), so an offer's resources are worth the same
 *   number of Jade at every Keep (TOP_UP.md prices them).
 * - Bought resources never sit above storage (TOP_UP.md's no-stockpile rule): the
 *   part that does not fit right now is delivered as the Jade a top-up of exactly
 *   that amount costs at this Keep. Nothing is withheld, and the Jade can only buy
 *   resources back through top-ups (exact, immediate), so there is no exchange.
 * - The Clan Stipend delivers its daily payments on claim (sim/stipend.ts), nothing at once.
 *
 * The Store shows this (not `productInfo().grants`), and `grantPurchase` delivers it.
 */
export function productGrantsFor(state: VillageState, productId: string, data: GameData): ProductGrants | null {
  const p = productInfo(data, productId);
  if (!p) return null;
  if (p.kind !== 'offer') return { grants: { ...p.grants }, scaled: {}, converted: {}, convertedJade: 0 };
  const keep = keepOf(state, data);
  const scale = topUpScale(keep, data);
  const cap = capacity(state, data);
  const grants: Cost = {};
  const scaled: Cost = {};
  const converted: Cost = {};
  let convertedJade = 0;
  for (const [k, v] of Object.entries(p.grants) as [ResourceKind, number][]) {
    if (!(v > 0)) continue;
    if (k === 'moonstones') {
      grants.moonstones = (grants.moonstones ?? 0) + v;
      continue;
    }
    const amount = Math.round(v * scale);
    scaled[k] = amount;
    const room = Math.max(0, Math.floor(cap[k] - state.resources[k]));
    const fits = Math.min(amount, room);
    if (fits > 0) grants[k] = fits;
    if (amount > fits) {
      converted[k] = amount - fits;
      convertedJade += topUpOne(amount - fits, data, keep);
    }
  }
  if (convertedJade > 0) grants.moonstones = (grants.moonstones ?? 0) + convertedJade;
  return { grants, scaled, converted, convertedJade };
}

/** The id this product has in the App Store and Google Play (`store.storeProductIds`). */
export function storeProductId(data: GameData, productId: string): string {
  return data.store.storeProductIds?.[productId] ?? productId;
}

/** The game's product for a store's product id, or null if the game doesn't sell it. */
export function productForStoreId(data: GameData, storeId: string): ProductInfo | null {
  const map = data.store.storeProductIds ?? {};
  const own = Object.keys(map).find((k) => map[k] === storeId);
  if (own) return productInfo(data, own);
  // A product with no store id of its own is sold under its game id (but never one renamed away).
  return map[storeId] === undefined || map[storeId] === storeId ? productInfo(data, storeId) : null;
}

/** Start of the UTC month `t` falls in. */
export function monthStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
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

export type PurchaseCheck = { ok: true; product: ProductInfo } | { ok: false; code: 'UNKNOWN_PRODUCT' | 'AGE_UNKNOWN' | 'SPEND_CAP' | 'ALREADY_OWNED' | 'OFFER_EXPIRED' | 'SEASON_ENDING'; message: string };

/** Can this player buy this product right now? Checked before asking the payment provider. */
export function canPurchase(state: VillageState, productId: string, now: number, data: GameData): PurchaseCheck {
  const product = productInfo(data, productId);
  if (!product) return { ok: false, code: 'UNKNOWN_PRODUCT', message: 'That item is not available.' };
  if (state.profile.under18 === null) return { ok: false, code: 'AGE_UNKNOWN', message: 'Please tell us your age group first.' };
  if (product.kind === 'pass' && state.pass.premium) return { ok: false, code: 'ALREADY_OWNED', message: 'You already have the premium Season Scroll this season.' };
  if (product.kind === 'pass') {
    const sale = passSaleOpen(now, data, state);
    if (!sale.open) return { ok: false, code: 'SEASON_ENDING', message: `This season ends in ${sale.daysLeft} day${sale.daysLeft === 1 ? '' : 's'}, too soon to earn its rewards. The next Season Scroll goes on sale when it begins.` };
  }
  if (product.kind === 'stipend' && !stipendStatus(state, now, data).canBuy) return { ok: false, code: 'ALREADY_OWNED', message: 'Your Clan Stipend still has payments to claim. You can buy another when they are all claimed.' };
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
