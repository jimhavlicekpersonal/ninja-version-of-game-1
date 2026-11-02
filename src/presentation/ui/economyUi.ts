import type { GameController } from '../../gameplay/control/controller';
import { achievementViews } from '../../gameplay/sim/achievements';
import { activeOffers, offerRule } from '../../gameplay/sim/offers';
import { productInfo, spentThisMonth, spentTotal } from '../../gameplay/sim/monetization';
import { currentTasks, passSeasonEndsAt, unlockedTier } from '../../gameplay/sim/pass';
import type { Cost, OfferRule, ResourceKind } from '../../gameplay/sim/types';
import { RESOURCE_KINDS } from '../../gameplay/sim/types';
import { hallLevel } from '../../gameplay/sim/village';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';

export interface UiKit {
  c: GameController;
  modal(title: string, body: HTMLElement, buttons?: ({ label: string; primary?: boolean; danger?: boolean; onClick: () => void } | null | false | undefined)[], size?: 'normal' | 'wide', onClose?: () => void): () => void;
  confirm(title: string, message: string, confirmLabel: string, danger?: boolean, cancelLabel?: string): Promise<boolean>;
  toast(text: string, kind?: 'info' | 'error' | 'success'): void;
  closeAllModals(): void;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

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

  /** Ask once whether the player is under 18 (sets the spending cap). */
  private async ensureAge(): Promise<boolean> {
    if (this.c.state.profile.under18 !== null) return true;
    return new Promise((resolve) => {
      let answered = false;
      const choose = (under18: boolean) => {
        answered = true;
        this.c.dispatch({ type: 'setProfile', under18 });
        close();
        resolve(true);
      };
      const close = this.kit.modal(
        'Before you buy',
        h(
          'div',
          {},
          h('p', {}, 'Please tell us your age group.'),
          h('p', { class: 'muted small' }, `Players under 18 have a monthly spending limit of ${usd(this.c.data.store.minorMonthlyCapUsd)} and an extra confirmation step. You can change this in Settings.`),
        ),
        [
          { label: "I'm under 18", onClick: () => choose(true) },
          { label: "I'm 18 or older", primary: true, onClick: () => choose(false) },
        ],
        'normal',
        () => {
          if (!answered) resolve(false);
        },
      );
    });
  }

  /** Full purchase flow: age group, clear confirm step, provider, result. */
  async buy(productId: string): Promise<void> {
    if (!(await this.ensureAge())) return;
    const p = productInfo(this.c.data, productId);
    if (!p) return;
    const contents = Object.entries(p.grants).filter(([, v]) => v).map(([k, v]) => `${formatNumber(v as number)} ${k}`).join(', ');
    const what = p.kind === 'pass' ? `${p.name}: premium rewards and 20% faster builds until the season ends.` : `${p.name}${contents ? `: ${contents}` : ''}.`;
    const ok = await this.kit.confirm('Confirm purchase', `${what} Price: ${usd(p.usd)}.`, `Buy for ${usd(p.usd)}`, false, 'Cancel');
    if (!ok) return;
    if (this.c.state.profile.under18) {
      const ok2 = await this.kit.confirm('Check with a grown-up', `You are about to spend ${usd(p.usd)} of real money. Make sure a parent or guardian says it's OK.`, 'Yes, buy it', false, 'Cancel');
      if (!ok2) return;
    }
    const r = await this.c.purchase(productId);
    if (r.ok) this.kit.toast('Thank you! Your purchase has been delivered.', 'success');
    else this.kit.toast(r.message, 'error');
  }

  /** Confirm a Moonstone spend, then run it. */
  async spendMoonstones(title: string, what: string, moonstones: number, run: () => boolean): Promise<void> {
    if (this.c.state.resources.moonstones < moonstones) {
      const go = await this.kit.confirm('Not enough Moonstones', `${what} costs ${moonstones} Moonstones and you have ${this.c.state.resources.moonstones}.`, 'Visit the store', false, 'Not now');
      if (go) this.openStore('moonstones');
      return;
    }
    const ok = await this.kit.confirm(title, `${what} for ${moonstones} Moonstones?`, `Spend ${moonstones}`, false, 'Cancel');
    if (ok && !run()) this.kit.toast('That did not work. Try again.', 'error');
  }

  // ------------------------------------------------------------ store

  /** The store is the only screen that shows real-money prices. */
  openStore(tab: 'moonstones' | 'offers' | 'pass' | 'looks' = 'moonstones'): void {
    const body = h('div', {});
    let current = tab;
    const draw = () => {
      clear(body);
      const tabs: [typeof current, string][] = [['moonstones', 'Moonstones'], ['offers', `Offers${activeOffers(this.c.state, this.c.now()).length ? ' •' : ''}`], ['pass', this.c.data.pass.name], ['looks', 'Looks']];
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
      if (current === 'moonstones') body.append(this.packsGrid());
      else if (current === 'offers') body.append(this.offersList());
      else if (current === 'pass') body.append(this.passProduct(draw));
      else body.append(this.looksGrid(draw));
      if (this.c.payments.name === 'mock') body.append(h('p', { class: 'muted small store-note' }, 'Test store: purchases complete instantly and no real money is charged.'));
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
        h('button', { class: 'btn primary', type: 'button', onclick: () => void this.buy(p.id) }, usd(p.usd)),
      );
      grid.append(card);
    });
    return grid;
  }

  private offersList(): HTMLElement {
    const wrap = h('div', {});
    const list = activeOffers(this.c.state, this.c.now());
    if (!list.length) wrap.append(h('p', { class: 'muted' }, 'No special offers right now.'));
    for (const a of list) {
      const rule = offerRule(this.c.data, a.id);
      if (!rule) continue;
      wrap.append(
        h(
          'div',
          { class: 'log-row' },
          h('div', {}, h('b', {}, rule.title), h('div', { class: 'muted small' }, rule.description), h('div', { class: 'row' }, rewardChips(rule.contents), h('span', { class: 'chip' }, icon(icons.clock), `Ends in ${formatDuration(a.expiresAt - this.c.now())}`))),
          h('button', { class: 'btn primary', type: 'button', onclick: () => void this.buy(rule.productId) }, usd(rule.usd)),
        ),
      );
    }
    return wrap;
  }

  private passProduct(redraw: () => void): HTMLElement {
    const d = this.c.data;
    if (this.c.state.pass.premium) return h('p', { class: 'chip good' }, 'You have the premium Lantern Pass this season.');
    return h(
      'div',
      { class: 'pass-premium' },
      h('div', {}, h('b', {}, `${d.pass.name}: premium track`), h('div', { class: 'muted small' }, 'Until the season ends: 20% faster builds, the Lantern Elder look and bigger rewards on every tier. Rewards you already earned unlock right away.')),
      h('button', { class: 'btn gold', type: 'button', onclick: () => void this.buy(d.pass.productId).then(redraw) }, usd(d.pass.usd)),
    );
  }

  private looksGrid(redraw: () => void): HTMLElement {
    const grid = h('div', { class: 'shop-grid' });
    const s = this.c.state;
    for (const skin of this.c.data.cosmetics.hallSkins) {
      const owned = s.cosmetics.owned.includes(skin.id);
      const equipped = s.cosmetics.hallSkin === skin.id;
      const swatch = h('div', { class: 'skin-swatch', style: `background: radial-gradient(circle at 35% 30%, #fff8, transparent 40%), ${skin.cap}` });
      for (let i = 0; i < 4; i++) swatch.append(h('i', { style: `background:${skin.spots}` }));
      let action: HTMLElement;
      if (equipped) action = h('span', { class: 'chip good' }, 'In use');
      else if (owned) {
        action = h('button', { class: 'btn sky', type: 'button' }, 'Use');
        action.addEventListener('click', () => {
          this.c.dispatch({ type: 'equipSkin', skin: skin.id });
          redraw();
        });
      } else if (skin.passOnly) action = h('span', { class: 'chip' }, `${this.c.data.pass.name} reward`);
      else {
        action = h('button', { class: 'btn gold', type: 'button' }, icon(icons.moonstones), String(skin.moonstones));
        action.addEventListener('click', () => {
          void this.spendMoonstones('Buy this look', `${skin.name} (purely visual)`, skin.moonstones, () => this.c.dispatch({ type: 'buySkin', skin: skin.id }).ok).then(redraw);
        });
      }
      grid.append(h('div', { class: 'shop-card' }, swatch, h('div', { class: 'shop-name' }, skin.name), h('div', { class: 'muted small' }, 'Elder Toadstool look'), action));
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
      h('div', { class: 'row' }, rewardChips(rule.contents)),
      a ? h('p', { class: 'muted small' }, `Available for ${formatDuration(a.expiresAt - this.c.now())}. You can also find it in the Store.`) : null,
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
            h('div', {}, h('b', {}, 'Premium track'), h('div', { class: 'muted small' }, '20% faster builds this season, the Lantern Elder look, and bigger rewards on every tier.')),
            h('button', { class: 'btn gold', type: 'button', onclick: () => this.openStore('pass') }, 'Get premium'),
          ),
        );
      } else {
        body.append(h('p', { class: 'chip good' }, 'Premium active: builds are 20% faster'));
      }
      body.append(h('h3', {}, 'Tasks'));
      for (const t of currentTasks(s, hallLevel(s, d), d)) {
        const btn = h('button', { class: 'btn primary', type: 'button', disabled: t.claimed || t.progress < t.target }, t.claimed ? 'Done' : `+${t.points}`);
        btn.addEventListener('click', () => {
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
          const el = h('button', { class: `tier-cell ${track}${claimed ? ' claimed' : ''}${can ? ' ready' : ''}`, type: 'button', disabled: !can }, rewardChips(track === 'free' ? tr.free : tr.premium, this.skinName));
          el.addEventListener('click', () => {
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
          if (r.ok) this.kit.toast('Moonstones collected!', 'success');
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
      body.append(h('p', { class: 'muted small' }, 'Clear forest obstacles around your village for more free Moonstones.'));
    };
    draw();
    this.kit.modal('Goals', body, [], 'wide');
  }

  /** Spend summary and age group, for Settings. */
  spendSection(): HTMLElement {
    const s = this.c.state;
    const age = s.profile.under18 === null ? 'Not set' : s.profile.under18 ? 'Under 18' : '18 or older';
    const change = h('button', { class: 'btn ghost', type: 'button' }, 'Change age group');
    change.addEventListener('click', () => {
      const close = this.kit.modal('Age group', h('p', {}, 'Players under 18 have a monthly spending limit and an extra purchase confirmation.'), [
        { label: "I'm under 18", onClick: () => { this.c.dispatch({ type: 'setProfile', under18: true }); close(); } },
        { label: "I'm 18 or older", primary: true, onClick: () => { this.c.dispatch({ type: 'setProfile', under18: false }); close(); } },
      ]);
    });
    return h(
      'div',
      {},
      h('h3', {}, 'Spending'),
      h('p', {}, `This month: ${usd(spentThisMonth(s, this.c.now()))} · All time: ${usd(spentTotal(s))} · ${s.purchases.length} purchase${s.purchases.length === 1 ? '' : 's'}`),
      h('p', { class: 'muted small' }, `Age group: ${age}${s.profile.under18 ? ` (limit ${usd(this.c.data.store.minorMonthlyCapUsd)} a month)` : ''}.`),
      h('div', { class: 'actions' }, change),
    );
  }
}
