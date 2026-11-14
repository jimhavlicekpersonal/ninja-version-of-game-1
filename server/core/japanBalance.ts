/**
 * Japan C17: the unused paid balance on a 資金決済法 base date (docs/legal/JAPAN.md section 3). Purchased Jade
 * is a 前払式支払手段 (自家型); once the unused paid balance on a base date (31 March / 30 September, end of
 * day JST) exceeds ¥10,000,000 the issuer must notify the Local Finance Bureau within two months and deposit
 * at least half of the balance. This staff report measures it from what the server knows:
 *
 * - purchases made in the Japanese storefront (Apple `JPN`, Play region `JP`), Production only, credited and
 *   not refunded by the base date;
 * - paid Jade per purchase: a Jade pack's Jade, an offer's Jade contents, a Clan Stipend's Jade over all its
 *   payments (the Season Scroll holds no Jade). Jade an offer gave in place of resources that did not fit
 *   is not recorded per purchase, so it is not counted (an understatement, stated in `notes`);
 * - free Jade is spent first (terms §3). For a server-held village the figure is an UPPER BOUND, not a
 *   free-first ledger walk: min(paid Jade delivered, the Jade balance on the base date) also counts free Jade
 *   earned after the paid Jade was spent (the ledger does not tell paid from free Jade once mixed, and a moved
 *   village's ledger does not start at zero). A device-held village counts all its paid Jade (balance unknown);
 * - Clan Stipend Jade not yet delivered on the base date (payments still to claim: bought minus the
 *   `command:claimStipend` ledger lines up to then) is outside the balance but owed: it is added in full
 *   (`undeliveredStipendJade`; second verification 2026-11-14);
 * - yen value at the yen price the player paid per Jade (Apple's JPY price); purchases without a JPY price
 *   (Play does not send one) at the average of the priced ones, else the catalog USD price through
 *   `USD_RATES.JPY`; Jade with no way to value it is reported as `unpricedJade`.
 *
 * Each run is kept as a staff action (`jp-unused-balance`, numbers and server version), the record behind a
 * notification. It is an estimate for the owner and an accountant, not legal advice.
 */
import type { ServerContext } from './context';
import { staffError } from './errors';
import { productInfo } from '../../src/gameplay/sim/monetization';
import { PROTOCOL_VERSION } from '../../src/backend/net/protocol';
import type { PurchaseRow } from '../repo';

/** The 資金決済法 threshold (Art. 5, Art. 14): unused paid balance above this on a base date. */
export const JP_THRESHOLD_YEN = 10_000_000;
/** Storefront codes of Japan: Apple's alpha-3, Play's alpha-2. */
export const JP_STOREFRONTS = ['JPN', 'JP'];
const JST_MS = 9 * 3_600_000;
const NON_PRODUCTION = new Set(['sandbox', 'test', 'xcode']);

export interface JapanBalanceReport {
  baseDate: string;
  /** End of the base date in JST, as epoch milliseconds. */
  baseAt: number;
  purchasers: number;
  purchases: number;
  paidJade: number;
  /** An upper bound for server-held villages (see the module comment), all paid Jade for device-held ones. */
  unusedPaidJade: number;
  /** True: `unusedPaidJade` and `unusedYen` are upper bounds, not exact free-first figures. */
  upperBound: boolean;
  /** Paid Clan Stipend Jade still to be delivered on the base date (included in `unusedPaidJade`). */
  undeliveredStipendJade: number;
  /** Players whose balance came from the server's ledger; the rest count all their paid Jade. */
  serverHeldPlayers: number;
  deviceHeldPlayers: number;
  /** Yen value of the unused paid Jade (rounded down), null when nothing could be valued. */
  unusedYen: number | null;
  /** Unused paid Jade that could not be valued in yen (no JPY price, no average, no USD_RATES.JPY). */
  unpricedJade: number;
  thresholdYen: number;
  exceeds: boolean;
  /** At least half of the whole unused balance (Art. 14), when over the threshold. */
  depositDueYen: number | null;
  /** Two months after the base date: the notification deadline when over the threshold. */
  notifyBy: string;
  notes: string[];
}

/** The latest base date (31 March or 30 September, JST) whose end is at or before `now`. */
export function latestBaseDate(now: number): string {
  const jst = new Date(now + JST_MS);
  let y = jst.getUTCFullYear();
  const candidates = [`${y}-09-30`, `${y}-03-31`, `${y - 1}-09-30`];
  for (const d of candidates) if (baseEnd(d) <= now) return d;
  y -= 1;
  return `${y}-03-31`;
}

/** The end of a JST calendar day as epoch milliseconds. */
function baseEnd(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) + 86_400_000 - JST_MS - 1;
}

/** Two months after the base date (31 March → 31 May; 30 September → 30 November). */
function twoMonthsAfter(date: string): string {
  return date.endsWith('-03-31') ? date.replace('-03-31', '-05-31') : date.replace('-09-30', '-11-30');
}

const isStipend = (ctx: ServerContext, productId: string): boolean => Boolean(ctx.data.store.stipend && productId === ctx.data.store.stipend.id);

/** Jade a purchase of this product delivered as paid Jade (see the module comment). */
function paidJadeOf(ctx: ServerContext, productId: string): number {
  const st = ctx.data.store.stipend;
  if (st && productId === st.id) return st.payments * st.jadePerPayment;
  return Math.max(0, Math.floor(productInfo(ctx.data, productId)?.grants.moonstones ?? 0));
}

const yenOf = (p: PurchaseRow): number | null => (p.currency?.toUpperCase() === 'JPY' && typeof p.priceMicros === 'number' && p.priceMicros > 0 ? p.priceMicros / 1_000_000 : null);

export async function japanBalanceReport(ctx: ServerContext, actor: string, rawDate: unknown): Promise<JapanBalanceReport> {
  const baseDate = rawDate === undefined || rawDate === '' ? latestBaseDate(ctx.now()) : String(rawDate);
  if (!/^\d{4}-(03-31|09-30)$/.test(baseDate)) throw staffError(400, 'bad_request', 'The base date is 31 March or 30 September (YYYY-03-31 or YYYY-09-30).');
  const baseAt = baseEnd(baseDate);
  if (baseAt > ctx.now()) throw staffError(400, 'bad_request', 'That base date has not ended yet (JST).');

  const rows = (await ctx.repo.storefrontPurchases(JP_STOREFRONTS, baseAt)).filter(
    (p) => !NON_PRODUCTION.has(String(p.environment).toLowerCase()) && !(p.status === 'refunded' && (p.refundedAt ?? 0) <= baseAt),
  );
  const byPlayer = new Map<string, PurchaseRow[]>();
  for (const p of rows) byPlayer.set(p.playerId, [...(byPlayer.get(p.playerId) ?? []), p]);

  // The yen price per Jade of the priced purchases: per player, and overall as the fallback.
  let allYen = 0;
  let allPricedJade = 0;
  for (const p of rows) {
    const yen = yenOf(p);
    const jade = paidJadeOf(ctx, p.productId);
    if (yen !== null && jade > 0) {
      allYen += yen;
      allPricedJade += jade;
    }
  }
  const usdToJpy = ctx.policy.usdRates.JPY ? 1 / ctx.policy.usdRates.JPY : null;

  let paidJade = 0;
  let unusedPaidJade = 0;
  let unusedYen = 0;
  let valued = false;
  let unpricedJade = 0;
  let serverHeldPlayers = 0;
  let undeliveredStipendJade = 0;
  for (const [playerId, list] of byPlayer) {
    let jade = 0;
    let stipendJade = 0;
    let yen = 0;
    let pricedJade = 0;
    let fallbackYen = 0;
    let fallbackJade = 0;
    for (const p of list) {
      const j = paidJadeOf(ctx, p.productId);
      jade += j;
      if (isStipend(ctx, p.productId)) stipendJade += j;
      const y = yenOf(p);
      if (y !== null) {
        yen += y;
        pricedJade += j;
      } else if (usdToJpy !== null && allPricedJade === 0) {
        fallbackYen += (p.cents / 100) * usdToJpy;
        fallbackJade += j;
      }
    }
    const balance = await ctx.repo.balanceAt(playerId, 'moonstones', baseAt);
    if (balance !== null) serverHeldPlayers++;
    let unused = jade;
    if (balance !== null) {
      // Stipend Jade reaches the balance only as its payments are claimed; what is still to claim is owed in full.
      const claimed = stipendJade > 0 ? Math.max(0, await ctx.repo.ledgerSumAt(playerId, 'moonstones', 'command:claimStipend', baseAt)) : 0;
      const owed = Math.max(0, stipendJade - claimed);
      undeliveredStipendJade += owed;
      unused = Math.max(0, Math.min(jade - owed, balance)) + owed;
    }
    paidJade += jade;
    unusedPaidJade += unused;
    const perJade = pricedJade > 0 ? yen / pricedJade : allPricedJade > 0 ? allYen / allPricedJade : fallbackJade > 0 ? fallbackYen / fallbackJade : null;
    if (perJade === null) unpricedJade += unused;
    else {
      unusedYen += unused * perJade;
      valued = true;
    }
  }
  const yenTotal = valued ? Math.floor(unusedYen) : null;
  const exceeds = yenTotal !== null && yenTotal > JP_THRESHOLD_YEN;
  const report: JapanBalanceReport = {
    baseDate,
    baseAt,
    purchasers: byPlayer.size,
    purchases: rows.length,
    paidJade,
    unusedPaidJade,
    upperBound: true,
    undeliveredStipendJade,
    serverHeldPlayers,
    deviceHeldPlayers: byPlayer.size - serverHeldPlayers,
    unusedYen: yenTotal,
    unpricedJade,
    thresholdYen: JP_THRESHOLD_YEN,
    exceeds,
    depositDueYen: exceeds ? Math.ceil(yenTotal! / 2) : null,
    notifyBy: twoMonthsAfter(baseDate),
    notes: [
      'Upper bound: free Jade is counted as spent first, but for server-held villages unused paid Jade is min(paid Jade delivered, the Jade balance on the base date), which also counts free Jade earned after paid Jade was spent. Device-held villages count all their paid Jade (balance unknown).',
      'Clan Stipend Jade bought but not yet delivered on the base date is owed and counted in full (undeliveredStipendJade).',
      'Jade an offer gave in place of resources that did not fit is not counted (not recorded per purchase).',
      'Purchases from before storefronts were recorded (migration 0023) have no storefront and are not counted.',
      ...(unpricedJade ? ['Some Jade has no yen price: set USD_RATES with JPY or check the store reports.'] : []),
    ],
  };
  await ctx.repo.addStaffAction({ id: ctx.uuid(), at: ctx.now(), actor: actor || 'staff', action: 'jp-unused-balance', playerId: null, detail: { ...report, notes: undefined, protocol: PROTOCOL_VERSION, rules: ctx.rules.live.dataVersion } });
  ctx.log('info', 'staff action', { actor, action: 'jp-unused-balance', baseDate, exceeds });
  return report;
}
