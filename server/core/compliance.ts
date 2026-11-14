/**
 * Compliance switches (2026-11-14; net/compliance.ts, docs/PROTOCOL.md "Compliance switches"). Each switch is
 * an owner/legal decision in `ServerPolicy` with the safest default:
 *
 * - Under-13 policy (`under13Mode`, C04/R07): `offline` refuses an under-13 player's requests (except account
 *   deletion and reading this record) and the age statement itself; `limited`/`families` keep them online
 *   with fixed phrases only (age.ts), others' free-text chat withheld (`withholdForReader`), no server push
 *   (`checkPushAllowed`) and never findable (age.ts, friends.ts).
 * - Terms of service acceptance (C14): `acceptTerms` records the version (its effective date) once.
 * - Apple consumption consent and CONSUMPTION_REQUEST answers (A5): `setConsumptionConsent` (adults only),
 *   `answerConsumptionRequest` (only with `appleConsumptionResponse`, the App Store Server API key and the
 *   player's consent; otherwise nothing is sent).
 */
import { ComplianceRoutes, validTermsVersion, WITHHELD_CHAT_TEXT, type ComplianceView, type Under13Mode } from '../../src/backend/net/compliance';
import { presetChatId, type ChatView } from '../../src/backend/net/protocol';
import { dollarsBucket, playTimeBucket, tenureBucket, type ConsumptionRequest } from '../payments/appleServerApi';
import type { AppleTransaction } from '../payments/apple';
import type { Player } from '../repo';
import { ageBandOf } from './age';
import type { ServerContext } from './context';
import { fail } from './errors';

const DAY = 86_400_000;

export function under13Mode(ctx: ServerContext): Under13Mode {
  return ctx.policy.under13Mode ?? 'limited';
}

/** The hello features and fields the switches add (identity.ts `hello`). */
export function complianceFeatures(ctx: ServerContext): string[] {
  return [
    `under13-${under13Mode(ctx)}`,
    'terms-acceptance',
    ...(ctx.policy.euJadeValue ? ['eu-jade-value'] : []),
    ...(consumptionAnswersOn(ctx) ? ['consumption-consent'] : []),
  ];
}

export function consumptionAnswersOn(ctx: ServerContext): boolean {
  return Boolean(ctx.policy.appleConsumptionResponse && ctx.payments.apple && ctx.appleApi);
}

/**
 * `offline` mode: is this request one an under-13 player may still make? Account deletion (Apple 5.1.1(v),
 * Play's deletion policy) and the hello stay open; everything else is refused.
 */
export function allowedWhileUnder13Offline(method: string, url: string): boolean {
  const path = url.split('?')[0];
  return (method === 'DELETE' && path === '/v1/me') || path === '/v1/hello' || path === ComplianceRoutes.compliance;
}

/** Throws `403 age_restricted` for an under-13 player while the server is in `offline` mode. */
export async function checkUnder13Online(ctx: ServerContext, me: Player): Promise<void> {
  if (under13Mode(ctx) !== 'offline') return;
  if ((await ageBandOf(ctx.repo, me.id)) === 'under13') throw fail(403, 'age_restricted', 'age.under13_offline');
}

/** Server push needs a band other than under 13 (all modes: no push token is kept for an under-13 player). */
export async function checkPushAllowed(ctx: ServerContext, me: Player): Promise<void> {
  if ((await ageBandOf(ctx.repo, me.id)) === 'under13') throw fail(403, 'age_restricted', 'push.not_for_age');
}

/** Free-text chat from other players, withheld from an under-13 reader (fixed phrases, even typed by an adult, system lines and their own messages stay). */
export function withholdForReader(messages: ChatView[], readerId: string): ChatView[] {
  return messages.map((m) => (m.kind === 'chat' && m.from && m.from.id !== readerId && m.presetId === undefined && presetChatId(m.text) < 0 ? { ...m, text: WITHHELD_CHAT_TEXT, withheld: true as const } : m));
}

export async function complianceView(ctx: ServerContext, me: Player): Promise<ComplianceView> {
  const r = await ctx.repo.getCompliance(me.id);
  return { termsVersion: r?.termsVersion ?? null, consumptionConsent: r?.consumptionConsent ?? false };
}

/** PUT /v1/me/terms { version }: keep the newest effective date accepted. */
export async function acceptTerms(ctx: ServerContext, me: Player, body: { version?: unknown } | undefined): Promise<ComplianceView> {
  const v = body?.version;
  if (!validTermsVersion(v) || Date.parse(`${v}T00:00:00Z`) > ctx.now() + 400 * DAY) throw fail(400, 'bad_request', 'terms.bad_version');
  const r = await ctx.repo.getCompliance(me.id);
  if (!r?.termsVersion || r.termsVersion < v) await ctx.repo.setTermsAccepted(me.id, v, ctx.now());
  ctx.metrics.count('tk_terms_accepted_total', {});
  return complianceView(ctx, me);
}

/** PUT /v1/me/consumption-consent { consent }: adults only may switch it on; anyone may switch it off. */
export async function setConsumptionConsent(ctx: ServerContext, me: Player, body: { consent?: unknown } | undefined): Promise<ComplianceView> {
  if (typeof body?.consent !== 'boolean') throw fail(400, 'bad_request', 'consent.bad_value');
  if (body.consent && (await ageBandOf(ctx.repo, me.id)) !== 'adult') throw fail(403, 'age_restricted', 'consent.not_adult');
  await ctx.repo.setConsumptionConsent(me.id, body.consent, ctx.now());
  return complianceView(ctx, me);
}

/**
 * App Store CONSUMPTION_REQUEST (purchases.ts `appleNotification`): send Apple the consumption information
 * only when the operators switched it on, the API key exists, the player is found, is an adult and consented.
 * Returns what happened (for the metric and tests). Never throws: Apple's notification is still acknowledged.
 */
export async function answerConsumptionRequest(ctx: ServerContext, t: AppleTransaction | null, environment: string): Promise<'off' | 'unknown_player' | 'no_consent' | 'sent' | 'failed'> {
  if (!consumptionAnswersOn(ctx) || !t) return 'off';
  // Only a purchase this server credited: its delivery is what the answer vouches for.
  const purchase = await ctx.repo.getPurchase('apple', t.transactionId);
  const player = purchase ? await ctx.repo.getPlayer(purchase.playerId) : null;
  if (!player) return 'unknown_player';
  const consent = (await ctx.repo.getCompliance(player.id))?.consumptionConsent === true;
  if (!consent || (await ageBandOf(ctx.repo, player.id)) !== 'adult') return 'no_consent';
  const history = await ctx.repo.purchasesOf(player.id, 500);
  const purchased = history.reduce((n, p) => n + p.cents, 0);
  const refunded = history.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.cents, 0);
  const body: ConsumptionRequest = {
    customerConsented: true,
    // Jade is spent over time; the server does not say how much of one pack was used.
    consumptionStatus: 0,
    platform: 1,
    sampleContentProvided: false,
    // Delivered: this server credited it.
    deliveryStatus: 0,
    appAccountToken: t.appAccountToken ?? '',
    accountTenure: tenureBucket((ctx.now() - player.createdAt) / DAY),
    // The server does not measure play time.
    playTime: playTimeBucket(null),
    lifetimeDollarsRefunded: dollarsBucket(refunded),
    lifetimeDollarsPurchased: dollarsBucket(purchased),
    userStatus: player.bannedUntil && player.bannedUntil > ctx.now() ? 2 : 1,
    // The game never asks Apple to decline a refund.
    refundPreference: 0,
  };
  try {
    await ctx.appleApi!.sendConsumption(t.transactionId, body, environment);
    return 'sent';
  } catch (e) {
    ctx.log('warn', 'app store consumption information not sent', { transactionId: t.transactionId, error: String(e) });
    return 'failed';
  }
}
