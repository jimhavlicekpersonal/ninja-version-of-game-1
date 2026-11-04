/**
 * Real-money purchases on the server (roadmap steps 35-37).
 *
 * 1. Intent (before the store charges anything): the product must exist and
 *    the store be set up here; a player under 18 must stay within
 *    `minorMonthlyCapUsd` this UTC month, counting every credited purchase on
 *    any device plus intents still open (so two quick taps cannot both pass).
 *    The intent's id goes into the store purchase (Apple appAccountToken,
 *    Google obfuscatedAccountId), tying it to this player.
 * 2. Redeem: the receipt is checked with the store (`payments/apple.ts`,
 *    `payments/google.ts`), recorded once per store transaction (any player,
 *    any device), and delivered: into the village when the server holds it
 *    (`grantPurchase` with `verified`, ledger `purchase:<store>`), otherwise
 *    the game delivers it on the device. Google purchases are then consumed;
 *    the game finishes Apple transactions only after this answer.
 * 3. Refunds (App Store Server Notifications, Google RTDN and the Voided
 *    Purchases API): the record is marked refunded and a server-held village
 *    gives back what is still there (`revokePurchase`, ledger `refund:<store>`).
 */
import type { PurchaseHistoryResponse, PurchaseIntentResponse, PurchaseStore, RedeemResponse } from '../../src/backend/net/protocol';
import { monthStart, productForStoreId, productInfo, storeProductId } from '../../src/gameplay/sim/monetization';
import { deserialize } from '../../src/gameplay/sim/save';
import { PurchaseError } from '../payments/apple';
import type { Player, PurchaseRow, Repo } from '../repo';
import { ApiError, MIN, type ServerContext } from './context';
import { applyServerResult } from './village';

/** How long an unused intent holds its share of an under-18 player's monthly cap. */
export const INTENT_HOLD_MS = 30 * MIN;
const STORES: readonly PurchaseStore[] = ['apple', 'google'];

const cents = (usd: number) => Math.round(usd * 100);
const villageId = (store: PurchaseStore, transactionId: string) => `${store}:${transactionId}`;

/** The stores this server checks receipts for (listed in /v1/hello as `purchases-apple`, `purchases-google`). */
export function purchaseFeatures(ctx: ServerContext): string[] {
  return STORES.filter((s) => ctx.payments[s]).map((s) => `purchases-${s}`);
}

function storeOf(ctx: ServerContext, raw: unknown): PurchaseStore {
  const store = STORES.find((s) => s === raw);
  if (!store) throw new ApiError(400, 'bad_request', 'Unknown store.');
  if (!ctx.payments[store]) throw new ApiError(403, 'purchase_refused', 'Purchases are not set up on this server yet. Nothing was charged.');
  return store;
}

async function serverVillageProfile(repo: Repo, ctx: ServerContext, playerId: string): Promise<{ under18: boolean | null } | null> {
  const row = await repo.getVillage(playerId);
  return row ? deserialize(row.file, ctx.data).profile : null;
}

export async function purchaseIntent(ctx: ServerContext, me: Player, body: { store?: unknown; productId?: unknown; under18?: unknown } | undefined): Promise<PurchaseIntentResponse> {
  storeOf(ctx, body?.store);
  const product = productInfo(ctx.data, String(body?.productId ?? ''));
  if (!product) throw new ApiError(400, 'bad_request', 'That item is not available.');
  // A village the server holds says the age group itself; otherwise the game does.
  const held = await serverVillageProfile(ctx.repo, ctx, me.id);
  const under18 = held ? held.under18 : typeof body?.under18 === 'boolean' ? body.under18 : null;
  if (under18 === null) throw new ApiError(403, 'purchase_refused', 'Please tell us your age group first.');
  const now = ctx.now();
  if (under18) {
    const cap = cents(ctx.data.store.minorMonthlyCapUsd);
    const spent = await ctx.repo.spentCents(me.id, monthStart(now), now - INTENT_HOLD_MS);
    if (spent + cents(product.usd) > cap) {
      throw new ApiError(403, 'purchase_refused', `Monthly spending limit of $${(cap / 100).toFixed(2)} reached for players under 18. Nothing was charged.`);
    }
  }
  const id = ctx.uuid().toLowerCase();
  await ctx.repo.addIntent({ id, playerId: me.id, productId: product.id, cents: cents(product.usd), at: now, used: false });
  return { accountToken: id, storeProductId: storeProductId(ctx.data, product.id) };
}

interface Checked {
  store: PurchaseStore;
  transactionId: string;
  storeProductId: string;
  environment: string;
  accountToken: string | null;
  ref: string;
  /** Google: consume once credited. */
  finish: (() => Promise<void>) | null;
}

async function check(ctx: ServerContext, store: PurchaseStore, storeProductId: string, receipt: unknown): Promise<Checked> {
  try {
    if (store === 'apple') {
      const t = ctx.payments.apple!.transaction(receipt);
      if (t.revocationDate !== null) throw new PurchaseError('This purchase was refunded.');
      return { store, transactionId: t.transactionId, storeProductId: t.productId, environment: t.environment, accountToken: t.appAccountToken, ref: t.originalTransactionId, finish: null };
    }
    const google = ctx.payments.google!;
    const p = await google.purchase(storeProductId, receipt);
    return {
      store,
      transactionId: p.transactionId,
      storeProductId: p.productId,
      environment: p.environment,
      accountToken: p.accountToken,
      ref: p.purchaseToken,
      finish: p.consumed ? null : () => google.consume(p.productId, p.purchaseToken),
    };
  } catch (e) {
    if (e instanceof PurchaseError) throw new ApiError(400, 'bad_request', e.message);
    throw e;
  }
}

async function finish(ctx: ServerContext, c: Checked): Promise<void> {
  if (!c.finish) return;
  try {
    await c.finish();
  } catch (e) {
    // The game sends the receipt again until it is finished; the next try consumes it.
    ctx.log('warn', 'purchase not consumed', { store: c.store, transactionId: c.transactionId, error: (e as Error).message });
  }
}

export async function redeem(ctx: ServerContext, me: Player, body: { store?: unknown; storeProductId?: unknown; receipt?: unknown } | undefined): Promise<RedeemResponse> {
  const store = storeOf(ctx, body?.store);
  const c = await check(ctx, store, String(body?.storeProductId ?? ''), body?.receipt);
  const product = productForStoreId(ctx.data, c.storeProductId);
  if (!product) throw new ApiError(400, 'bad_request', 'The game does not sell that product.');
  const answer = (row: PurchaseRow, already: boolean): RedeemResponse => {
    if (row.playerId !== me.id) throw new ApiError(409, 'conflict', 'This purchase belongs to another player.');
    return { transactionId: villageId(store, row.transactionId), productId: row.productId, usd: row.cents / 100, heldOnServer: row.heldOnServer, already };
  };
  const known = await ctx.repo.getPurchase(store, c.transactionId);
  if (known) {
    const out = answer(known, true);
    await finish(ctx, c);
    return out;
  }
  if (c.accountToken) {
    const intent = await ctx.repo.getIntent(c.accountToken);
    // An intent we no longer have (pruned) is fine; one that names someone else is not.
    if (intent && intent.playerId !== me.id) throw new ApiError(409, 'conflict', 'This purchase belongs to another player.');
  }
  const now = ctx.now();
  const result = await ctx.repo.transaction(async (tx) => {
    const heldOnServer = Boolean(await tx.getVillage(me.id));
    const row: PurchaseRow = {
      store,
      transactionId: c.transactionId,
      playerId: me.id,
      productId: product.id,
      cents: cents(product.usd),
      at: now,
      environment: c.environment,
      status: 'credited',
      refundedAt: null,
      ref: c.ref,
      heldOnServer,
    };
    if (!(await tx.addPurchase(row))) {
      const again = await tx.getPurchase(store, c.transactionId);
      return answer(again!, true);
    }
    if (heldOnServer) {
      const r = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'grantPurchase', productId: product.id, transactionId: villageId(store, c.transactionId), verified: true }, reason: `purchase:${store}` }], villageId(store, c.transactionId));
      // Already in the village (delivered before it moved to the server): recorded, nothing added twice.
      if (r && !r.ok) ctx.log('warn', 'purchase already in the village', { store, transactionId: c.transactionId, message: r.message });
    }
    if (c.accountToken) await tx.useIntent(c.accountToken);
    return answer(row, false);
  });
  if (!result.already) ctx.metrics.count('tk_purchases_total', { store, environment: c.environment });
  await finish(ctx, c);
  return result;
}

export async function purchaseHistory(ctx: ServerContext, me: Player): Promise<PurchaseHistoryResponse> {
  return {
    purchases: (await ctx.repo.purchasesOf(me.id, 100)).map((p) => ({ transactionId: villageId(p.store, p.transactionId), store: p.store, productId: p.productId, usd: p.cents / 100, at: p.at, status: p.status })),
  };
}

/** A store refunded or revoked a purchase: mark it, and take back from a server-held village what is still there. Idempotent. */
export async function revoke(ctx: ServerContext, store: PurchaseStore, find: { transactionId?: string; ref?: string }, at: number, why: string): Promise<boolean> {
  const row = find.transactionId ? await ctx.repo.getPurchase(store, find.transactionId) : find.ref ? await ctx.repo.purchaseByRef(store, find.ref) : null;
  if (!row) {
    ctx.log('warn', 'refund for an unknown purchase', { store, ...find, why });
    return false;
  }
  const changed = await ctx.repo.transaction(async (tx) => {
    if (!(await tx.setPurchaseStatus(store, row.transactionId, 'refunded', at))) return false;
    const player = await tx.getPlayer(row.playerId);
    if (player && (await tx.getVillage(player.id))) {
      const r = await applyServerResult(tx, ctx, player, [{ cmd: { type: 'revokePurchase', transactionId: villageId(store, row.transactionId) }, reason: `refund:${store}` }], villageId(store, row.transactionId));
      if (r && !r.ok) ctx.log('warn', 'refund not in the village', { store, transactionId: row.transactionId, message: r.message });
    }
    return true;
  });
  if (changed) ctx.metrics.count('tk_refunds_total', { store, why });
  return changed;
}

/** App Store Server Notifications v2 (`{ signedPayload }`). */
export async function appleNotification(ctx: ServerContext, body: { signedPayload?: unknown } | undefined): Promise<void> {
  if (!ctx.payments.apple) throw new ApiError(404, 'not_found', 'App Store purchases are not set up on this server.');
  let n;
  try {
    n = ctx.payments.apple.notification(body?.signedPayload);
  } catch (e) {
    if (e instanceof PurchaseError) throw new ApiError(400, 'bad_request', e.message);
    throw e;
  }
  ctx.log('info', 'app store notification', { type: n.notificationType, subtype: n.subtype, id: n.notificationUUID, environment: n.environment });
  const t = n.transaction;
  if (!t) return;
  if (n.notificationType === 'REFUND' || n.notificationType === 'REVOKE') {
    await revoke(ctx, 'apple', { transactionId: t.transactionId }, t.revocationDate ?? ctx.now(), n.notificationType.toLowerCase());
  } else if (n.notificationType === 'REFUND_REVERSED') {
    // The refund was reversed: the record counts again. What was taken back stays a support matter (Admin grant).
    await ctx.repo.setPurchaseStatus('apple', t.transactionId, 'credited', ctx.now());
  }
}

/** Google Play Real-time Developer Notifications (Pub/Sub push). */
export async function googleNotification(ctx: ServerContext, authorization: string | undefined, body: unknown): Promise<void> {
  if (!ctx.payments.google) throw new ApiError(404, 'not_found', 'Google Play purchases are not set up on this server.');
  let n;
  try {
    n = await ctx.payments.google.notification(authorization, body);
  } catch (e) {
    if (e instanceof PurchaseError) throw new ApiError(401, 'unauthorized', e.message);
    throw e;
  }
  if (n.voided) await revoke(ctx, 'google', { ref: n.voided.purchaseToken }, n.voided.voidedAt, 'voided');
}

/** The Voided Purchases API, read hourly (a safety net for missed notifications). Returns how many were newly revoked. */
export async function pollVoided(ctx: ServerContext, since: number): Promise<number> {
  if (!ctx.payments.google) return 0;
  let n = 0;
  for (const v of await ctx.payments.google.voided(since)) if (await revoke(ctx, 'google', { ref: v.purchaseToken }, v.voidedAt, 'voided')) n++;
  return n;
}
