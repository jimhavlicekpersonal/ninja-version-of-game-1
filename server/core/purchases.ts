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
import type { IntentReleaseResponse, PurchaseHistoryResponse, PurchaseIntentResponse, PurchaseStore, RedeemResponse } from '../../src/backend/net/protocol';
import { monthStart, productForStoreId, productInfo, storeProductId } from '../../src/gameplay/sim/monetization';
import { deserialize } from '../../src/gameplay/sim/save';
import { PurchaseError } from '../payments/apple';
import type { Player, PurchaseRow, Repo } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { applyServerResult } from './village';

/** How long an unused intent holds its share of an under-18 player's monthly cap. */
export const INTENT_HOLD_MS = 30 * MIN;
/**
 * How long an intent the store reported pending (Ask to Buy, a cash payment
 * still to be made) keeps holding the cap. Longer than the stores' own
 * approval windows, so a late approval cannot take a minor past the cap; an
 * abandoned one frees itself after this.
 */
export const PENDING_HOLD_MS = 7 * 24 * HOUR;
/** Refunds in this window that pause new purchases (re-audit: refund abuse). */
export const REFUND_WINDOW_MS = 90 * 24 * HOUR;
export const REFUNDS_BEFORE_PAUSE = 3;
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

/**
 * The age group the cap applies to (GLOBAL-006). The server keeps what the
 * player said: under 18 is sticky (a later "adult" from any device or village
 * is ignored; staff can reset it after a support check), and a first answer
 * comes from the server-held village or the game. Self-declared: this is a
 * spending protection, not age verification.
 */
export async function ageGroupFor(repo: Repo, ctx: ServerContext, playerId: string, stated: unknown): Promise<boolean | null> {
  const kept = await repo.getAgeGroup(playerId);
  if (kept?.under18) return true;
  const held = await serverVillageProfile(repo, ctx, playerId);
  const said = held && held.under18 !== null ? held.under18 : typeof stated === 'boolean' ? stated : null;
  if (said === true || (said === false && !kept)) await repo.setAgeGroup(playerId, said, ctx.now());
  if (said === null) return kept ? kept.under18 : null;
  return said;
}

export async function purchaseIntent(ctx: ServerContext, me: Player, body: { store?: unknown; productId?: unknown; under18?: unknown } | undefined): Promise<PurchaseIntentResponse> {
  storeOf(ctx, body?.store);
  const product = productInfo(ctx.data, String(body?.productId ?? ''));
  if (!product) throw new ApiError(400, 'bad_request', 'That item is not available.');
  const under18 = await ageGroupFor(ctx.repo, ctx, me.id, body?.under18);
  if (under18 === null) throw new ApiError(403, 'purchase_refused', 'Please tell us your age group first.');
  // Re-audit: buy, spend, refund, repeat. After several refunds, purchases pause until support has a look.
  const since = ctx.now() - REFUND_WINDOW_MS;
  const refunds = (await ctx.repo.purchasesOf(me.id, 100)).filter((p) => p.status === 'refunded' && (p.refundedAt ?? p.at) >= since).length;
  if (refunds >= REFUNDS_BEFORE_PAUSE) {
    ctx.metrics.count('tk_refused_total', { reason: 'refund_pause' });
    throw new ApiError(403, 'purchase_refused', 'Purchases are paused on this account after several refunds. Contact support from Settings. Nothing was charged.');
  }
  // Check and reserve in one locked step (GLOBAL-004): two taps, two devices or two
  // server instances cannot both pass the cap with the same headroom.
  return ctx.repo.transaction(async (tx) => {
    await tx.lockPurchases(me.id);
    const now = ctx.now();
    if (under18) {
      const cap = cents(ctx.data.store.minorMonthlyCapUsd);
      const spent = await tx.spentCents(me.id, monthStart(now), now);
      if (spent + cents(product.usd) > cap) {
        throw new ApiError(403, 'purchase_refused', `Monthly spending limit of $${(cap / 100).toFixed(2)} reached for players under 18. Nothing was charged.`);
      }
    }
    const id = ctx.uuid().toLowerCase();
    await tx.addIntent({ id, playerId: me.id, productId: product.id, cents: cents(product.usd), at: now, used: false, holdUntil: now + INTENT_HOLD_MS });
    return { accountToken: id, storeProductId: storeProductId(ctx.data, product.id) };
  });
}

/**
 * POST /v1/purchases/intent/release (GLOBAL-005). `cancelled` comes from the
 * store's own "user cancelled" answer, when nothing can have been charged:
 * the hold ends now. `pending` holds for PENDING_HOLD_MS. A purchase that
 * still arrives for a released intent is credited (it was paid) and counts
 * from then on. Only the player's own unused intents change.
 */
export async function releaseIntent(ctx: ServerContext, me: Player, body: { accountToken?: unknown; outcome?: unknown } | undefined): Promise<IntentReleaseResponse> {
  const id = typeof body?.accountToken === 'string' ? body.accountToken.toLowerCase() : '';
  const outcome = body?.outcome;
  if (!id || (outcome !== 'cancelled' && outcome !== 'pending')) throw new ApiError(400, 'bad_request', 'Say which purchase, and whether it was cancelled or is pending.');
  return ctx.repo.transaction(async (tx) => {
    await tx.lockPurchases(me.id);
    const intent = await tx.getIntent(id);
    if (!intent || intent.playerId !== me.id || intent.used) return { changed: false };
    const now = ctx.now();
    const until = outcome === 'cancelled' ? Math.min(intent.holdUntil, now) : Math.max(intent.holdUntil, now + PENDING_HOLD_MS);
    return { changed: await tx.holdIntent(id, me.id, until) };
  });
}

interface Checked {
  store: PurchaseStore;
  transactionId: string;
  storeProductId: string;
  environment: string;
  accountToken: string | null;
  ref: string;
  storefront: string | null;
  currency: string | null;
  priceMicros: number | null;
  /** Google: consume once credited. */
  finish: (() => Promise<void>) | null;
}

async function check(ctx: ServerContext, store: PurchaseStore, storeProductId: string, receipt: unknown): Promise<Checked> {
  try {
    if (store === 'apple') {
      const t = ctx.payments.apple!.transaction(receipt);
      if (t.revocationDate !== null) throw new PurchaseError('This purchase was refunded.');
      return { store, transactionId: t.transactionId, storeProductId: t.productId, environment: t.environment, accountToken: t.appAccountToken, ref: t.originalTransactionId, storefront: t.storefront, currency: t.currency, priceMicros: t.priceMicros, finish: null };
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
      storefront: p.regionCode,
      currency: null,
      priceMicros: null,
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
  // Re-audit: the store refunded or voided this purchase before it reached us (an offline or modified game
  // kept the receipt). The receipt the device holds still looks valid; the notice says otherwise.
  if ((await ctx.repo.refundNotice(store, c.transactionId)) || (await ctx.repo.refundNotice(store, c.ref))) {
    ctx.metrics.count('tk_refused_total', { reason: 'refunded_before_redeem' });
    throw new ApiError(400, 'bad_request', 'This purchase was refunded.');
  }
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
  // Re-audit: Sandbox/test purchases cost nothing; on production only a small total is credited per player
  // (App Review needs purchases to work; public TestFlight must not mint Jade for the live ladder).
  const testCap = ctx.payments.testCreditCapUsd;
  if (testCap !== undefined && c.environment !== 'Production') {
    const testSpent = (await ctx.repo.purchasesOf(me.id, 100)).filter((p) => p.environment !== 'Production').reduce((sum, p) => sum + p.cents, 0);
    if (testSpent + cents(product.usd) > cents(testCap)) {
      ctx.metrics.count('tk_refused_total', { reason: 'test_purchase_cap' });
      throw new ApiError(403, 'purchase_refused', 'Test purchases are limited on the live server.');
    }
  }
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
      storefront: c.storefront,
      currency: c.currency,
      priceMicros: c.priceMicros,
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
    // Re-audit: remember it, so the receipt is refused if the game redeems it later.
    const key = find.transactionId ?? find.ref;
    if (key) await ctx.repo.addRefundNotice(store, key, at, why);
    ctx.log('warn', 'refund for a purchase not redeemed yet: kept so its receipt is refused', { store, ...find, why });
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

/**
 * A refund was reversed (re-audit): the record counts again and a server-held village gets back what
 * the refund took (the same grants, ledger `refund-reversed:<store>`). Idempotent with the status.
 */
export async function reinstate(ctx: ServerContext, store: PurchaseStore, transactionId: string): Promise<boolean> {
  const row = await ctx.repo.getPurchase(store, transactionId);
  if (!row || row.status !== 'refunded') return false;
  return ctx.repo.transaction(async (tx) => {
    if (!(await tx.setPurchaseStatus(store, transactionId, 'credited', ctx.now()))) return false;
    const player = await tx.getPlayer(row.playerId);
    const grants = productInfo(ctx.data, row.productId)?.grants ?? {};
    const resources = Object.fromEntries(Object.entries(grants).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>;
    if (player && Object.keys(resources).length) {
      await applyServerResult(tx, ctx, player, [{ cmd: { type: 'staffAdjust', resources }, reason: `refund-reversed:${store}` }], villageId(store, transactionId));
    }
    return true;
  });
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
    await reinstate(ctx, 'apple', t.transactionId);
  } else if (n.notificationType === 'CONSUMPTION_REQUEST') {
    // Apple asks for consumption data to decide a refund. Sending it requires the customer's consent
    // (`customerConsented`), which the game does not collect, so nothing is sent (re-audit: documented choice).
    ctx.metrics.count('tk_consumption_requests_total', {});
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
