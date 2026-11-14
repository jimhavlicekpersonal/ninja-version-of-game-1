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
import { STATE_NOTICES, type Player, type PurchaseRow, type Repo } from '../repo';
import { HOUR, MIN, type ServerContext } from './context';
import { applyServerResult } from './village';
import { notify } from './moderation';
import { fail, detailError, msg, staffError } from './errors';

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
  if (!store) throw fail(400, 'bad_request', 'purchase.unknown_store');
  if (!ctx.payments[store]) throw fail(403, 'purchase_refused', 'purchase.not_set_up');
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

/** A device id as the game sends it (CommandBatch.device, PurchaseIntentRequest.device); anything else is ignored. */
export function deviceId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/**
 * Backend A5/A24: the devices this player plays on, as the server knows them: the one asking now, the
 * devices that sent commands to their server-held village, and those that asked for their recent purchases.
 */
async function devicesOf(ctx: ServerContext, me: Player, asking: string | null): Promise<string[]> {
  const out = new Set<string>(asking ? [asking] : []);
  const v = await ctx.repo.getVillage(me.id);
  for (const d of Object.keys(v?.deviceSeqs ?? {})) out.add(d);
  for (const p of await ctx.repo.purchasesOf(me.id, 100)) if (p.device) out.add(p.device);
  return [...out];
}

/**
 * Backend A5: refunds counted per buyer, not per free account. A refund on any account played on the same
 * device (by its purchase intent, or the device ids of a server-held village) counts too, so a new account
 * on the same phone does not start the count again.
 */
async function recentRefunds(ctx: ServerContext, me: Player, devices: string[]): Promise<number> {
  const since = ctx.now() - REFUND_WINDOW_MS;
  return (await ctx.repo.linkedPurchases(me.id, devices, since - REFUND_WINDOW_MS)).filter((p) => p.status === 'refunded' && (p.refundedAt ?? p.at) >= since).length;
}

/**
 * GLOBAL-007: what a purchase counts in US cents (the under-18 cap, refund rates, revenue figures): the
 * store's own local price converted with USD_RATES when the store reported a price and a rate is known,
 * else the catalog USD price.
 */
export function countedCents(ctx: ServerContext, catalogUsd: number, currency: string | null | undefined, priceMicros: number | null | undefined): number {
  const rate = currency ? ctx.policy.usdRates[currency.toUpperCase()] : undefined;
  if (rate && typeof priceMicros === 'number' && priceMicros > 0) return Math.round((priceMicros / 1_000_000) * rate * 100);
  return cents(catalogUsd);
}

export async function purchaseIntent(ctx: ServerContext, me: Player, body: { store?: unknown; productId?: unknown; under18?: unknown; device?: unknown } | undefined): Promise<PurchaseIntentResponse> {
  storeOf(ctx, body?.store);
  const product = productInfo(ctx.data, String(body?.productId ?? ''));
  if (!product) throw fail(400, 'bad_request', 'purchase.unavailable');
  const under18 = await ageGroupFor(ctx.repo, ctx, me.id, body?.under18);
  if (under18 === null) throw fail(403, 'purchase_refused', 'purchase.age_first');
  // Re-audit: buy, spend, refund, repeat. After several refunds, purchases pause until support has a look.
  const device = deviceId(body?.device);
  const refunds = await recentRefunds(ctx, me, await devicesOf(ctx, me, device));
  if (refunds >= REFUNDS_BEFORE_PAUSE) {
    ctx.metrics.count('tk_refused_total', { reason: 'refund_pause' });
    throw fail(403, 'purchase_refused', 'purchase.paused_refunds');
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
        throw fail(403, 'purchase_refused', 'purchase.minor_cap', { limit: (cap / 100).toFixed(2) });
      }
    }
    const id = ctx.uuid().toLowerCase();
    await tx.addIntent({ id, playerId: me.id, productId: product.id, cents: cents(product.usd), at: now, used: false, holdUntil: now + INTENT_HOLD_MS, device });
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
  if (!id || (outcome !== 'cancelled' && outcome !== 'pending')) throw fail(400, 'bad_request', 'purchase.say_which');
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
  /**
   * Google: consume once the server's village holds it (`held`); otherwise only acknowledge it, so the
   * device still sees it until its own save has landed and it consumes it (remnant audit 2026-11-06).
   */
  finish: ((held: boolean) => Promise<void>) | null;
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
      finish: p.consumed ? null : (held) => (held ? google.consume(p.productId, p.purchaseToken) : p.acknowledged ? Promise.resolve() : google.acknowledge(p.productId, p.purchaseToken)),
    };
  } catch (e) {
    if (e instanceof PurchaseError) throw detailError(400, 'bad_request', e.message);
    throw e;
  }
}

async function finish(ctx: ServerContext, c: Checked, held: boolean): Promise<void> {
  if (!c.finish) return;
  try {
    await c.finish(held);
  } catch (e) {
    // The game sends the receipt again until it is finished; the next try consumes or acknowledges it.
    ctx.log('warn', held ? 'purchase not consumed' : 'purchase not acknowledged', { store: c.store, transactionId: c.transactionId, error: (e as Error).message });
  }
}

/**
 * Ledger audit A4: a paid purchase that reserved nothing under the cap. For a player under 18 it is
 * credited only if this month's spending leaves room; otherwise nothing is credited and the store
 * transaction is left unfinished: the game offers it again at every start (delivered once a new month
 * leaves room), Google Play refunds a purchase that is never acknowledged within 3 days, and an App
 * Store purchase can be refunded by Apple. Call inside the redeem transaction, after `lockPurchases`.
 */
async function holdOverCap(tx: Repo, ctx: ServerContext, me: Player, counted: number, now: number): Promise<void> {
  if (!(await ageGroupFor(tx, ctx, me.id, undefined))) return;
  const cap = cents(ctx.data.store.minorMonthlyCapUsd);
  if ((await tx.spentCents(me.id, monthStart(now), now)) + counted <= cap) return;
  ctx.metrics.count('tk_refused_total', { reason: 'minor_cap_at_redeem' });
  ctx.log('warn', 'purchase over the under-18 cap held at redeem', { player: me.id });
  const limit = (cap / 100).toFixed(2);
  throw fail(403, 'purchase_refused', 'purchase.over_cap_held', { limit });
}

export async function redeem(ctx: ServerContext, me: Player, body: { store?: unknown; storeProductId?: unknown; receipt?: unknown } | undefined): Promise<RedeemResponse> {
  const store = storeOf(ctx, body?.store);
  const c = await check(ctx, store, String(body?.storeProductId ?? ''), body?.receipt);
  const product = productForStoreId(ctx.data, c.storeProductId);
  if (!product) throw fail(400, 'bad_request', 'purchase.not_sold');
  // Re-audit: the store refunded or voided this purchase before it reached us (an offline or modified game
  // kept the receipt). The receipt the device holds still looks valid; the notice says otherwise.
  if ((await ctx.repo.refundNotice(store, c.transactionId)) || (await ctx.repo.refundNotice(store, c.ref))) {
    ctx.metrics.count('tk_refused_total', { reason: 'refunded_before_redeem' });
    throw fail(400, 'bad_request', 'purchase.refunded');
  }
  const answer = (row: PurchaseRow, already: boolean): RedeemResponse => {
    if (row.playerId !== me.id) throw fail(409, 'conflict', 'purchase.other_player');
    return { transactionId: villageId(store, row.transactionId), productId: row.productId, usd: row.cents / 100, heldOnServer: row.heldOnServer, already };
  };
  const known = await ctx.repo.getPurchase(store, c.transactionId);
  if (known) {
    const out = answer(known, true);
    if (known.status === 'refunded') {
      ctx.metrics.count('tk_refused_total', { reason: 'refunded_before_delivery' });
      throw fail(400, 'bad_request', 'purchase.refunded');
    }
    // Credited for a village on the device that has since moved here: the device may never have
    // delivered it (a lost answer, a failed save), so the server's village gets it now unless the move
    // brought it along (remnant audit 2026-11-06).
    let held = known.heldOnServer;
    if (!held) {
      held = await ctx.repo.transaction(async (tx) => {
        await tx.lockPurchases(me.id);
        if (!(await tx.getVillage(me.id))) return false;
        const id = villageId(store, known.transactionId);
        const r = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'grantPurchase', productId: known.productId, transactionId: id, verified: true }, reason: `purchase:${store}` }], id);
        if (r && !r.ok) ctx.log('info', 'purchase already in the village', { store, transactionId: known.transactionId });
        return true;
      });
    }
    await finish(ctx, c, held);
    return { ...out, heldOnServer: held };
  }
  const now = ctx.now();
  const counted = countedCents(ctx, product.usd, c.currency, c.priceMicros);
  // The intent this receipt names (its device: backend A5/A24).
  const named = c.accountToken ? await ctx.repo.getIntent(c.accountToken) : null;
  const device = named && named.playerId === me.id ? (named.device ?? null) : null;
  // Re-audit: Sandbox/test purchases cost nothing; on production only a small total is credited per player
  // (App Review needs purchases to work; public TestFlight must not mint Jade for the live ladder).
  // Backend A24: per buyer (every free account on the same devices together), and per day for the whole server.
  const testCap = ctx.payments.testCreditCapUsd;
  if (testCap !== undefined && c.environment !== 'Production') {
    const testSpent = (await ctx.repo.linkedPurchases(me.id, await devicesOf(ctx, me, device), 0)).filter((p) => p.environment !== 'Production').reduce((sum, p) => sum + p.cents, 0);
    const daily = ctx.policy.sandboxDailyCapUsd;
    const today = daily !== null ? await ctx.repo.testCentsSince(now - (now % (24 * HOUR))) : 0;
    if (testSpent + cents(product.usd) > cents(testCap) || (daily !== null && today + cents(product.usd) > cents(daily))) {
      ctx.metrics.count('tk_refused_total', { reason: 'test_purchase_cap' });
      throw fail(403, 'purchase_refused', 'purchase.test_limited');
    }
  }
  const result = await ctx.repo.transaction(async (tx) => {
    // Ledger audit A4: the under-18 cap is checked here too, not only at the intent. A receipt with no
    // intent of this player still open (no token: a modified game, a purchase started from the store page;
    // a token already used by an earlier purchase; a pruned one) reserved nothing, so it counts now.
    await tx.lockPurchases(me.id);
    const intent = c.accountToken ? await tx.getIntent(c.accountToken) : null;
    if (intent && intent.playerId !== me.id) throw fail(409, 'conflict', 'purchase.other_player');
    // GLOBAL-005: an intent the game released (or whose hold ran out) reserves nothing any more, so the
    // receipt counts now too: a modified game cannot free its hold, buy something else, then pay this one.
    if (!intent || intent.used || intent.holdUntil <= now) await holdOverCap(tx, ctx, me, counted, now);
    const heldOnServer = Boolean(await tx.getVillage(me.id));
    const row: PurchaseRow = {
      store,
      transactionId: c.transactionId,
      playerId: me.id,
      productId: product.id,
      // GLOBAL-007: the store's local price in USD when it is known, else the catalog price.
      cents: counted,
      at: now,
      environment: c.environment,
      status: 'credited',
      refundedAt: null,
      ref: c.ref,
      heldOnServer,
      storefront: c.storefront,
      currency: c.currency,
      priceMicros: c.priceMicros,
      device,
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
    if (intent && !intent.used) await tx.useIntent(intent.id);
    return answer(row, false);
  });
  if (!result.already) ctx.metrics.count('tk_purchases_total', { store, environment: c.environment });
  await finish(ctx, c, result.heldOnServer);
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
 * A refund was reversed (re-audit): the record counts again and a server-held village gets back exactly
 * what the refund took (`reinstatePurchase`: resources, stipend payments, looks, this season's premium
 * track; ledger `refund-reversed:<store>`). A village that does not hold the purchase gets its catalog
 * contents, as before. Idempotent with the status.
 */
export async function reinstate(ctx: ServerContext, store: PurchaseStore, transactionId: string): Promise<boolean> {
  const row = await ctx.repo.getPurchase(store, transactionId);
  if (!row || row.status !== 'refunded') return false;
  return ctx.repo.transaction(async (tx) => {
    if (!(await tx.setPurchaseStatus(store, transactionId, 'credited', ctx.now()))) return false;
    const player = await tx.getPlayer(row.playerId);
    if (!player) return true;
    const reason = `refund-reversed:${store}`;
    const id = villageId(store, transactionId);
    const r = await applyServerResult(tx, ctx, player, [{ cmd: { type: 'reinstatePurchase', transactionId: id }, reason }], id);
    if (r && !r.ok) {
      // The village never had this purchase (delivered before it moved here): give the catalog contents.
      const grants = productInfo(ctx.data, row.productId)?.grants ?? {};
      const resources = Object.fromEntries(Object.entries(grants).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>;
      if (Object.keys(resources).length) await applyServerResult(tx, ctx, player, [{ cmd: { type: 'staffAdjust', resources }, reason }], id);
    }
    return true;
  });
}

/** App Store Server Notifications v2 (`{ signedPayload }`). */
export async function appleNotification(ctx: ServerContext, body: { signedPayload?: unknown } | undefined): Promise<void> {
  if (!ctx.payments.apple) throw fail(404, 'not_found', 'purchase.apple_off');
  let n;
  try {
    n = ctx.payments.apple.notification(body?.signedPayload);
  } catch (e) {
    if (e instanceof PurchaseError) throw detailError(400, 'bad_request', e.message);
    throw e;
  }
  ctx.log('info', 'app store notification', { type: n.notificationType, subtype: n.subtype, id: n.notificationUUID, environment: n.environment });
  const t = n.transaction;
  // Backend A29: each notification once, and refund state by Apple's signed time. Apple retries a delivery
  // it thinks failed, and REFUND_REVERSED can arrive before the REFUND it reverses.
  if (n.notificationUUID) {
    const signedAt = n.signedDate ?? ctx.now();
    const seen = await ctx.repo.noteStoreNotification({ id: `apple:${n.notificationUUID}`, store: 'apple', ref: t?.transactionId ?? null, type: n.notificationType, signedAt, receivedAt: ctx.now() });
    if (seen.duplicate) {
      ctx.metrics.count('tk_store_notifications_total', { store: 'apple', result: 'duplicate' });
      return;
    }
    if (STATE_NOTICES.has(n.notificationType) && seen.newerAt !== null && seen.newerAt > signedAt) {
      ctx.metrics.count('tk_store_notifications_total', { store: 'apple', result: 'out_of_order' });
      ctx.log('warn', 'app store notification older than one already applied: skipped', { type: n.notificationType, transactionId: t?.transactionId ?? null });
      return;
    }
    ctx.metrics.count('tk_store_notifications_total', { store: 'apple', result: 'applied' });
  }
  if (n.notificationType === 'RESCIND_CONSENT') return rescindConsent(ctx, t);
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

/** Far future: a suspension that only staff (after a support check) or a new consent lifts. */
const UNTIL_LIFTED = 8_640_000_000_000_000;

/**
 * Report section 5 step 7 (compliance C02): a parent or guardian withdrew consent for this app
 * (App Store Server Notifications `RESCIND_CONSENT`). Apple then stops the app launching on that device;
 * the server stops the account playing online anywhere else: online play suspended until staff lift it
 * after a support check, the age group kept as under 18 (no purchases above the cap, no offers), a notice,
 * and a staff log line. The player is found through the transaction Apple sends (a purchase we credited, or
 * the purchase intent its appAccountToken names). Without one, staff get a log line and a metric to follow
 * up by hand: Apple's payload for this type was not available to check here.
 */
async function rescindConsent(ctx: ServerContext, t: { transactionId: string; appAccountToken: string | null } | null): Promise<void> {
  const byPurchase = t ? await ctx.repo.getPurchase('apple', t.transactionId) : null;
  const byIntent = !byPurchase && t?.appAccountToken ? await ctx.repo.getIntent(t.appAccountToken) : null;
  const playerId = byPurchase?.playerId ?? byIntent?.playerId ?? null;
  const player = playerId ? await ctx.repo.getPlayer(playerId) : null;
  ctx.metrics.count('tk_consent_rescinded_total', { identified: player ? 'yes' : 'no' });
  if (!player) {
    ctx.log('warn', 'app store consent rescinded for an account this server cannot identify', { transactionId: t?.transactionId ?? null });
    return;
  }
  const now = ctx.now();
  await ctx.repo.updatePlayer(player.id, { bannedUntil: UNTIL_LIFTED, banReason: 'A parent or guardian withdrew consent for this game (App Store).' });
  await ctx.repo.setAgeGroup(player.id, true, now);
  await ctx.repo.addStaffAction({ id: ctx.uuid(), at: now, actor: 'app-store', action: 'consent_rescinded', playerId: player.id, detail: { transactionId: t?.transactionId ?? null } });
  await notify(ctx, player.id, 'account', [msg('account.consent_withdrawn')]);
}

/** Google Play Real-time Developer Notifications (Pub/Sub push). */
export async function googleNotification(ctx: ServerContext, authorization: string | undefined, body: unknown): Promise<void> {
  if (!ctx.payments.google) throw fail(404, 'not_found', 'purchase.google_off');
  let n;
  try {
    n = await ctx.payments.google.notification(authorization, body);
  } catch (e) {
    if (e instanceof PurchaseError) throw staffError(401, 'unauthorized', e.message);
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
