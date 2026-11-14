/**
 * Compliance switches (2026-11-14; docs/PROTOCOL.md "Compliance switches"). Owner and legal decide each
 * switch; the code ships the mechanism with the safest default. Additive: new routes and hello features,
 * no protocol bump; older games keep working (they simply never see the new features).
 *
 * - Under-13 policy (`UNDER13_MODE`, audit C04/R07), announced as the hello feature `under13-<mode>`:
 *   `offline`: under-13 players do not play online at all (the game stops before registering; the server
 *   refuses their requests except account deletion); `limited` (the default): fixed phrases only in chat,
 *   free-text chat from others withheld, no server push, never findable; `families`: reserved for a
 *   verified parental-consent flow that does not exist yet, so the server applies `limited`.
 * - EU real-money equivalent of Jade prices (`EU_JADE_VALUE=1` / `VITE_EU_JADE_VALUE=1`, audit C16),
 *   hello feature `eu-jade-value`; the game works it out from the store's own pack prices.
 * - Apple CONSUMPTION_REQUEST answers (`APPLE_CONSUMPTION_RESPONSE=1`, audit A5), hello feature
 *   `consumption-consent`: only for players who switched the consent on (adults, Settings).
 * - Terms of service acceptance (audit C14), hello feature `terms-acceptance`: the version is the terms'
 *   effective date (`public/legal-config.js` `termsEffective`), recorded once per account.
 * - Significant-update acknowledgement (audit C02): `HelloResponse.significantUpdateBuild`
 *   (`SIGNIFICANT_UPDATE_BUILD`), compared with the build a parent last acknowledged on the device.
 */

export const ComplianceRoutes = {
  /** GET: what the server recorded for this account. */
  compliance: '/v1/me/compliance',
  /** PUT { version }: the terms of service version (effective date) the player accepted. */
  terms: '/v1/me/terms',
  /** PUT { consent }: share consumption information with Apple when asked about a refund (adults only). */
  consumptionConsent: '/v1/me/consumption-consent',
} as const;

export type Under13Mode = 'offline' | 'limited' | 'families';
export const UNDER13_MODES: readonly Under13Mode[] = ['offline', 'limited', 'families'];
/** The mode a server that announces none (older servers) is treated as: what they already enforced. */
export const DEFAULT_UNDER13_MODE: Under13Mode = 'limited';

export function parseUnder13Mode(v: unknown): Under13Mode | null {
  return typeof v === 'string' && (UNDER13_MODES as readonly string[]).includes(v.trim()) ? (v.trim() as Under13Mode) : null;
}

/** The under-13 mode a hello's features announce (`under13-<mode>`), else the default. */
export function under13ModeOf(features: readonly string[] | undefined): Under13Mode {
  for (const f of features ?? []) {
    const m = f.startsWith('under13-') ? parseUnder13Mode(f.slice(8)) : null;
    if (m) return m;
  }
  return DEFAULT_UNDER13_MODE;
}

/**
 * What a withheld message says to games that do not know `ChatView.withheld` (older builds): free-text chat
 * from other players is not shown to under-13 players in `limited` mode. Newer games show their own text.
 */
export const WITHHELD_CHAT_TEXT = '(Only ready-made phrases are shown.)';

/** A terms version is the effective date, YYYY-MM-DD. */
export const TERMS_VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validTermsVersion(v: unknown): v is string {
  if (typeof v !== 'string' || !TERMS_VERSION_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

export interface TermsRequest {
  version: string;
}

export interface ConsumptionConsentRequest {
  consent: boolean;
}

/** GET /v1/me/compliance and the answers to the two PUTs. */
export interface ComplianceView {
  /** The terms version this account accepted (null: none recorded). */
  termsVersion: string | null;
  /** Whether Apple may be sent consumption information about this account's purchases. */
  consumptionConsent: boolean;
}
