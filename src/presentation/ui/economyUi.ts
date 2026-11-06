import type { GameController } from '../../gameplay/control/controller';
import { achievementViews } from '../../gameplay/sim/achievements';
import { activeOffers, offerReturns, offerRule, offersAllowed } from '../../gameplay/sim/offers';
import { bandFromProfile } from '../../gameplay/sim/age';
import { askAgeBand } from './ageScreen';
import type { AgeBand } from '../../gameplay/sim/age';
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

export interface UiKit {
  c: GameController;
  modal(title: string, body: HTMLElement, buttons?: ({ label: string; primary?: boolean; danger?: boolean; onClick: () => void } | null | false | undefined)[], size?: 'normal' | 'wide', onClose?: () => void): () => void;
  /** A plain message, or an element (the purchase confirm carries links). */
  confirm(title: string, message: string | HTMLElement, confirmLabel: string, danger?: boolean, cancelLabel?: string): Promise<boolean>;
  toast(text: string, kind?: 'info' | 'error' | 'success'): void;
  closeAllModals(): void;
  /** The age band from the store's signal, else the neutral screen (the HUD's `askAge`). */
  askAge?(why: string): Promise<AgeBand | null>;
  /** The Clan Keep wearing a look, as a data URL (only the Store's Looks use it). */
  skinThumb?(skin: string): string | null;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
/** The device's language is Japanese (the purchase confirm then links the Japanese notices). */
function japaneseDevice(): boolean {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return /^ja\b/i.test(langs[0] ?? '');
  } catch {
    return false;
  }
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

  private skinName = (id: string) => this.c.data.cosmetics.hallSkins.find((s) => s.id === id)?.name ?? id;
  /** The pass-only Keep look, by its data name (it was hard-coded as "Lantern Elder"; the data calls it Lantern Festival). */
  private passLookName = () => this.c.data.cosmetics.hallSkins.find((s) => s.passOnly)?.name ?? 'season';

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
    if (!pay.prices || !pay.available() || this.storePrices === 'loading' || this.pricesComplete || this.pricesAskedBy === redraw) return;
    this.pricesAskedBy = redraw;
    const d = this.c.data;
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
    const p = productInfo(this.c.data, productId);
    if (!p || !pay.available()) return { label: 'Not available', buyable: false };
    // The sandbox test store charges nothing: its numbers are the catalog's, marked as tests.
    if (!pay.prices) return pay.name === 'mock' ? { label: `${usd(p.usd)} (test)`, buyable: true } : { label: 'Not available', buyable: false };
    const sp = this.storePrices;
    if (sp === null || sp === 'loading') return { label: '…', buyable: false };
    if (sp === 'failed') return { label: 'Price unavailable', buyable: false };
    const found = sp[storeProductId(this.c.data, productId)];
    return found ? { label: found.formatted, buyable: true } : { label: 'Not sold here', buyable: false };
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
    const why = 'Before your first purchase, please enter your year of birth. It sets the right spending protections for your age.';
    const band = this.kit.askAge ? await this.kit.askAge(why) : await askAgeBand(this.kit, why);
    if (!band) return false;
    return this.c.dispatch({ type: 'setProfile', under18: band !== 'adult', ageBand: band }).ok;
  }

  /** Full purchase flow: age group, clear confirm step, provider, result. */
  async buy(productId: string): Promise<void> {
    if (!(await this.ensureAge())) return;
    const p = productInfo(this.c.data, productId);
    if (!p) return;
    const pr = this.price(productId);
    if (!pr.buyable) return;
    // Player-facing names, never internal resource ids (GLOBAL-007).
    // What buying it now really delivers (offers are sized for the Keep and storage-capped: productGrantsFor).
    const real = productGrantsFor(this.c.state, productId, this.c.data);
    const contents = Object.entries(real?.grants ?? p.grants).filter(([, v]) => v).map(([k, v]) => `${formatNumber(v as number)} ${RES_NAME[k as ResourceKind] ?? k}`).join(', ');
    const st = this.c.data.store.stipend;
    const what = p.kind === 'stipend' && st
      ? `${p.name}: ${st.payments} daily payments of ${st.jadePerPayment} Jade, claimed one a day when you open the game. It does not renew and nothing is charged again.`
      : p.kind === 'pass' ? `${p.name}: premium rewards and 20% faster builds until the season ends (${this.seasonEndsText()}).` : `${p.name}${contents ? `: ${contents}` : ''}.`;
    const note = this.c.payments.prices ? ' The store shows the final price, including any taxes, before you pay.' : '';
    // EU/UK digital content (re-audit design item 13): delivery starts at once, so the player acknowledges the loss of
    // the 14-day right to cancel before paying. Japanese devices also get the legally required notices.
    const message = h(
      'div',
      { class: 'purchase-confirm' },
      h('p', {}, `${what} Price: ${pr.label}.${note}`),
      h('p', { class: 'muted small withdrawal' }, 'The item is delivered at once; by buying you agree that you lose the right to cancel, as the law allows for digital content.'),
      japaneseDevice()
        ? h('p', { class: 'small legal-ja', lang: 'ja' }, this.legalLink('特定商取引法に基づく表記', './tokushoho.html'), ' · ', this.legalLink('資金決済法に基づく表示', './shikin-kessai.html'))
        : null,
    );
    const ok = await this.kit.confirm('Confirm purchase', message, `Buy for ${pr.label}`, false, 'Cancel');
    if (!ok) return;
    if (this.c.state.profile.under18) {
      const ok2 = await this.kit.confirm('Check with a grown-up', `You are about to spend ${pr.label} of real money. Make sure a parent or guardian says it's OK.`, 'Yes, buy it', false, 'Cancel');
      if (!ok2) return;
    }
    const r = await this.c.purchase(productId);
    if (r.ok && r.unsaved) this.kit.toast('Your purchase is here, but this device could not save it (storage full?). Free some space: it stays open in the store and is delivered again if needed.', 'error');
    else if (r.ok) this.kit.toast('Thank you! Your purchase has been delivered.', 'success');
    else this.kit.toast(r.message, r.code === 'PENDING' || r.code === 'pending' ? 'info' : 'error');
  }

  /** A shipped legal page: a new tab on the web, a frame inside the app (a system browser can't open a bundled page). */
  private legalLink(label: string, url: string): HTMLElement {
    if (Capacitor.isNativePlatform()) {
      return h('button', { class: 'link-btn', type: 'button', onclick: () => this.kit.modal(label, h('iframe', { class: 'legal-frame', src: url, title: label }), [], 'wide') }, label);
    }
    return h('a', { href: url, target: '_blank', rel: 'noopener' }, label);
  }

  /** Confirm a Moonstone spend, then run it. */
  async spendMoonstones(title: string, what: string, moonstones: number, run: () => boolean): Promise<void> {
    if (this.c.state.resources.moonstones < moonstones) {
      const go = await this.kit.confirm('Not enough Jade', `${what} costs ${moonstones} Jade and you have ${this.c.state.resources.moonstones}.`, 'Visit the store', false, 'Not now');
      if (go) this.openStore('moonstones');
      return;
    }
    const ok = await this.kit.confirm(title, `${what} for ${moonstones} Jade?`, `Spend ${moonstones}`, false, 'Cancel');
    if (ok && !run()) this.kit.toast('That did not work. Try again.', 'error');
  }

  // ------------------------------------------------------------ store

  /** The store is the only screen that shows real-money prices. */
  openStore(tab: 'moonstones' | 'offers' | 'pass' | 'looks' = 'moonstones'): void {
    const body = h('div', {});
    let current = tab;
    const draw = () => {
      clear(body);
      const tabs: [typeof current, string][] = [['moonstones', 'Jade'], ['offers', `Offers${activeOffers(this.c.state, this.c.now()).length ? ' •' : ''}`], ['pass', this.c.data.pass.name], ['looks', 'Looks']];
      body.append(
        h('div', { class: 'shop-tabs' }, ...tabs.map(([id, label]) => {
          const b = h('button', { type: 'button', class: id === current ? 'on' : '' }, label);
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
      if (this.c.payments.name === 'mock') body.append(h('p', { class: 'muted small store-note' }, 'Sandbox test store: purchases complete instantly, no real money is charged, and nothing leaves this practice village.'));
      else if (!this.c.payments.available()) body.append(h('p', { class: 'muted small store-note' }, 'Purchases are not available in this version of the game. Jade can also be earned by playing; the premium Season Scroll and its looks are only sold.'));
      else if (this.storePrices === 'failed') body.append(h('p', { class: 'muted small store-note' }, 'The store could not be reached for prices. Check your connection and open the Store again.'));
      if (this.c.payments.store && this.c.payments.available()) {
        // App Store rule: a way to get back what was bought (this season's Scroll, purchases paid but not delivered).
        const restore = h('button', { class: 'btn ghost', type: 'button' }, 'Restore purchases') as HTMLButtonElement;
        restore.addEventListener('click', () => {
          restore.disabled = true;
          void this.c.restorePurchases().then(
            (r) => {
              restore.disabled = false;
              const n = r.delivered + r.restored;
              this.kit.toast(n ? `Restored ${n} purchase${n === 1 ? '' : 's'}.` : 'Nothing to restore: everything you bought is already here.', n ? 'success' : 'info');
              draw();
            },
            (e: Error) => {
              restore.disabled = false;
              this.kit.toast(e.message, 'error');
            },
          );
        });
        body.append(h('div', { class: 'actions store-note' }, restore));
      }
    };
    draw();
    this.kit.modal('Store', body, [], 'wide');
  }

  private packsGrid(): HTMLElement {
    const grid = h('div', { class: 'shop-grid' });
    const packs = this.c.data.store.packs;
    const base = packs[0].moonstones / packs[0].usd;
    packs.forEach((p, i) => {
      const bonus = Math.round(((p.moonstones / p.usd) / base - 1) * 100);
      const card = h(
        'div',
        { class: 'shop-card pack' },
        h('div', { class: 'pack-gems' }, ...Array.from({ length: Math.min(6, i + 1) }, () => icon(icons.moonstones))),
        h('div', { class: 'shop-name' }, p.name),
        h('div', { class: 'pack-amount' }, icon(icons.moonstones), formatNumber(p.moonstones)),
        bonus > 0 ? h('div', { class: 'chip good' }, `+${bonus}% value`) : null,
        this.buyButton(p.id, 'primary'),
      );
      grid.append(card);
    });
    // Clan Stipend: a one-time purchase paid out daily, never a subscription.
    const st = this.c.data.store.stipend;
    const ss = stipendStatus(this.c.state, this.c.now(), this.c.data);
    if (st && ss.offered) {
      grid.append(
        h(
          'div',
          { class: 'shop-card pack stipend' },
          h('div', { class: 'pack-gems' }, icon(icons.moonstones), h('span', { class: 'stipend-x' }, `× ${st.payments}`)),
          h('div', { class: 'shop-name' }, st.name),
          h('div', { class: 'small' }, `${st.payments} daily payments of ${st.jadePerPayment} Jade; does not renew.`),
          ss.left > 0 ? h('div', { class: 'chip good' }, `${ss.left} payment${ss.left === 1 ? '' : 's'} left`) : null,
          ss.canBuy ? this.buyButton(st.id, 'primary') : h('span', { class: 'claim-flat' }, 'Buy again when all are claimed'),
        ),
      );
    }
    return grid;
  }

  /** "Clan Stipend: claim 20 Jade (12 left)" while a payment is waiting today (no reminders: it waits for the player). */
  stipendCard(after?: () => void): HTMLElement | null {
    const ss = stipendStatus(this.c.state, this.c.now(), this.c.data);
    if (!ss.claimable) return null;
    const btn = h('button', { class: 'btn gold', type: 'button' }, icon(icons.moonstones), `Claim ${ss.jade}`);
    btn.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'claimStipend' });
      if (!r.ok) this.kit.toast(r.message, 'error');
      else this.kit.toast(`+${ss.jade} Jade from your Clan Stipend.`, 'success');
      after?.();
    });
    return h('div', { class: 'log-row stipend-card' }, h('div', {}, h('b', {}, `Clan Stipend: claim ${ss.jade} Jade`), h('div', { class: 'muted small' }, `${ss.left} payment${ss.left === 1 ? '' : 's'} left, one a day. A missed day is never lost.`)), btn);
  }

  private offersList(): HTMLElement {
    const wrap = h('div', {});
    const list = activeOffers(this.c.state, this.c.now());
    // Economy E02: say why the tab stays empty, instead of a "right now" that never changes.
    const p = this.c.state.profile;
    const why = offersAllowed(this.c.state)
      ? 'No special offers right now.'
      : p.under18 === null
        ? 'Special offers appear only once you have told us your age (Settings → Account → Spending → Set age group).'
        : 'Special offers do not pop up for players under 18. Everything in the Jade tab stays available within your spending limit.';
    if (!list.length) wrap.append(h('p', { class: 'muted' }, why));
    for (const a of list) {
      const rule = offerRule(this.c.data, a.id);
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
    return productGrantsFor(this.c.state, productId, this.c.data)?.grants ?? fallback;
  }

  /** "12,000 Coins don't fit: +40 Jade instead" (bought resources never sit above storage). */
  private convertedNote(productId: string): HTMLElement | null {
    const g = productGrantsFor(this.c.state, productId, this.c.data);
    if (!g || g.convertedJade <= 0) return null;
    const what = RESOURCE_KINDS.filter((k) => g.converted[k]).map((k) => `${formatNumber(g.converted[k]!)} ${RES_NAME[k]}`).join(' and ');
    return h('div', { class: 'muted small' }, `${what} ${what.includes(' and ') ? "don't" : "doesn't"} fit in your storage: +${formatNumber(g.convertedJade)} Jade instead (included above).`);
  }

  /** "Season ends in 12 days" (re-audit: the pass card and its confirm say when the season ends). */
  private seasonEndsText(): string {
    const left = passSeasonEndsAt(this.c.now(), this.c.data) - this.c.now();
    const days = Math.floor(left / 86_400_000);
    return days >= 1 ? `the season ends in ${days} day${days === 1 ? '' : 's'}` : `the season ends in ${formatDuration(left)}`;
  }

  /**
   * How long an offer is shown (re-audit, EU CPC: no false last chance). An
   * offer with a cooldown comes back later, and says so; a one-time offer
   * just says how long it is here.
   */
  private offerTimeText(rule: OfferRule, expiresAt: number): string {
    const left = formatDuration(Math.max(0, expiresAt - this.c.now()));
    return offerReturns(rule) ? `Here for ${left} · back again later` : `Here for ${left}`;
  }

  private passProduct(redraw: () => void): HTMLElement {
    const d = this.c.data;
    if (this.c.state.pass.premium) return h('p', { class: 'chip good' }, 'You have the premium Season Scroll this season.');
    const ends = this.seasonEndsText();
    const now = this.c.now();
    // An honest value line (passPremiumValue): only tiers still reachable this season count.
    const v = passPremiumValue(this.c.state, now, d);
    const sale = passSaleOpen(now, d, this.c.state);
    const check = canPurchase(this.c.state, d.pass.productId, now, d);
    const closed = !sale.open && !check.ok && check.code === 'SEASON_ENDING';
    const value = h('div', { class: 'small pass-value' }, `≈ ${formatNumber(v.total)} Jade value · ${v.tiers}/${v.tiersTotal} tiers reachable · ${v.daysLeft} day${v.daysLeft === 1 ? '' : 's'} left`);
    const buy = closed ? h('span', { class: 'claim-flat' }, 'Not on sale') : this.buyButton(d.pass.productId, 'gold', redraw);
    return h(
      'div',
      { class: 'pass-premium' },
      h('div', {}, h('b', {}, `${d.pass.name}: premium track`), h('div', { class: 'muted small' }, `Until the season ends: 20% faster builds, the ${this.passLookName()} look and bigger rewards on every tier. Rewards you already earned unlock right away.`), h('div', { class: 'chip' }, icon(icons.clock), `${ends.charAt(0).toUpperCase()}${ends.slice(1)}`), value, closed && !check.ok ? h('p', { class: 'note' }, check.message) : null),
      buy,
    );
  }

  private looksGrid(redraw: () => void): HTMLElement {
    const grid = h('div', { class: 'shop-grid' });
    const s = this.c.state;
    for (const skin of this.c.data.cosmetics.hallSkins) {
      const owned = s.cosmetics.owned.includes(skin.id);
      const equipped = s.cosmetics.hallSkin === skin.id;
      // Report section 5 step 3/4 (art F2): the real Keep in this look, not the old game's mushroom cap.
      // Until the art is ready, a roof-shaped swatch in the look's roof and trim colours.
      const thumb = this.kit.skinThumb?.(skin.id) ?? null;
      const swatch = thumb
        ? h('img', { class: 'skin-thumb', src: thumb, alt: `Clan Keep in the ${skin.name} look` })
        : h('div', { class: 'skin-swatch', role: 'img', 'aria-label': `${skin.name} roof colours`, style: `--roof:${skin.cap};--trim:${skin.spots}` });
      let action: HTMLElement;
      if (equipped) action = h('span', { class: 'chip good' }, 'In use');
      else if (owned) {
        action = h('button', { class: 'btn sky', type: 'button' }, 'Use');
        action.addEventListener('click', () => {
          this.c.dispatch({ type: 'equipSkin', skin: skin.id });
          redraw();
        });
      } else if (skin.passOnly) action = h('span', { class: 'chip' }, `${this.c.data.pass.name} reward`);
      else if (skin.minKeep && hallLevel(s, this.c.data) < skin.minKeep) action = h('span', { class: 'chip' }, `Unlocks at Keep ${skin.minKeep}`);
      else {
        action = h('button', { class: 'btn gold', type: 'button' }, icon(icons.moonstones), String(skin.moonstones));
        action.addEventListener('click', () => {
          void this.spendMoonstones('Buy this look', `${skin.name} (purely visual)`, skin.moonstones, () => this.c.dispatch({ type: 'buySkin', skin: skin.id }).ok).then(redraw);
        });
      }
      grid.append(h('div', { class: 'shop-card' }, swatch, h('div', { class: 'shop-name' }, skin.name), h('div', { class: 'muted small' }, 'Clan Keep look'), action));
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
      a ? h('p', { class: 'muted small' }, `Available for ${formatDuration(a.expiresAt - this.c.now())}${offerReturns(rule) ? ', and it comes back from time to time' : ''}. You can also find it in the Store.`) : null,
    );
    const close = this.kit.modal(rule.title, body, [
      { label: 'No thanks', onClick: () => close() },
      { label: 'See offer in the store', primary: true, onClick: () => { close(); this.openStore('offers'); } },
    ]);
  }

  // ------------------------------------------------------------ pass

  openPass(): void {
    const body = h('div', { class: 'pass' });
    const draw = () => {
      clear(body);
      const s = this.c.state;
      const d = this.c.data;
      const tier = unlockedTier(s, d);
      const into = s.pass.points - tier * d.pass.pointsPerTier;
      body.append(
        h('p', { class: 'muted' }, `Season ends in ${formatDuration(passSeasonEndsAt(this.c.now(), d) - this.c.now())}. Complete tasks to earn points and unlock tiers.`),
        h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${tier >= d.pass.tiers.length ? 100 : (into / d.pass.pointsPerTier) * 100}%` })), h('span', {}, `Tier ${tier}/${d.pass.tiers.length} · ${s.pass.points} pts`)),
      );
      if (!s.pass.premium) {
        body.append(
          h(
            'div',
            { class: 'pass-premium' },
            h('div', {}, h('b', {}, 'Premium track'), h('div', { class: 'muted small' }, `20% faster builds this season, the ${this.passLookName()} look, and bigger rewards on every tier.`)),
            h('button', { class: 'btn gold', type: 'button', onclick: () => this.openStore('pass') }, 'Get premium'),
          ),
        );
      } else {
        body.append(h('p', { class: 'chip good' }, 'Premium active: builds are 20% faster'));
      }
      body.append(h('h3', {}, 'Tasks'));
      for (const t of currentTasks(s, hallLevel(s, d), d)) {
        // Only a claim that can be made looks like a button (re-audit design item 9); the rest is a flat, locked tag.
        const ready = !t.claimed && t.progress >= t.target;
        const btn = ready
          ? h('button', { class: 'btn primary', type: 'button' }, `+${t.points}`)
          : h('span', { class: `claim-flat${t.claimed ? ' done' : ''}`, 'aria-label': t.claimed ? 'Claimed' : `Locked: ${t.points} points when done` }, t.claimed ? '✓ Done' : icon(LOCK), t.claimed ? '' : `+${t.points}`);
        if (ready) btn.addEventListener('click', () => {
          const r = this.c.dispatch({ type: 'claimTask', id: t.id, kind: t.kind });
          if (!r.ok) this.kit.toast(r.message, 'error');
          draw();
        });
        body.append(h('div', { class: 'log-row' }, h('div', { style: 'flex:1' }, h('b', {}, `${t.kind === 'weekly' ? 'Weekly: ' : ''}${t.text}`), h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(t.progress / t.target) * 100}%` })), h('span', { class: 'small' }, `${formatNumber(t.progress)}/${formatNumber(t.target)}`))), btn));
      }
      body.append(h('h3', {}, 'Rewards'));
      const tiers = h('div', { class: 'tiers' });
      for (const tr of d.pass.tiers) {
        const cell = (track: 'free' | 'premium') => {
          const claimed = (track === 'free' ? s.pass.claimedFree : s.pass.claimedPremium).includes(tr.tier);
          const can = tr.tier <= tier && !claimed && (track === 'free' || s.pass.premium);
          // Rewards are sized for your Clan Keep, like chests and league rewards.
          const reward = passTierReward(s, tr.tier, track, d) ?? {};
          if (!can && !claimed) {
            // Not claimable: flat, with a lock and (on the next tier) how far along it is, never a greyed button.
            const why = tr.tier > tier ? `Tier ${tr.tier}: ${Math.max(0, tr.tier * d.pass.pointsPerTier - s.pass.points)} more points` : 'Premium track';
            const bar = tr.tier === tier + 1 ? h('span', { class: 'tier-bar' }, h('i', { style: `width:${Math.max(0, Math.min(100, (into / d.pass.pointsPerTier) * 100))}%` })) : null;
            return h('div', { class: `tier-cell ${track} locked`, 'aria-label': `${why} (locked)` }, icon(LOCK, 'icon tier-lock'), rewardChips(reward, this.skinName), bar);
          }
          const el = h('button', { class: `tier-cell ${track}${claimed ? ' claimed' : ''}${can ? ' ready' : ''}`, type: 'button', disabled: !can }, rewardChips(reward, this.skinName));
          el.addEventListener('click', async () => {
            // Each tier can be claimed once: warn before part of it is lost to full storage.
            const lost = rewardOverflow(this.c.state, reward, d);
            if (Object.keys(lost).length) {
              const text = RESOURCE_KINDS.filter((k) => lost[k]).map((k) => `${formatNumber(lost[k]!)} ${RES_NAME[k]}`).join(', ');
              const ok = await this.kit.confirm('Storage is too full', `${text} of this reward will not fit in your storage and will be lost. Claim it later, after spending some?`, 'Claim anyway', false, 'Claim later');
              if (!ok) return;
            }
            const r = this.c.dispatch({ type: 'claimTier', tier: tr.tier, track });
            if (!r.ok) this.kit.toast(r.message, 'error');
            else this.kit.toast('Reward claimed!', 'success');
            draw();
          });
          return el;
        };
        tiers.append(h('div', { class: `tier-row${tr.tier <= tier ? ' unlocked' : ''}` }, h('span', { class: 'tier-num' }, String(tr.tier)), cell('free'), cell('premium')));
      }
      body.append(h('div', { class: 'tier-head' }, h('span', {}, ''), h('span', {}, 'Free'), h('span', {}, 'Premium')), tiers);
    };
    draw();
    const unsub = this.c.subscribe(() => draw());
    this.kit.modal(this.c.data.pass.name, body, [], 'wide', unsub);
  }

  // ------------------------------------------------------------ achievements

  openGoals(): void {
    const body = h('div', {});
    const draw = () => {
      clear(body);
      const s = this.c.state;
      for (const v of achievementViews(s, hallLevel(s, this.c.data), this.c.data)) {
        const tierText = v.next ? v.def.text.replace('{n}', formatNumber(v.next.target)) : 'All done!';
        const btn = v.next
          ? h('button', { class: 'btn gold', type: 'button', disabled: !v.claimable }, icon(icons.moonstones), String(v.next.reward))
          : h('span', { class: 'chip good' }, '★★★');
        btn.addEventListener('click', () => {
          const r = this.c.dispatch({ type: 'claimAchievement', id: v.def.id });
          if (r.ok) this.kit.toast('Jade collected!', 'success');
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
      body.append(h('p', { class: 'muted small' }, 'Clear forest obstacles around your village for more free Jade.'));
    };
    draw();
    this.kit.modal('Goals', body, [], 'wide');
  }

  /** Spend summary and age group, for Settings. */
  spendSection(): HTMLElement {
    const s = this.c.state;
    const band = bandFromProfile(s.profile);
    const age = band === 'under13' ? 'Under 13' : band === '13to17' ? '13 to 17' : band === 'adult' ? '18 or older' : s.profile.under18 ? 'Under 18' : 'Not set';
    // GLOBAL-006 and the re-audit: the age group only ever gets stricter from here (the server keeps it too);
    // our support team can correct it after a check. The same neutral age screen as online play.
    const change = h('button', { class: 'btn ghost', type: 'button' }, band || s.profile.under18 ? 'Correct my age' : 'Set age group');
    change.addEventListener('click', () => {
      void askAgeBand(this.kit, 'Enter your year of birth. It sets the protections for your age group (spending limits, and for online play who can find you and how you chat).').then((b) => {
        if (!b) return;
        const r = this.c.dispatch({ type: 'setProfile', under18: b !== 'adult', ageBand: b });
        if (!r.ok) this.kit.toast('Your age group can only be made stricter here. To correct it, contact support from Settings → Privacy and help.', 'info');
      });
    });
    return h(
      'div',
      {},
      h('h3', {}, 'Spending'),
      h('p', {}, `This month: ${usd(spentThisMonth(s, this.c.now()))} · All time: ${usd(spentTotal(s))} · ${s.purchases.length} purchase${s.purchases.length === 1 ? '' : 's'}`),
      h('p', { class: 'muted small' }, 'Amounts are the items\' US-dollar list prices; your store receipts show what you actually paid in your currency.'),
      h('p', { class: 'muted small' }, `Age group: ${age}${s.profile.under18 ? ` (limit ${usd(this.c.data.store.minorMonthlyCapUsd)} a month in list prices). To change it, contact support from Settings.` : '.'}`),
      band === 'under13' ? null : h('div', { class: 'actions' }, change),
    );
  }
}
