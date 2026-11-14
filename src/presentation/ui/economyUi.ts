import { messageText as ownedError } from './i18n';
import { listText as i18nList } from './i18n';
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
import { language, t } from './i18n';
import type { GameController } from '../../gameplay/control/controller';
import { achievementViews } from '../../gameplay/sim/achievements';
import { activeOffers, offerReturns, offerRule, offersAllowed } from '../../gameplay/sim/offers';
import { bandFromProfile } from '../../gameplay/sim/age';
import { askAgeBand } from './ageScreen';
import { canPurchase, productGrantsFor, productInfo, spentThisMonth, spentTotal, storeProductId } from '../../gameplay/sim/monetization';
import { stipendStatus } from '../../gameplay/sim/stipend';
import type { StorePrice } from '../../backend/payments/provider';
import { currentTasks, passPremiumValue, passSaleOpen, passSeasonEndsAt, unlockedTier } from '../../gameplay/sim/pass';
import type { Cost, OfferRule, ResourceKind } from '../../gameplay/sim/types';
import { RESOURCE_KINDS } from '../../gameplay/sim/types';
import { hallLevel, passTierReward, rewardOverflow } from '../../gameplay/sim/village';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';
import { Capacitor } from '@capacitor/core';

export type { UiKit } from './uiKit';
import type { UiKit } from './uiKit';
import { jadeUnitPrice, jadeValueOn, jadeValueText } from './complianceUi';

const usd = (n: number) => new Intl.NumberFormat(language().code, { style: 'currency', currency: 'USD' }).format(n);
/** The device's language is Japanese (the purchase confirm then links the Japanese notices). */
function japaneseDevice(): boolean {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return /^ja\b/i.test(langs[0] ?? '');
  } catch {
    return false;
  }
}

/**
 * Japan C17: the Japanese legal notices (特定商取引法, 資金決済法) belong to purchases in the Japanese storefront,
 * whatever the device language. The store's storefront country decides when it reports one (StoreKit
 * `Storefront.current`, Play `BillingConfig`); otherwise the device language does, as before.
 */
export function japaneseStorefront(storefront: string | null | undefined, deviceIsJapanese: boolean): boolean {
  return storefront ? storefront === 'JP' : deviceIsJapanese;
}

/** A small padlock for things that can't be claimed yet. */
const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.5 7V5.2a3.5 3.5 0 0 1 7 0V7h.6c.5 0 .9.4.9.9v6.2c0 .5-.4.9-.9.9H3.9a.9.9 0 0 1-.9-.9V7.9c0-.5.4-.9.9-.9h.6Zm1.8 0h3.4V5.2a1.7 1.7 0 0 0-3.4 0V7Z"/></svg>';
const RES_NAME: Record<ResourceKind, string> = { acorns: 'Coins', dew: 'Provisions', nightsap: 'Shadow Ink', moonstones: 'Jade' };

export function rewardChips(r: Cost & { skin?: string }, skinName?: (id: string) => string): HTMLElement {
  const wrap = h('span', { class: 'cost' });
  for (const k of RESOURCE_KINDS) {
    const v = r[k as ResourceKind];
    if (!v) continue;
    wrap.append(h('span', { class: 'chip' }, icon(icons[k as 'acorns' | 'dew' | 'moonstones'] ?? ''), formatNumber(v)));
  }
  if (r.skin) wrap.append(h('span', { class: 'chip good' }, icon(icons.toadstool), skinName ? skinName(r.skin) : r.skin));
  return wrap;
}

export class EconomyUi {
  private readonly c: GameController;
  constructor(private readonly kit: UiKit) {
    this.c = kit.c;
  }

  private skinName = (id: string) => localizedData(this.c.data).cosmetics.hallSkins.find((s) => s.id === id)?.name ?? id;
  /** The pass-only Keep look, by its data name (it was hard-coded as "Lantern Elder"; the data calls it Lantern Festival). */
  private passLookName = () => localizedData(this.c.data).cosmetics.hallSkins.find((s) => s.passOnly)?.name ?? 'season';
  /** The Scroll's build speed bonus as the data has it (a balance bundle can change it; the text used to say 20 regardless). */
  private passSpeedPct = () => Math.round(this.c.data.pass.premiumBuildSpeedBonus * 100);

  /**
   * Prices as this device's store shows them (GLOBAL-007), keyed by store
   * product id: 'loading' until the store answered, 'failed' if it could not
   * be asked. The catalog's USD numbers are only the game's own accounting
   * (the under-18 cap); real-money buttons never show them as a price.
   */
  private storePrices: Record<string, StorePrice> | 'loading' | 'failed' | null = null;
  /** Every product had a price in the last answer: only then are prices kept for the session. */
  private pricesComplete = false;
  /** The Store window that last asked (its redraw): one question per opening, never one per redraw. */
  private pricesAskedBy: (() => void) | null = null;

  /**
   * Ask the store for prices when the Store opens (client re-audit item 12). An empty answer (a
   * store that did not answer properly) counts as failed, and a partial one is shown but asked
   * again on the next open; only a complete answer is kept. The providers give up after 10 s.
   */
  private loadPrices(redraw: () => void): void {
    const pay = this.c.payments;
    void this.storefront(); // Japan C17: known before the confirm step opens
    if (!pay.prices || !pay.available() || this.storePrices === 'loading' || this.pricesComplete || this.pricesAskedBy === redraw) return;
    this.pricesAskedBy = redraw;
    const d = localizedData(this.c.data);
    const ids = [...new Set([...d.store.packs.map((p) => p.id), d.pass.productId, ...d.offers.rules.map((o) => o.productId), ...(d.store.stipend ? [d.store.stipend.id] : [])].map((id) => storeProductId(d, id)))];
    // A partial answer stays on screen while the store is asked again.
    if (this.storePrices === null || this.storePrices === 'failed') this.storePrices = 'loading';
    pay.prices(ids).then(
      (prices) => {
        const found = ids.filter((id) => prices[id]).length;
        this.pricesComplete = found === ids.length;
        this.storePrices = found > 0 ? prices : 'failed';
        redraw();
      },
      () => {
        if (this.storePrices === 'loading') this.storePrices = 'failed';
        redraw();
      },
    );
  }

  /** What a real-money button says, and whether it can be bought here. */
  private price(productId: string): { label: string; buyable: boolean } {
    const pay = this.c.payments;
    const p = productInfo(localizedData(this.c.data), productId);
    if (!p || !pay.available()) return { label: i18nText("ui.not_available_67a926f700"), buyable: false };
    // The sandbox test store charges nothing: its numbers are the catalog's, marked as tests.
    if (!pay.prices) return pay.name === 'mock' ? { label: i18nText("ui.test_7394a4113a", { arg1: usd(p.usd) }), buyable: true } : { label: i18nText("ui.not_available_67a926f700"), buyable: false };
    const sp = this.storePrices;
    if (sp === null || sp === 'loading') return { label: '…', buyable: false };
    if (sp === 'failed') return { label: i18nText("ui.price_unavailable_6a9e657bba"), buyable: false };
    const found = sp[storeProductId(localizedData(this.c.data), productId)];
    return found ? { label: found.formatted, buyable: true } : { label: i18nText("ui.not_sold_here_a8410f6905"), buyable: false };
  }

  private buyButton(productId: string, cls: string, after?: () => void): HTMLElement {
    const pr = this.price(productId);
    const b = h('button', { class: `btn ${cls}`, type: 'button' }, pr.label) as HTMLButtonElement;
    b.disabled = !pr.buyable;
    b.addEventListener('click', () => void this.buy(productId).then(() => after?.()));
    return b;
  }

  /**
   * Ask once for the age (sets the spending protection), with the same neutral
   * age screen as online play (re-audit: no preselected answer, equal buttons).
   */
  private async ensureAge(): Promise<boolean> {
    if (this.c.state.profile.under18 !== null) return true;
    const why = i18nText("ui.before_your_first_purchase_please_ente_c039408f27");
    const band = this.kit.askAge ? await this.kit.askAge(why) : await askAgeBand(this.kit, why);
    if (!band) return false;
    return this.c.dispatch({ type: 'setProfile', under18: band !== 'adult', ageBand: band }).ok;
  }

  /** The store's storefront country (Japan C17), asked once per session; null when the store does not say. */
  private storefrontCode: Promise<string | null> | null = null;
  private storefront(): Promise<string | null> {
    const pay = this.c.payments;
    if (!pay.storefront || !pay.available()) return Promise.resolve(null);
    this.storefrontCode ??= pay.storefront().catch(() => null);
    void this.storefrontCode.then((c) => (this.storefrontKnown = c));
    return this.storefrontCode;
  }
  private storefrontKnown: string | null = null;

  /**
   * Compliance switches 2026-11-14 (EU CPC, audit C16): "about €0.42" beside a Jade price, from the cheapest
   * Jade pack per Jade in this storefront, when switched on and the storefront is in the EU. Only the Store
   * and the player's own spend confirm use it, never an offer that pops up.
   */
  private jadeAbout(jade: number): string | null {
    if (!jadeValueOn() || this.c.payments.name === 'mock') return null;
    const sp = this.storePrices;
    const d = localizedData(this.c.data);
    const unit = sp && typeof sp === 'object' ? jadeUnitPrice(d.store.packs.map((p) => ({ storeId: storeProductId(d, p.id), moonstones: p.moonstones })), sp) : null;
    return jadeValueText(jade, unit, this.storefrontKnown);
  }

  /** Full purchase flow: age group, clear confirm step, provider, result. */
  async buy(productId: string): Promise<void> {
    if (!(await this.ensureAge())) return;
    const p = productInfo(localizedData(this.c.data), productId);
    if (!p) return;
    const pr = this.price(productId);
    if (!pr.buyable) return;
    // Remnant audit (2026-11-06): say no before the confirm steps, not after them (a player under 18 was
    // asked to check $99.99 with a grown-up, then told it was over the monthly limit).
    const allowed = canPurchase(this.c.state, productId, this.c.now(), this.c.data);
    if (!allowed.ok) {
      this.kit.toast(allowed.message, 'error');
      return;
    }
    // Player-facing names, never internal resource ids (GLOBAL-007).
    // What buying it now really delivers (offers are sized for the Keep and storage-capped: productGrantsFor).
    const real = productGrantsFor(this.c.state, productId, localizedData(this.c.data));
    const contents = i18nList(Object.entries(real?.grants ?? p.grants).filter(([, v]) => v).map(([k, v]) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(v as number), arg2: RES_NAME[k as ResourceKind] ?? k })));
    const st = localizedData(this.c.data).store.stipend;
    const what = p.kind === 'stipend' && st
      ? i18nText("ui.daily_payments_of_jade_claimed_one_a_d_18cf83dd7e", { arg1: p.name, arg2: st.payments, arg3: st.jadePerPayment })
      : p.kind === 'pass' ? i18nText("ui.premium_rewards_and_20_faster_builds_u_f67e337b8e", { arg1: p.name, arg2: this.seasonEndsText(), pct: this.passSpeedPct() }) : `${p.name}${contents ? i18nText("ui.message_463d2c3dd0", { arg1: contents }) : ''}${t('text.period')}`;
    const note = this.c.payments.prices ? i18nText("ui.the_store_shows_the_final_price_includ_238d3d7f09") : '';
    // EU/UK digital content (re-audit design item 13): delivery starts at once, so the player acknowledges the loss of
    // the 14-day right to cancel before paying. Japanese devices also get the legally required notices.
    const message = h(
      'div',
      { class: 'purchase-confirm' },
      h('p', {}, i18nText("ui.price_8c7a15f4eb", { arg1: what, arg2: pr.label, arg3: note })),
      // The stipend is not delivered at once: its payments start at once (remnant audit 2026-11-06).
      h('p', { class: 'muted small withdrawal' }, p.kind === 'stipend' ? t('store.withdrawalStipend') : i18nText("ui.the_item_is_delivered_at_once_by_buyin_2f987c8cb3")),
      japaneseStorefront(await this.storefront(), japaneseDevice())
        ? h('p', { class: 'small legal-ja', lang: 'ja' }, this.legalLink('特定商取引法に基づく表記', './tokushoho.html'), ' · ', this.legalLink('資金決済法に基づく表示', './shikin-kessai.html'))
        : null,
    );
    const ok = await this.kit.confirm(i18nText("ui.confirm_purchase_9f1c387f5d"), message, i18nText("ui.buy_for_95b444e01e", { arg1: pr.label }), false, i18nText("ui.cancel_19766ed6cc"));
    if (!ok) return;
    if (this.c.state.profile.under18) {
      const ok2 = await this.kit.confirm(i18nText("ui.check_with_a_grown_up_360b51a009"), i18nText("ui.you_are_about_to_spend_of_real_money_m_25c38551fa", { arg1: pr.label }), i18nText("ui.yes_buy_it_4829fa5850"), false, i18nText("ui.cancel_19766ed6cc"));
      if (!ok2) return;
    }
    const r = await this.c.purchase(productId);
    if (r.ok && r.unsaved) this.kit.toast(i18nText("ui.your_purchase_is_here_but_this_device__e9f1afc3af"), 'error');
    else if (r.ok) this.kit.toast(i18nText("ui.thank_you_your_purchase_has_been_deliv_7e995803ae"), 'success');
    else this.kit.toast(r.message, r.code === 'PENDING' || r.code === 'pending' ? 'info' : 'error');
  }

  /** A shipped legal page: a new tab on the web, a frame inside the app (a system browser can't open a bundled page). */
  private legalLink(label: string, url: string): HTMLElement {
    if (Capacitor.isNativePlatform()) {
      return h('button', { class: 'link-btn', type: 'button', onclick: () => this.kit.modal(label, h('iframe', { class: 'legal-frame', src: url, title: label }), [], 'wide') }, i18nLabel(label));
    }
    return h('a', { href: url, target: '_blank', rel: 'noopener' }, i18nLabel(label));
  }

  /** Confirm a Moonstone spend, then run it. */
  async spendMoonstones(title: string, what: string, moonstones: number, run: () => boolean): Promise<void> {
    if (this.c.state.resources.moonstones < moonstones) {
      const go = await this.kit.confirm(i18nText("ui.not_enough_jade_0209424a79"), i18nText("ui.costs_jade_and_you_have_a0f0c4813d", { arg1: what, arg2: moonstones, arg3: this.c.state.resources.moonstones }), i18nText("ui.visit_the_store_f4a400762a"), false, i18nText("ui.not_now_a0e63d7c71"));
      if (go) this.openStore('moonstones');
      return;
    }
    const about = this.jadeAbout(moonstones);
    const text = i18nText("ui.for_jade_e82ccb5ba3", { arg1: what, arg2: moonstones });
    const ok = await this.kit.confirm(title, about ? h('div', {}, h('p', {}, text), h('p', { class: 'muted small jade-about' }, about)) : text, i18nText("ui.spend_f1b31dbc4d", { arg1: moonstones }), false, i18nText("ui.cancel_19766ed6cc"));
    if (ok && !run()) this.kit.toast(i18nText("ui.that_did_not_work_try_again_d38eba7d01"), 'error');
  }

  // ------------------------------------------------------------ store

  /** The store is the only screen that shows real-money prices. */
  openStore(tab: 'moonstones' | 'offers' | 'pass' | 'looks' = 'moonstones'): void {
    const body = h('div', {});
    let current = tab;
    const draw = () => {
      clear(body);
      const tabs: [typeof current, string][] = [['moonstones', 'Jade'], ['offers', `${i18nLabel('Offers')}${activeOffers(this.c.state, this.c.now()).length ? ' •' : ''}`], ['pass', localizedData(this.c.data).pass.name], ['looks', 'Looks']];
      body.append(
        h('div', { class: 'shop-tabs' }, ...tabs.map(([id, label]) => {
          const b = h('button', { type: 'button', class: id === current ? 'on' : '' }, i18nLabel(label));
          b.addEventListener('click', () => {
            current = id;
            draw();
          });
          return b;
        })),
      );
      if (current === 'moonstones') {
        const claim = this.stipendCard(draw);
        if (claim) body.append(claim);
        body.append(this.packsGrid());
      }
      else if (current === 'offers') body.append(this.offersList());
      else if (current === 'pass') body.append(this.passProduct(draw));
      else body.append(this.looksGrid(draw));
      this.loadPrices(draw);
      if (this.c.payments.name === 'mock') body.append(h('p', { class: 'muted small store-note' }, i18nText("ui.sandbox_test_store_purchases_complete__c4b42410c2")));
      else if (!this.c.payments.available()) body.append(h('p', { class: 'muted small store-note' }, i18nText("ui.purchases_are_not_available_in_this_ve_15307f1254")));
      else if (this.storePrices === 'failed') body.append(h('p', { class: 'muted small store-note' }, i18nText("ui.the_store_could_not_be_reached_for_pri_867d731094")));
      if (this.c.payments.store && this.c.payments.available()) {
        // App Store rule: a way to get back what was bought (this season's Scroll, purchases paid but not delivered).
        const restore = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.restore_purchases_c6399925b3")) as HTMLButtonElement;
        restore.addEventListener('click', () => {
          restore.disabled = true;
          void this.c.restorePurchases().then(
            (r) => {
              restore.disabled = false;
              const n = r.delivered + r.restored;
              this.kit.toast(n ? t('store.restored', { n }) : i18nText("ui.nothing_to_restore_everything_you_boug_a26d2009a5"), n ? 'success' : 'info');
              draw();
            },
            (e: Error) => {
              restore.disabled = false;
              this.kit.toast(ownedError(e.message, true), 'error');
            },
          );
        });
        body.append(h('div', { class: 'actions store-note' }, restore));
      }
    };
    draw();
    this.kit.modal(i18nText("ui.store_ee7da936b5"), body, [], 'wide');
  }

  private packsGrid(): HTMLElement {
    const grid = h('div', { class: 'shop-grid' });
    const packs = localizedData(this.c.data).store.packs;
    // Remnant audit (2026-11-06): the bonus is worked out from what this storefront charges (store prices
    // in one currency), not the catalog's US dollars, whose ratios other storefronts do not keep. The
    // sandbox test store uses the catalog; with no complete store prices there is no bonus to show.
    const priceOf = (id: string): { amount: number; currency: string } | null => {
      if (this.c.payments.name === 'mock') return { amount: productInfo(this.c.data, id)?.usd ?? 0, currency: 'USD' };
      const sp = this.storePrices;
      if (!sp || typeof sp !== 'object') return null;
      const found = sp[storeProductId(this.c.data, id)];
      return found && Number.isFinite(found.micros) && (found.micros ?? 0) > 0 ? { amount: found.micros!, currency: found.currency ?? '' } : null;
    };
    const basePrice = priceOf(packs[0].id);
    packs.forEach((p, i) => {
      const price = priceOf(p.id);
      const bonus = basePrice && price && price.currency === basePrice.currency ? Math.round(((p.moonstones / price.amount) / (packs[0].moonstones / basePrice.amount) - 1) * 100) : 0;
      const card = h(
        'div',
        { class: 'shop-card pack' },
        h('div', { class: 'pack-gems' }, ...Array.from({ length: Math.min(6, i + 1) }, () => icon(icons.moonstones))),
        h('div', { class: 'shop-name' }, p.name),
        h('div', { class: 'pack-amount' }, icon(icons.moonstones), formatNumber(p.moonstones)),
        bonus > 0 ? h('div', { class: 'chip good' }, i18nText("ui.value_fbc88ed85a", { arg1: bonus })) : null,
        this.buyButton(p.id, 'primary'),
      );
      grid.append(card);
    });
    // Clan Stipend: a one-time purchase paid out daily, never a subscription.
    const st = localizedData(this.c.data).store.stipend;
    const ss = stipendStatus(this.c.state, this.c.now(), localizedData(this.c.data));
    if (st && ss.offered) {
      grid.append(
        h(
          'div',
          { class: 'shop-card pack stipend' },
          h('div', { class: 'pack-gems' }, icon(icons.moonstones), h('span', { class: 'stipend-x' }, i18nText("ui.message_35d1a6271d", { arg1: st.payments }))),
          h('div', { class: 'shop-name' }, st.name),
          h('div', { class: 'small' }, i18nText("ui.daily_payments_of_jade_does_not_renew_d5f1666952", { arg1: st.payments, arg2: st.jadePerPayment })),
          ss.left > 0 ? h('div', { class: 'chip good' }, t('stipend.left', { n: ss.left })) : null,
          ss.canBuy ? this.buyButton(st.id, 'primary') : h('span', { class: 'claim-flat' }, i18nText("ui.buy_again_when_all_are_claimed_9a1fff1183")),
        ),
      );
    }
    return grid;
  }

  /** "Clan Stipend: claim 20 Jade (12 left)" while a payment is waiting today (no reminders: it waits for the player). */
  stipendCard(after?: () => void): HTMLElement | null {
    const ss = stipendStatus(this.c.state, this.c.now(), localizedData(this.c.data));
    if (!ss.claimable) return null;
    const btn = h('button', { class: 'btn gold', type: 'button' }, icon(icons.moonstones), i18nText("ui.claim_1ad9b1da01", { arg1: ss.jade }));
    btn.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'claimStipend' });
      if (!r.ok) this.kit.toast(ownedError(r.message, true), 'error');
      else this.kit.toast(i18nText("ui.jade_from_your_clan_stipend_1b4d5ddddd", { arg1: ss.jade }), 'success');
      after?.();
    });
    return h('div', { class: 'log-row stipend-card' }, h('div', {}, h('b', {}, t('stipend.claim', { jade: ss.jade })), h('div', { class: 'muted small' }, t('stipend.leftDaily', { n: ss.left }))), btn);
  }

  private offersList(): HTMLElement {
    const wrap = h('div', {});
    const list = activeOffers(this.c.state, this.c.now());
    // Economy E02: say why the tab stays empty, instead of a "right now" that never changes.
    const p = this.c.state.profile;
    const why = offersAllowed(this.c.state) ? t('offers.none') : p.under18 === null ? t('offers.noAge') : t('offers.minor');
    if (!list.length) wrap.append(h('p', { class: 'muted' }, i18nLabel(why)));
    for (const a of list) {
      const rule = offerRule(localizedData(this.c.data), a.id);
      if (!rule) continue;
      wrap.append(
        h(
          'div',
          { class: 'log-row' },
          h('div', {}, h('b', {}, rule.title), h('div', { class: 'muted small' }, rule.description), h('div', { class: 'row' }, rewardChips(this.offerContents(rule.productId, rule.contents)), h('span', { class: 'chip' }, icon(icons.clock), this.offerTimeText(rule, a.expiresAt))), this.convertedNote(rule.productId)),
          this.buyButton(rule.productId, 'primary'),
        ),
      );
    }
    return wrap;
  }

  /** What an offer delivers to this village now (sized for the Keep, capped by storage). */
  private offerContents(productId: string, fallback: Cost): Cost {
    return productGrantsFor(this.c.state, productId, localizedData(this.c.data))?.grants ?? fallback;
  }

  /** "12,000 Coins don't fit: +40 Jade instead" (bought resources never sit above storage). */
  private convertedNote(productId: string): HTMLElement | null {
    const g = productGrantsFor(this.c.state, productId, localizedData(this.c.data));
    if (!g || g.convertedJade <= 0) return null;
    const what = i18nList(RESOURCE_KINDS.filter((k) => g.converted[k]).map((k) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(g.converted[k]!), arg2: RES_NAME[k] })), 'conjunction');
    return h('div', { class: 'muted small' }, i18nText("ui.fit_in_your_storage_jade_instead_inclu_aa039ca86b", { arg1: what, arg3: formatNumber(g.convertedJade) }));
  }

  /** "Season ends in 12 days" (re-audit: the pass card and its confirm say when the season ends). */
  private seasonEndsText(): string {
    const left = passSeasonEndsAt(this.c.now(), localizedData(this.c.data)) - this.c.now();
    const days = Math.floor(left / 86_400_000);
    return days >= 1 ? t('pass.endsInDays', { n: days }) : i18nText("ui.the_season_ends_in_404629af61", { arg1: formatDuration(left) });
  }

  /**
   * How long an offer is shown (re-audit, EU CPC: no false last chance). An
   * offer with a cooldown comes back later, and says so; a one-time offer
   * just says how long it is here.
   */
  private offerTimeText(rule: OfferRule, expiresAt: number): string {
    const left = formatDuration(Math.max(0, expiresAt - this.c.now()));
    return offerReturns(rule) ? i18nText("ui.here_for_back_again_later_5e16f6967c", { arg1: left }) : i18nText("ui.here_for_3b4e450faf", { arg1: left });
  }

  private passProduct(redraw: () => void): HTMLElement {
    const d = localizedData(this.c.data);
    if (this.c.state.pass.premium) return h('p', { class: 'chip good' }, i18nText("ui.you_have_the_premium_season_scroll_thi_5556b0fea6"));
    const ends = this.seasonEndsText();
    const now = this.c.now();
    // An honest value line (passPremiumValue): only tiers still reachable this season count.
    const v = passPremiumValue(this.c.state, now, d);
    const sale = passSaleOpen(now, d, this.c.state);
    const check = canPurchase(this.c.state, d.pass.productId, now, d);
    const closed = !sale.open && !check.ok && check.code === 'SEASON_ENDING';
    const value = h('div', { class: 'small pass-value' }, t('pass.value', { jade: v.total, tiers: v.tiers, total: v.tiersTotal, days: v.daysLeft }));
    const buy = closed ? h('span', { class: 'claim-flat' }, i18nText("ui.not_on_sale_51a77c4bdf")) : this.buyButton(d.pass.productId, 'gold', redraw);
    return h(
      'div',
      { class: 'pass-premium' },
      h('div', {}, h('b', {}, i18nText("ui.premium_track_4a4a663105", { arg1: d.pass.name })), h('div', { class: 'muted small' }, i18nText("ui.until_the_season_ends_20_faster_builds_428fde58a5", { arg1: this.passLookName(), pct: this.passSpeedPct() })), h('div', { class: 'chip' }, icon(icons.clock), `${ends.charAt(0).toUpperCase()}${ends.slice(1)}`), value, closed && !check.ok ? h('p', { class: 'note' }, check.message) : null),
      buy,
    );
  }

  private looksGrid(redraw: () => void): HTMLElement {
    const grid = h('div', { class: 'shop-grid' });
    const s = this.c.state;
    for (const skin of localizedData(this.c.data).cosmetics.hallSkins) {
      const owned = s.cosmetics.owned.includes(skin.id);
      const equipped = s.cosmetics.hallSkin === skin.id;
      // Report section 5 step 3/4 (art F2): the real Keep in this look, not the old game's mushroom cap.
      // Until the art is ready, a roof-shaped swatch in the look's roof and trim colours.
      const thumb = this.kit.skinThumb?.(skin.id) ?? null;
      const swatch = thumb
        ? h('img', { class: 'skin-thumb', src: thumb, alt: i18nText("ui.clan_keep_in_the_look_2f739d685d", { arg1: skin.name }) })
        : h('div', { class: 'skin-swatch', role: 'img', 'aria-label': i18nText("ui.roof_colours_f7a5a7becd", { arg1: skin.name }), style: `--roof:${skin.cap};--trim:${skin.spots}` });
      let action: HTMLElement;
      if (equipped) action = h('span', { class: 'chip good' }, i18nText("ui.in_use_750af77aa4"));
      else if (owned) {
        action = h('button', { class: 'btn sky', type: 'button' }, i18nText("ui.use_c36d819e7b"));
        action.addEventListener('click', () => {
          this.c.dispatch({ type: 'equipSkin', skin: skin.id });
          redraw();
        });
      } else if (skin.passOnly) action = h('span', { class: 'chip' }, i18nText("ui.reward_45b24062a2", { arg1: localizedData(this.c.data).pass.name }));
      // Remnant audit (2026-11-06): a calendar look showed a 0 Jade buy button that always failed.
      else if (skin.calendarOnly) action = h('span', { class: 'chip' }, t('store.calendarLook'));
      else if (skin.minKeep && hallLevel(s, localizedData(this.c.data)) < skin.minKeep) action = h('span', { class: 'chip' }, i18nText("ui.unlocks_at_keep_53e015b015", { arg1: skin.minKeep }));
      else {
        action = h('button', { class: 'btn gold', type: 'button' }, icon(icons.moonstones), String(skin.moonstones));
        action.addEventListener('click', () => {
          void this.spendMoonstones(i18nText("ui.buy_this_look_1b89833db0"), i18nText("ui.purely_visual_19c28485fc", { arg1: skin.name }), skin.moonstones, () => this.c.dispatch({ type: 'buySkin', skin: skin.id }).ok).then(redraw);
        });
      }
      const about = !owned && !skin.passOnly && !skin.calendarOnly ? this.jadeAbout(skin.moonstones) : null;
      grid.append(h('div', { class: 'shop-card' }, swatch, h('div', { class: 'shop-name' }, skin.name), h('div', { class: 'muted small' }, i18nText("ui.clan_keep_look_9be1099dbe")), action, about ? h('div', { class: 'muted small jade-about' }, about) : null));
    }
    return grid;
  }

  // ------------------------------------------------------------ offers

  showOffer(rule: OfferRule): void {
    const a = this.c.state.offers.active.find((x) => x.id === rule.id);
    const body = h(
      'div',
      { class: 'offer' },
      h('p', {}, rule.description),
      h('div', { class: 'row' }, rewardChips(this.offerContents(rule.productId, rule.contents))),
      this.convertedNote(rule.productId),
      a ? h('p', { class: 'muted small' }, i18nText("ui.available_for_you_can_also_find_it_in__a465fd9756", { arg1: formatDuration(a.expiresAt - this.c.now()), arg2: offerReturns(rule) ? i18nText("ui.and_it_comes_back_from_time_to_time_e8db8be5a2") : '' })) : null,
    );
    const close = this.kit.modal(rule.title, body, [
      { label: i18nText("ui.no_thanks_49780701dc"), onClick: () => close() },
      { label: i18nText("ui.see_offer_in_the_store_afae86c740"), primary: true, onClick: () => { close(); this.openStore('offers'); } },
    ]);
  }

  // ------------------------------------------------------------ pass

  openPass(): void {
    const body = h('div', { class: 'pass' });
    const draw = () => {
      clear(body);
      const s = this.c.state;
      const d = localizedData(this.c.data);
      const tier = unlockedTier(s, d);
      const into = s.pass.points - tier * d.pass.pointsPerTier;
      body.append(
        h('p', { class: 'muted' }, i18nText("ui.season_ends_in_complete_tasks_to_earn__300938261c", { arg1: formatDuration(passSeasonEndsAt(this.c.now(), d) - this.c.now()) })),
        h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${tier >= d.pass.tiers.length ? 100 : (into / d.pass.pointsPerTier) * 100}%` })), h('span', {}, i18nText("ui.tier_pts_805378a19e", { arg1: tier, arg2: d.pass.tiers.length, arg3: s.pass.points }))),
      );
      if (!s.pass.premium) {
        body.append(
          h(
            'div',
            { class: 'pass-premium' },
            h('div', {}, h('b', {}, i18nText("ui.premium_track_bd2c7a2ecb")), h('div', { class: 'muted small' }, i18nText("ui.20_faster_builds_this_season_the_look__36d2b98581", { arg1: this.passLookName(), pct: this.passSpeedPct() }))),
            h('button', { class: 'btn gold', type: 'button', onclick: () => this.openStore('pass') }, i18nText("ui.get_premium_e02b572c1d")),
          ),
        );
      } else {
        body.append(h('p', { class: 'chip good' }, i18nText("ui.premium_active_builds_are_20_faster_5eb0f4e244", { pct: this.passSpeedPct() })));
      }
      body.append(h('h3', {}, i18nText("ui.tasks_b3a60e61a5")));
      // The sim writes the target with English digit grouping; show it in the player's own (29.000, not 29,000).
      const taskText = (t: { id: string; kind: string; target: number; text: string }) => {
        const tpl = (t.kind === 'weekly' ? d.pass.weeklyChallenges : d.pass.dailyTasks).find((x) => x.id === t.id);
        return tpl ? tpl.text.replace('{n}', formatNumber(t.target)) : t.text;
      };
      for (const t of currentTasks(s, hallLevel(s, d), d)) {
        // Only a claim that can be made looks like a button (re-audit design item 9); the rest is a flat, locked tag.
        const ready = !t.claimed && t.progress >= t.target;
        const btn = ready
          ? h('button', { class: 'btn primary', type: 'button' }, `+${t.points}`)
          : h('span', { class: `claim-flat${t.claimed ? ' done' : ''}`, 'aria-label': t.claimed ? i18nText("ui.claimed_ddcd277929") : i18nText("ui.locked_points_when_done_724af3f655", { arg1: t.points }) }, t.claimed ? i18nText("ui.done_eed43c8f83") : icon(LOCK), t.claimed ? '' : `+${t.points}`);
        if (ready) btn.addEventListener('click', () => {
          const r = this.c.dispatch({ type: 'claimTask', id: t.id, kind: t.kind });
          if (!r.ok) this.kit.toast(ownedError(r.message, true), 'error');
          draw();
        });
        body.append(h('div', { class: 'log-row' }, h('div', { style: 'flex:1' }, h('b', {}, `${t.kind === 'weekly' ? i18nLabel('Weekly: ') : ''}${taskText(t)}`), h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(t.progress / t.target) * 100}%` })), h('span', { class: 'small' }, `${formatNumber(t.progress)}/${formatNumber(t.target)}`))), btn));
      }
      body.append(h('h3', {}, i18nText("ui.rewards_59afe47d9d")));
      const tiers = h('div', { class: 'tiers' });
      for (const tr of d.pass.tiers) {
        const cell = (track: 'free' | 'premium') => {
          const claimed = (track === 'free' ? s.pass.claimedFree : s.pass.claimedPremium).includes(tr.tier);
          const can = tr.tier <= tier && !claimed && (track === 'free' || s.pass.premium);
          // Rewards are sized for your Clan Keep, like chests and league rewards.
          const reward = passTierReward(s, tr.tier, track, d) ?? {};
          if (!can && !claimed) {
            // Not claimable: flat, with a lock and (on the next tier) how far along it is, never a greyed button.
            const why = tr.tier > tier ? i18nText("ui.tier_more_points_c5379e2fd6", { arg1: tr.tier, arg2: Math.max(0, tr.tier * d.pass.pointsPerTier - s.pass.points) }) : i18nText("ui.premium_track_bd2c7a2ecb");
            const bar = tr.tier === tier + 1 ? h('span', { class: 'tier-bar' }, h('i', { style: `width:${Math.max(0, Math.min(100, (into / d.pass.pointsPerTier) * 100))}%` })) : null;
            return h('div', { class: `tier-cell ${track} locked`, 'aria-label': i18nText("ui.locked_0bac7969d6", { arg1: why }) }, icon(LOCK, "icon tier-lock"), rewardChips(reward, this.skinName), bar);
          }
          const el = h('button', { class: `tier-cell ${track}${claimed ? ' claimed' : ''}${can ? ' ready' : ''}`, type: 'button', disabled: !can }, rewardChips(reward, this.skinName));
          el.addEventListener('click', async () => {
            // Each tier can be claimed once: warn before part of it is lost to full storage.
            const lost = rewardOverflow(this.c.state, reward, d);
            if (Object.keys(lost).length) {
              const text = i18nList(RESOURCE_KINDS.filter((k) => lost[k]).map((k) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(lost[k]!), arg2: RES_NAME[k] })));
              const ok = await this.kit.confirm(i18nText("ui.storage_is_too_full_05dd5a7f1f"), i18nText("ui.of_this_reward_will_not_fit_in_your_st_341f12c9a9", { arg1: text }), i18nText("ui.claim_anyway_1f952b93e9"), false, i18nText("ui.claim_later_43693ed440"));
              if (!ok) return;
            }
            const r = this.c.dispatch({ type: 'claimTier', tier: tr.tier, track });
            if (!r.ok) this.kit.toast(ownedError(r.message, true), 'error');
            else this.kit.toast(i18nText("ui.reward_claimed_0077aed282"), 'success');
            draw();
          });
          return el;
        };
        tiers.append(h('div', { class: `tier-row${tr.tier <= tier ? ' unlocked' : ''}` }, h('span', { class: 'tier-num' }, String(tr.tier)), cell('free'), cell('premium')));
      }
      body.append(h('div', { class: 'tier-head' }, h('span', {}, ''), h('span', {}, i18nText("ui.free_f411a1fb62")), h('span', {}, i18nText("ui.premium_de88c121a8"))), tiers);
    };
    draw();
    const unsub = this.c.subscribe(() => draw());
    this.kit.modal(localizedData(this.c.data).pass.name, body, [], 'wide', unsub);
  }

  // ------------------------------------------------------------ achievements

  openGoals(): void {
    const body = h('div', {});
    const draw = () => {
      clear(body);
      const s = this.c.state;
      for (const v of achievementViews(s, hallLevel(s, localizedData(this.c.data)), localizedData(this.c.data))) {
        const tierText = v.next ? v.def.text.replace('{n}', formatNumber(v.next.target)) : i18nText("ui.all_done_3117297085");
        const btn = v.next
          ? h('button', { class: 'btn gold', type: 'button', disabled: !v.claimable }, icon(icons.moonstones), String(v.next.reward))
          : h('span', { class: 'chip good' }, '★★★');
        btn.addEventListener('click', () => {
          const r = this.c.dispatch({ type: 'claimAchievement', id: v.def.id });
          if (r.ok) this.kit.toast(i18nText("ui.jade_collected_f70ae4ab50"), 'success');
          draw();
        });
        const pct = v.next ? Math.min(100, (v.value / v.next.target) * 100) : 100;
        body.append(
          h(
            'div',
            { class: 'log-row' },
            h('div', { style: 'flex:1' }, h('b', {}, `${v.def.name} `, h('span', { class: 'muted small' }, `${'★'.repeat(v.claimed)}${'☆'.repeat(v.def.tiers.length - v.claimed)}`)), h('div', { class: 'small' }, tierText), h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` }))),
            btn,
          ),
        );
      }
      body.append(h('p', { class: 'muted small' }, i18nText("ui.clear_forest_obstacles_around_your_vil_21266ecb90")));
    };
    draw();
    this.kit.modal(i18nText("ui.goals_116cd3982a"), body, [], 'wide');
  }

  /** Spend summary and age group, for Settings. */
  spendSection(): HTMLElement {
    const s = this.c.state;
    const band = bandFromProfile(s.profile);
    const age = band === 'under13' ? i18nText("ui.under_13_dd8ef95136") : band === '13to17' ? i18nText("ui.13_to_17_2201c02af4") : band === 'adult' ? i18nText("ui.18_or_older_8a1efb8ef9") : s.profile.under18 ? i18nText("ui.under_18_eaf7be3c12") : i18nText("ui.not_set_4895f73177");
    // GLOBAL-006 and the re-audit: the age group only ever gets stricter from here (the server keeps it too);
    // our support team can correct it after a check. The same neutral age screen as online play.
    const change = h('button', { class: 'btn ghost', type: 'button' }, band || s.profile.under18 ? i18nText("ui.correct_my_age_2cdb37f9f5") : i18nText("ui.set_age_group_1f3a409c91"));
    change.addEventListener('click', () => {
      void askAgeBand(this.kit, i18nText("ui.enter_your_year_of_birth_it_sets_the_p_a943fd1ba9")).then((b) => {
        if (!b) return;
        const r = this.c.dispatch({ type: 'setProfile', under18: b !== 'adult', ageBand: b });
        if (!r.ok) this.kit.toast(i18nText("ui.your_age_group_can_only_be_made_strict_c02ec1d59b"), 'info');
      });
    });
    return h(
      'div',
      {},
      h('h3', {}, i18nText("ui.spending_c2c7ae2ad9")),
      h('p', {}, i18nText("ui.this_month_all_time_f59d88ca1e", { arg1: usd(spentThisMonth(s, this.c.now())), arg2: usd(spentTotal(s)), arg3: t('spend.summary', { n: s.purchases.length }) })),
      h('p', { class: 'muted small' }, i18nText("ui.amounts_are_the_items_us_dollar_list_p_8a3498b500")),
      h('p', { class: 'muted small' }, i18nText("ui.age_group_68f7621465", { arg1: age, arg2: s.profile.under18 ? i18nText("ui.limit_a_month_in_list_prices_to_change_4f6bc4b210", { arg1: usd(localizedData(this.c.data).store.minorMonthlyCapUsd) }) : t('text.period') })),
      band === 'under13' ? null : h('div', { class: 'actions' }, change),
    );
  }
}
