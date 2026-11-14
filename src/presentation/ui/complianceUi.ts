/**
 * Compliance switches on the HUD side (2026-11-14; net/compliance.ts):
 * - the terms of service screen (`termsGate`, audit C14): asked once before online play, only while
 *   `public/legal-config.js` dates the terms (`termsEffective`); "Not now" keeps the village offline;
 * - the Apple consumption consent switch (`consumptionConsentBlock`, audit A5): adults, Settings → Online
 *   play → Account, off until the player turns it on, stored on the server;
 * - the approximate real-money value of a Jade price in EU storefronts (`jadeValueText`, audit C16; a range since the
 *   third verification fixes 2026-11-14, and in the Store only): only
 *   in the Store and the player's own spend confirm, never in an offer that pops up.
 */
import { language, t } from './i18n';
import { h } from './dom';
import type { StorePrice } from '../../backend/payments/provider';
import type { UiKit } from './uiKit';

// ------------------------------------------------------------------ terms of service

const TERMS_KEY = 'tk.terms.accepted';

function termsAcceptedVersion(): string | null {
  try {
    return localStorage.getItem(TERMS_KEY);
  } catch {
    return null;
  }
}

/** The connection's terms gate for a `termsEffective` date; null (nothing asked) while it is empty or unreadable. */
export function termsGate(effective: string | null | undefined, kit: Pick<UiKit, 'confirm'>, url = './terms.html'): { version: string; accepted(): boolean; ask(): Promise<boolean> } | null {
  const version = (effective ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return null;
  const accepted = () => (termsAcceptedVersion() ?? '') >= version;
  return {
    version,
    accepted,
    ask: async () => {
      if (accepted()) return true;
      const localized = language().code !== 'en' && url.startsWith('./') ? url.replace('./', `./${language().code}/`) : url;
      const body = h('div', { class: 'terms-screen' }, h('p', {}, t('terms.body', { date: version })), h('p', {}, h('a', { href: localized, target: '_blank', rel: 'noopener' }, t('terms.read'))));
      const ok = await kit.confirm(t('terms.title'), body, t('terms.accept'), false, t('terms.notNow'));
      if (ok) {
        try {
          localStorage.setItem(TERMS_KEY, version);
        } catch {
          /* storage blocked: asked again next start, which is harmless */
        }
      }
      return ok;
    },
  };
}

// ------------------------------------------------------------------ Apple consumption consent

export interface ConsentLink {
  readonly canConsumptionConsent: boolean;
  compliance(): Promise<{ consumptionConsent: boolean }>;
  setConsumptionConsent(consent: boolean): Promise<{ consumptionConsent: boolean }>;
}

/** Settings → Online play → Account: the switch, read from the server (off until it answers). */
export function consumptionConsentBlock(conn: ConsentLink, toast: (text: string, kind?: 'info' | 'error' | 'success') => void): HTMLElement | null {
  if (!conn.canConsumptionConsent) return null;
  const box = h('input', { type: 'checkbox', disabled: true, 'data-id': 'consumption-consent' }) as HTMLInputElement;
  void conn.compliance().then(
    (v) => {
      box.checked = v.consumptionConsent;
      box.disabled = false;
    },
    () => undefined,
  );
  box.addEventListener('change', () => {
    const want = box.checked;
    box.disabled = true;
    void conn.setConsumptionConsent(want).then(
      (v) => {
        box.checked = v.consumptionConsent;
        box.disabled = false;
      },
      (e: Error) => {
        box.checked = !want;
        box.disabled = false;
        toast(e.message, 'error');
      },
    );
  });
  return h('div', { class: 'consent-block' }, h('label', { class: 'toggle' }, box, t('consent.apple.label')), h('p', { class: 'muted small' }, t('consent.apple.detail')));
}

// ------------------------------------------------------------------ shared replays: my base

export interface ReplayPrivacyLink {
  readonly canReplayPrivacy: boolean;
  replayPrivacy(): Promise<{ baseInReplays: boolean }>;
  setReplayPrivacy(allowBase: boolean): Promise<{ baseInReplays: boolean }>;
}

/**
 * Third verification fixes 2026-11-14 (8c): Settings → Online play → Account, adults only: "Allow my base in other
 * players' shared replays" (on by default for adults; a minor's base is never shared and gets no switch).
 */
export function replayPrivacyBlock(conn: ReplayPrivacyLink, toast: (text: string, kind?: 'info' | 'error' | 'success') => void): HTMLElement | null {
  if (!conn.canReplayPrivacy) return null;
  const box = h('input', { type: 'checkbox', disabled: true, 'data-id': 'replay-privacy' }) as HTMLInputElement;
  void conn.replayPrivacy().then(
    (v) => {
      box.checked = v.baseInReplays !== false;
      box.disabled = false;
    },
    () => undefined,
  );
  box.addEventListener('change', () => {
    const want = box.checked;
    box.disabled = true;
    void conn.setReplayPrivacy(want).then(
      (v) => {
        box.checked = v.baseInReplays !== false;
        box.disabled = false;
      },
      (e: Error) => {
        box.checked = !want;
        box.disabled = false;
        toast(e.message, 'error');
      },
    );
  });
  return h('div', { class: 'consent-block' }, h('label', { class: 'toggle' }, box, t('replays.allowBase.label')), h('p', { class: 'muted small' }, t('replays.allowBase.detail')));
}

// ------------------------------------------------------------------ EU real-money value of Jade

/** EU and EEA storefronts (alpha-2 and the alpha-3 codes StoreKit may report). */
const EU = new Set(
  'AT AUT BE BEL BG BGR HR HRV CY CYP CZ CZE DK DNK EE EST FI FIN FR FRA DE DEU GR GRC HU HUN IE IRL IT ITA LV LVA LT LTU LU LUX MT MLT NL NLD PL POL PT PRT RO ROU SK SVK SI SVN ES ESP SE SWE IS ISL LI LIE NO NOR'.split(' '),
);

export function euStorefront(code: string | null | undefined): boolean {
  return typeof code === 'string' && EU.has(code.trim().toUpperCase());
}

let jadeValueSwitch: () => boolean = () => false;
/** main.ts: the build flag VITE_EU_JADE_VALUE=1 or the server's `eu-jade-value` feature. Off by default. */
export function provideJadeValueSwitch(fn: () => boolean): void {
  jadeValueSwitch = fn;
}
export function jadeValueOn(): boolean {
  return jadeValueSwitch();
}

/** Real money per Jade across the Jade packs of one storefront (third verification fixes 2026-11-14). */
export interface JadeUnitRange {
  /** The cheapest per Jade (usually the biggest pack). */
  minMicrosPerJade: number;
  /** The dearest per Jade (usually the smallest pack). */
  maxMicrosPerJade: number;
  currency: string;
}

/**
 * Real money per Jade from the store's own pack prices: from the cheapest per Jade to the dearest per Jade, among
 * the packs priced in one currency. Null without usable prices (or with two currencies).
 */
export function jadeUnitRange(packs: readonly { storeId: string; moonstones: number }[], prices: Record<string, StorePrice> | null | undefined): JadeUnitRange | null {
  if (!prices) return null;
  let r = null as JadeUnitRange | null;
  for (const p of packs) {
    const sp = prices[p.storeId];
    if (!sp || !sp.currency || !Number.isFinite(sp.micros) || (sp.micros ?? 0) <= 0 || p.moonstones <= 0) continue;
    if (r && r.currency !== sp.currency) return null;
    const per = sp.micros! / p.moonstones;
    const prev: JadeUnitRange | null = r;
    r = prev ? { currency: prev.currency, minMicrosPerJade: Math.min(prev.minMicrosPerJade, per), maxMicrosPerJade: Math.max(prev.maxMicrosPerJade, per) } : { minMicrosPerJade: per, maxMicrosPerJade: per, currency: sp.currency };
  }
  return r;
}

/**
 * "about €0.33–€0.60" for a Jade price (docs/legal/MARKETS.md, EU CPC): what that much Jade costs bought in the
 * cheapest pack per Jade, up to bought in the dearest, so neither end overstates or understates it; "about €0.33"
 * when the two ends round the same. Null when the switch is off, the storefront is not in the EU or prices are
 * unknown. Only the Store shows it (real prices only in the Store and its confirm step).
 */
export function jadeValueText(jade: number, range: JadeUnitRange | null, storefront: string | null | undefined, on = jadeValueOn()): string | null {
  if (!on || !range || !euStorefront(storefront) || !(jade > 0)) return null;
  let low: string;
  let high: string;
  try {
    const f = new Intl.NumberFormat(language().code, { style: 'currency', currency: range.currency, maximumFractionDigits: 2, numberingSystem: 'latn' } as Intl.NumberFormatOptions);
    low = f.format((jade * range.minMicrosPerJade) / 1_000_000);
    high = f.format((jade * range.maxMicrosPerJade) / 1_000_000);
  } catch {
    return null;
  }
  return low === high ? t('jade.about', { value: low }) : t('jade.aboutRange', { low, high });
}
