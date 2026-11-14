import { displayData as localizedData, messageText as ownedText, generatedName } from './i18n';
import { messageText as i18nMessage, listText as i18nList } from './i18n';
import { labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
import { fmtDecimal, fmtPercent, pointLabel, t } from './i18n';
import { armyDiversity, diversityShare, stakeOptions } from '../../gameplay/sim/carry';
import { rivalById } from '../../gameplay/sim/rivals';
import { isolateName } from '../../gameplay/sim/social/names';
import type { BattleSession } from '../../gameplay/control/battleSession';
import type { BattleHooks, BattleView, ScreenInsets } from '../render/BattleScene';
import { totalLoot } from '../../gameplay/sim/battle/basegen';
import { isAbility } from '../../gameplay/sim/battle/battle';
import { pointIntel, scoutReport } from '../../gameplay/sim/battle/scout';
import { closeCalls } from '../../gameplay/sim/battle/closecall';
import { lossTrophies, winTrophies } from '../../gameplay/sim/ranks';
import type { BattleResult } from '../../gameplay/sim/battle/types';
import type { Cost, ResourceKind } from '../../gameplay/sim/types';
import { RESOURCE_KINDS } from '../../gameplay/sim/types';
import { clear, h, icon } from './dom';
import { formatNumber } from './format';
import { icons } from './icons';
import { sound } from '../audio/sound';
import { celebrate, countUp, reducedMotion, removeWithExit, uiArt } from './feedback';
import { layoutChevrons } from './chevronLayout';
import { cardBadge } from './cardArt';
import { noteBattleResult } from './reviewPrompt';

interface BattleHudDeps {
  root: HTMLElement;
  session: BattleSession;
  myTrophies: number;
  /** Set when watching a replay. */
  replayOf?: { kind: 'attack' | 'defense'; opponentName: string };
  /** Set for Grove Raid attacks (no loot, no Next). */
  /** Alliance War, or a Gang War strike (`title`, step 67). */
  grove?: { enemyName: string; title?: string };
  /** A practice battle (nothing spent or won, no Next). */
  practice?: boolean;
  /** A bounty fortress or a settle-the-score rematch: its label; no loot, honor or Next. */
  special?: { title: string };
  /** The player's first raid (tutorial not finished): one coach line at a time (re-audit design item 3). */
  coach?: boolean;
  /** Set for Shadow Trials (practice ladder: no loot from buildings, no honor, no Next). */
  trial?: { tier: number; layout: string; modifiers: string[]; reward: Cost; firstClear: boolean; starsToClear: number };
  troopThumb(type: string): string | null;
  scoutFee: number;
  canPayFee(): boolean;
  onHome(): void;
  onNext(): void;
  /** Resolves false when the battle could not start (an online raid needs the server's go and seed). */
  onAttack(): boolean | Promise<boolean>;
  /** Called once when a live battle ends; returns the loot actually banked. */
  /** `banked` is what reached storage (bonuses included); `overflow` is what was won but did not fit. */
  onFinished(): { result: BattleResult; banked: Cost; trophies: number; bonus?: Cost; eventBonus?: Cost; overflow?: Cost; note?: string; pending?: boolean; stake?: number } | null;
  /** A raid that may declare a stake (sim/carry.ts): offline, or on a server with the `stakes` feature. */
  stakes?: boolean;
  onReplay(): void;
}

function lootChips(loot: Cost): HTMLElement {
  const wrap = h('span', { class: 'cost' });
  for (const k of RESOURCE_KINDS) {
    if (!loot[k]) continue;
    wrap.append(h('span', { class: 'chip' }, icon(icons[k as 'acorns' | 'dew'] ?? ''), formatNumber(loot[k]!)));
  }
  if (!wrap.childElementCount) wrap.append(h('span', { class: 'chip' }, i18nText("ui.none_dc937b5989")));
  return wrap;
}

/** Loot chips whose numbers count up from 0 to what was really banked (the final number is always the real one). */
function countingChips(loot: Cost, delay: number): HTMLElement {
  const wrap = lootChips(loot);
  const kinds = RESOURCE_KINDS.filter((k) => loot[k]);
  wrap.querySelectorAll<HTMLElement>('.chip').forEach((chip, i) => {
    const k = kinds[i];
    if (!k) return;
    const num = h('span', { class: 'count-num' });
    // The chip is "<icon>1,234": swap the text node for a counter.
    for (const n of [...chip.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove();
    chip.append(num);
    countUp(num, loot[k]!, formatNumber, 900, delay);
  });
  return wrap;
}

export class BattleHud {
  selected: string | null = null;
  private readonly s: BattleSession;
  private timerEl = h('div', { class: 'b-timer' });
  private pctEl = h('div', { class: 'b-pct' });
  private starsEl = h('div', { class: 'b-stars' });
  private lootEl = h('div', { class: 'b-loot' });
  private troopsEl = h('div', { class: 'b-troops' });
  private bottomEl = h('div', { class: 'b-bottom' });
  private toastEl = h('div', { class: 'toasts' });
  private modalEl = h('div', { class: 'modal-root' });
  private interval = 0;
  private finished = false;
  private lastStars = -1;
  private lootSig = '';
  /** The map, once the scene is up: point positions for the chevrons, path highlight, refit. */
  private view: BattleView | null = null;
  private chevronsEl = h('div', { class: 'b-chevrons' });
  private chevronSig = '';
  private coachEl = h('div', { class: 'b-coach', role: 'status', 'aria-live': 'polite' });
  private coachSmokeAt = 0;
  private scoutOpen = false;
  private pathChip: string | null = null;

  constructor(private readonly deps: BattleHudDeps) {
    this.s = deps.session;
    const root = deps.root;
    clear(root);
    root.hidden = false;
    const baseName = this.s.setup.base.rival || this.s.setup.base.trialTier ? generatedName(this.s.setup.base.name) : this.s.setup.base.name;
    const left = h(
      'div',
      { class: 'panel b-left' },
      h(
        'button',
        { class: 'b-name', type: 'button', 'aria-expanded': 'true', 'aria-controls': 'b-left-more', onclick: () => this.toggleCard() },
        h('bdi', {}, baseName),
        h('span', { class: 'level' }, i18nText("ui.lv_445f51ab9e", { arg1: this.s.setup.base.hallLevel })),
        h('span', { class: 'b-caret', 'aria-hidden': 'true' }),
      ),
      h(
        'div',
        { class: 'muted small b-more', id: 'b-left-more' },
        this.s.mode === 'replay'
          ? deps.replayOf?.kind === 'defense'
            ? i18nText("ui.replay_attacks_loot_taken_cfa170965c", { arg1: isolateName(deps.replayOf.opponentName) })
            : i18nText("ui.replay_loot_won_db27073d59")
          : deps.grove
            ? i18nText("ui.vs_2d68ca8191", { arg1: deps.grove.title ?? 'Alliance War', arg2: isolateName(deps.grove.enemyName) })
            : deps.special
              ? ownedText(deps.special.title)
            : deps.trial
              ? i18nText("ui.practice_e31f506678", { arg1: ownedText(deps.trial.layout), arg2: deps.trial.modifiers.length ? i18nText("ui.message_c4f174b2a5", { arg1: i18nList(deps.trial.modifiers.map(i18nLabel)) }) : '', arg3: deps.trial.firstClear ? i18nText("ui.to_clear_2921e40d70", { arg1: deps.trial.starsToClear }) : i18nText("ui.already_cleared_6521e54750") })
              : deps.practice
                ? i18nText("ui.practice_battle_nothing_is_spent_or_wo_c68624fd43")
                : // Report section 5 step 4 (art F4): the card used to wrap to six lines on a 320 px phone.
                  // The label that says what this base is stays; the loot chips say what can be won.
                  ownedText(this.s.setup.base.practice ?? 'Loot you can win'),
      ),
      h(
        'div',
        { class: 'b-row b-more' },
        deps.grove || deps.practice || deps.special ? '' : deps.trial ? h('div', { class: 'small' }, deps.trial.firstClear ? i18nText("ui.first_clear_reward_c327c47a58") : i18nText("ui.reward_already_claimed_7d7dd827b4"), deps.trial.firstClear ? lootChips(deps.trial.reward) : '') : this.lootEl,
        this.s.mode !== 'replay' && !deps.grove && !deps.trial && !deps.special && this.s.setup.base.trophies !== undefined
          ? h(
              'div',
              { class: 'small b-trophies', title: i18nText("ui.honor_theirs_then_what_you_win_or_lose_a762882eaa") },
              icon(icons.leaf),
              i18nText("ui.message_f9da5dafaf", { arg1: this.s.setup.base.trophies, arg2: winTrophies(deps.myTrophies, this.s.setup.base.trophies, localizedData(this.s.data)), arg3: lossTrophies(deps.myTrophies, this.s.setup.base.trophies, localizedData(this.s.data)) }),
            )
          : null,
      ),
    );
    this.leftEl = left;
    this.setCardOpen(BattleHud.cardOpenByDefault());
    const right = h('div', { class: 'panel b-right' }, this.timerEl, this.starsEl, this.pctEl);
    this.coachEl.hidden = true;
    root.dataset.mode = this.s.mode;
    root.append(left, right, this.chevronsEl, this.toastEl, this.coachEl, this.troopsEl, this.bottomEl, this.modalEl);
    // Pick the first available troop by default (Saboteurs first: jam, then attack).
    this.selected = this.firstTroop();
    this.renderBottom();
    this.renderTroops();
    if (this.s.mode !== 'replay' && !deps.grove && (this.s.setup.army.saboteur ?? 0) > 0) {
      this.toast(i18nText("ui.tactic_send_saboteurs_first_to_jam_def_2ac8edaadb"));
    }
    this.tick();
    this.interval = window.setInterval(() => this.tick(), 100);
  }

  private leftEl!: HTMLElement;

  /**
   * Art audit F4: on a narrow or short phone the opponent card took a fifth of the screen. It folds to one line (name
   * and Keep level); a tap shows what can be won. The player's choice is remembered on the device.
   */
  static cardOpenByDefault(): boolean {
    try {
      const v = localStorage.getItem('tk.oppCard');
      if (v === 'open' || v === 'closed') return v === 'open';
    } catch {
      /* storage blocked: decide by size */
    }
    return window.innerWidth > 400 && window.innerHeight > 480;
  }

  private setCardOpen(open: boolean): void {
    this.leftEl.classList.toggle('collapsed', !open);
    this.leftEl.querySelector('.b-name')?.setAttribute('aria-expanded', String(open));
  }

  private toggleCard(): void {
    const open = this.leftEl.classList.contains('collapsed');
    this.setCardOpen(open);
    try {
      localStorage.setItem('tk.oppCard', open ? 'open' : 'closed');
    } catch {
      /* this battle only */
    }
    // The free area changed: the toasts move and, before the first deploy, the camera frames the points again.
    window.requestAnimationFrame(() => {
      this.placeToasts();
      this.chevronSig = '';
      if (this.s.mode === 'scout' || !this.s.deployments.length) this.view?.fit();
    });
  }

  destroy(): void {
    window.clearInterval(this.interval);
    clear(this.deps.root);
    this.deps.root.hidden = true;
    delete this.deps.root.dataset.mode;
  }

  /**
   * The screen the HUD leaves free for the map (CSS px insets). On a narrow phone the toasts get their own line under
   * the top cards, so a hint never covers a point; sideways they sit in the gap between the cards.
   */
  private safeArea(): ScreenInsets {
    const vh = window.innerHeight;
    const box = (el: Element | null) => (el && el.getClientRects().length ? el.getBoundingClientRect() : null);
    const root = this.deps.root;
    // Anything in the upper half (the cards; sideways also the scout drawer) bounds the top, the rest the bottom.
    const all = [box(root.querySelector('.b-left')), box(root.querySelector('.b-right')), box(this.troopsEl), box(this.bottomEl), box(this.scoutEl)].filter((r): r is DOMRect => Boolean(r) && r!.height > 0);
    const tops = all.filter((r) => r.top < vh / 2);
    const lows = all.filter((r) => r.top >= vh / 2);
    let top = Math.max(0, ...tops.map((r) => r.bottom)) + 4;
    if (!this.toastsBeside()) top += 44;
    const bottom = vh - Math.min(vh, ...lows.map((r) => r.top)) + 4;
    return { top, bottom, left: 4, right: 4 };
  }

  /** Room between the top cards for a toast line (landscape and wide screens). */
  private toastsBeside(): boolean {
    const l = this.deps.root.querySelector('.b-left')?.getBoundingClientRect();
    const r = this.deps.root.querySelector('.b-right')?.getBoundingClientRect();
    return Boolean(l && r && r.left - l.right >= 240);
  }

  /** Put the toast line where `safeArea` reserved it. */
  private placeToasts(): void {
    const root = this.deps.root;
    const l = root.querySelector('.b-left')?.getBoundingClientRect();
    const r = root.querySelector('.b-right')?.getBoundingClientRect();
    if (!l || !r) return;
    const beside = this.toastsBeside();
    for (const st of [this.toastEl.style, this.coachEl.style]) {
      if (beside) {
        st.left = `${l.right + 8}px`;
        st.width = `${r.left - l.right - 16}px`;
        st.top = `${Math.min(l.top, r.top)}px`;
      } else {
        st.left = '8px';
        st.width = 'calc(100% - 16px)';
        st.top = `${Math.max(l.bottom, r.bottom) + 4}px`;
      }
    }
  }

  /** Edge chevrons for open points outside the free area (letter + space left); a tap pans to the point. */
  private drawChevrons(): void {
    const v = this.view;
    if (!v || this.s.mode === 'replay' || this.s.sim.ended) {
      if (this.chevronSig) this.chevronsEl.replaceChildren();
      this.chevronSig = '';
      return;
    }
    const a = this.safeArea();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const L = a.left + 36;
    const R = vw - a.right - 36;
    const T = a.top + 22;
    const B = vh - a.bottom - 22;
    const cx = (L + R) / 2;
    const cy = (T + B) / 2;
    const out = v.entries().filter((e) => e.left > 0 && !e.inside);
    const items = out.map((e) => {
      const dx = e.x - cx;
      const dy = e.y - cy;
      // Where the ray from the middle of the free area towards the point leaves it.
      const k = Math.min(dx ? (dx > 0 ? R - cx : L - cx) / dx : Infinity, dy ? (dy > 0 ? B - cy : T - cy) / dy : Infinity, 1);
      return { e, x: Math.round(cx + dx * k), y: Math.round(cy + dy * k), deg: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) };
    });
    // Art audit F8: points in the same direction share one chevron, and the rest are spread along their edge.
    const laid = layoutChevrons(items.map((i) => ({ item: i, x: i.x, y: i.y })), { left: L, right: R, top: T, bottom: B });
    const sig = JSON.stringify(laid.map((c) => [c.items.map((i) => [i.e.index, i.e.left]), c.x, c.y, c.items[0].deg]));
    if (sig === this.chevronSig) return;
    this.chevronSig = sig;
    this.chevronsEl.replaceChildren(
      ...laid.map(({ items: group, x, y }) =>
        h(
          'button',
          {
            class: `entry-chevron${group.length > 1 ? ' merged' : ''}`,
            type: 'button',
            style: `left:${x}px;top:${y}px`,
            'aria-label': i18nList(group.map(({ e }) => t('battle.offscreen', { label: pointLabel(e.label), left: e.left }))),
            onclick: () => this.view?.showPoint(group[0].e.index),
          },
          h('span', { class: 'chev-arrow', style: `transform:rotate(${group[0].deg}deg)`, 'aria-hidden': 'true' }, '➤'),
          h('b', {}, group.map(({ e }) => pointLabel(e.label)).join('·')),
          h('span', { class: 'chev-left' }, String(group.reduce((a, { e }) => a + e.left, 0))),
        ),
      ),
    );
  }

  hooks(): BattleHooks {
    return {
      safeArea: () => this.safeArea(),
      attachView: (view) => {
        this.view = view;
        this.placeToasts();
        this.drawChevrons();
      },
      selectedTroop: () => this.selected,
      notice: (text) => this.toast(text),
      deployFailed: (reason) => {
        if (reason === 'zone') this.toast(this.s.sim.entry ? i18nText("ui.send_warriors_in_through_a_glowing_inf_2560f67d18") : i18nText("ui.place_troops_outside_the_red_area_cedc24afed"));
        else if (reason === 'full') this.toast(i18nText("ui.that_path_is_full_each_point_hides_spa_40b30b6db4", { arg1: this.s.sim.entry?.cover ?? 0 }));
        else if (reason === 'empty') this.toast(this.selected === 'smoke_bomb' ? i18nText("ui.no_smoke_bombs_left_57762694ae") : i18nText("ui.no_more_of_that_troop_pick_another_11ecd0ca12"));
        else this.toast(i18nText("ui.pick_a_troop_below_first_7ee2b765c2"));
      },
      deployed: () => {
        // After a Smoke Bomb, go back to troops so a second tap never wastes a charge.
        if (this.selected && isAbility(localizedData(this.s.data), this.selected)) this.selected = this.lastTroop ?? this.firstTroop();
        else if ((this.s.sim.remaining[this.selected ?? ''] ?? 0) <= 0) this.selected = this.firstTroop();
        if (this.s.mode === 'live') this.renderTroops();
      },
    };
  }

  private scoutEl: HTMLElement | null = null;

  /**
   * What scouting reveals, as a drawer (re-audit design item 2): one chip row by default ("6 points · 12 defenses ▸"
   * and a chip per point, which highlights that path on the map); open it for the defenses, the rule and the tips.
   */
  private renderScout(): void {
    this.scoutEl?.remove();
    this.scoutEl = null;
    if (this.s.mode !== 'scout') return;
    // The simulation leaves out tips about warriors the player did not bring (docs/game-theory/REQUESTS.md, 2026-11-13).
    const r = scoutReport(this.s.setup.base, localizedData(this.s.data), this.s.setup.army);
    const defenseCount = Object.values(r.defenses).reduce((a, b) => a + b, 0);
    const chips = Object.entries(r.defenses).map(([t, n]) => h('span', { class: 'chip' }, i18nText("ui.message_42a16430c0", { arg1: n, arg2: localizedData(this.s.data).buildings[t]?.name ?? t })));
    for (const [t, n] of Object.entries(r.counters)) if (!r.defenses[t]) chips.push(h('span', { class: 'chip' }, i18nText("ui.message_42a16430c0", { arg1: n, arg2: localizedData(this.s.data).buildings[t]?.name ?? t })));
    if (r.walls) chips.push(h('span', { class: 'chip' }, i18nText("ui.walls_b7e7ff287f", { arg1: r.walls })));
    const entry = this.s.sim.entry;
    const summary = entry?.points.length ? t('battle.scoutSummary', { points: entry.points.length, defenses: defenseCount }) : t('battle.defensesOnly', { defenses: defenseCount });
    const more = h(
      'div',
      { class: 'scout-more', id: 'scout-more' },
      h('div', { class: 'chips' }, ...chips),
      entry?.points.length ? h('p', { class: 'small' }, i18nText("ui.each_point_hides_space_of_warriors_so__fb923792c8", { arg1: entry.cover })) : null,
      // Tempering (balance audit 2026-11-08): the shape of the base is always shown at scouting.
      r.profile.reach + r.profile.blast + r.profile.watch > 0
        ? h('p', { class: 'small temper-profile' }, t('scout.profile', { reach: fmtPercent(r.profile.reach * 100), blast: fmtPercent(r.profile.blast * 100), watch: fmtPercent(r.profile.watch * 100) }))
        : null,
      ...r.tips.map((t) => h('p', { class: 'small' }, ownedText(t))),
      this.deps.stakes && stakeOptions(this.s.data).length ? h('p', { class: 'small muted' }, t('stake.help')) : null,
      ...(() => {
        // Report section 5 step 8: who holds this outpost (a computer rival clan).
        const clan = rivalById(this.s.setup.base.rival, localizedData(this.s.data));
        return clan ? [h('p', { class: 'small rival-bio' }, h('b', {}, i18nText("ui.led_by_5ac31159c9", { arg1: clan.name, arg2: clan.leader })), clan.bio)] : [];
      })(),
    );
    more.hidden = !this.scoutOpen;
    const toggle = h(
      'button',
      { class: 'chip scout-toggle', type: 'button', 'aria-expanded': String(this.scoutOpen), 'aria-controls': 'scout-more' },
      i18nLabel(summary),
      h('span', { class: 'scout-caret', 'aria-hidden': 'true' }, this.scoutOpen ? '▾' : '▸'),
    );
    toggle.addEventListener('click', () => {
      this.scoutOpen = !this.scoutOpen;
      this.renderScout();
      this.view?.fit();
    });
    this.scoutEl = h('div', { class: `panel scout-report${this.scoutOpen ? ' open' : ''}` }, h('div', { class: 'scout-row' }, toggle, ...this.pointChips()), ...this.stakeRow(), more);
    this.deps.root.insertBefore(this.scoutEl, this.troopsEl);
  }

  /** Declared stakes (opt-in): no stake, or a star count from `raids.stakes.byStars`, fixed when Attack is tapped. */
  private stakeRow(): HTMLElement[] {
    if (!this.deps.stakes || this.s.mode !== 'scout') return [];
    const gd = this.s.data;
    const opts = stakeOptions(gd);
    if (!opts.length) return [];
    const mult = (m: number) => fmtDecimal(m, Math.round(m * 10) === m * 10 ? 1 : 2);
    const chip = (stake: number | undefined, label: string) => {
      const on = this.s.stake === stake;
      const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), 'data-id': `stake-${stake ?? 0}` }, label);
      b.addEventListener('click', () => {
        this.s.setStake(stake);
        this.renderScout();
      });
      return b;
    };
    // Always in view (one chip row); what a stake means is in the drawer.
    return [h('div', { class: 'chips stake-row', role: 'group', 'aria-label': t('stake.label') }, h('span', { class: 'muted small' }, t('stake.label')), chip(undefined, t('stake.none')), ...opts.map((n) => chip(n, t('stake.option', { stars: n, mult: mult(gd.raids.stakes!.byStars[String(n)]) }))))];
  }

  /** One chip per Infiltration Point: letter and how many defenses cover its path (tap: highlight the path). */
  private pointChips(): HTMLElement[] {
    const entry = this.s.sim.entry;
    if (!entry || !entry.points.length) return [];
    const intel = pointIntel(entry.points, this.s.setup.base, localizedData(this.s.data));
    return intel.map((p, i) => {
      const on = this.pathChip === p.label;
      const b = h(
        'button',
        {
          class: `chip point-chip${p.defenses === 0 ? ' quiet' : ''}${on ? ' on' : ''}`,
          type: 'button',
          'aria-pressed': String(on),
          'aria-label': `${t('battle.pointAria', { label: pointLabel(p.label), defenses: p.defenses })}${p.antiAir ? i18nText("ui.message_eb55276313", { arg1: t('battle.antiAir') }) : ''}${p.splash ? i18nText("ui.message_eb55276313", { arg1: t('battle.splash') }) : ''}`,
        },
        h('b', {}, pointLabel(p.label)),
        // Art audit F16: the words themselves ("anti-air", "splash"), never the jargon "AA" that only the label spelled out.
        ` ${[String(p.defenses), p.antiAir ? t('battle.antiAir') : '', p.splash ? t('battle.splash') : ''].filter(Boolean).join(' · ')}`,
      );
      b.addEventListener('click', () => {
        this.pathChip = on ? null : p.label;
        this.view?.highlightPath(on ? null : i);
        if (!on) this.view?.showPoint(i);
        this.renderScout();
      });
      return b;
    });
  }

  private renderBottom(): void {
    clear(this.bottomEl);
    this.renderScout();
    const mode = this.s.mode;
    this.deps.root.dataset.mode = mode;
    if (mode === 'scout') {
      const hasArmy = Object.values(this.s.setup.army).some((n) => n > 0);
      this.bottomEl.append(
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.deps.onHome() }, t('battle.home')),
        this.deps.grove || this.deps.trial || this.deps.practice || this.deps.special
          ? h('span', {}, '')
          : h(
              'button',
              { class: 'btn gold', type: 'button', disabled: !this.deps.canPayFee(), onclick: () => this.deps.onNext() },
              h('span', {}, t('battle.next')),
              h('span', { class: 'chip' }, icon(icons.acorns), formatNumber(this.deps.scoutFee)),
            ),
        h(
          'button',
          {
            class: 'btn danger big-attack',
            type: 'button',
            disabled: !hasArmy,
            onclick: (ev: Event) => void this.attackTapped(ev.currentTarget as HTMLButtonElement),
          },
          hasArmy ? t('battle.attack') : t('battle.trainFirst'),
        ),
      );
    } else if (mode === 'live') {
      this.bottomEl.append(h('button', { class: 'btn danger', type: 'button', onclick: () => this.confirmEnd() }, t('battle.end')));
    } else {
      const speed = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.speed_48c409f269", { arg1: this.s.speed }));
      speed.addEventListener('click', () => {
        this.s.speed = this.s.speed === 1 ? 2 : this.s.speed === 2 ? 4 : 1;
        speed.textContent = i18nText("ui.speed_48c409f269", { arg1: this.s.speed });
      });
      this.bottomEl.append(speed, h('button', { class: 'btn primary', type: 'button', onclick: () => this.deps.onHome() }, i18nText("ui.exit_replay_0a858020f8")));
    }
  }

  private lastTroop: string | null = null;

  private firstTroop(): string | null {
    const order = Object.keys(this.s.setup.army).sort((a, b) => (a === 'saboteur' ? -1 : b === 'saboteur' ? 1 : 0));
    return order.find((t) => (this.s.sim.remaining[t] ?? 0) > 0) ?? null;
  }

  /** Units left for a troop, or charges left for an ability. */
  private left(type: string): number {
    return isAbility(localizedData(this.s.data), type) ? this.s.sim.charges[type] ?? 0 : this.s.sim.remaining[type] ?? 0;
  }

  private renderTroops(): void {
    clear(this.troopsEl);
    if (this.s.mode === 'replay') return;
    if ((this.s.sim.charges.smoke_bomb ?? 0) > 0 || (this.s.sim.abilitiesUsed.smoke_bomb ?? 0) > 0) {
      const left = this.left('smoke_bomb');
      const card = h(
        'button',
        { class: `troop-card ability${this.selected === 'smoke_bomb' ? ' on' : ''}${left <= 0 ? ' empty' : ''}`, type: 'button', 'aria-label': localizedData(this.s.data).battle.abilities.smoke_bomb.name, 'data-type': 'smoke_bomb', title: localizedData(this.s.data).battle.abilities.smoke_bomb.description },
        icon(icons.smoke),
        h('span', { class: 'troop-count' }, `×${left}`),
      );
      card.addEventListener('click', () => {
        if (this.left('smoke_bomb') <= 0) return;
        if (this.selected && !isAbility(localizedData(this.s.data), this.selected)) this.lastTroop = this.selected;
        this.selected = 'smoke_bomb';
        uiArt.haptic('selection');
        this.toast(i18nText("ui.tap_where_your_warriors_are_about_to_c_313578225b"));
        this.renderTroops();
      });
      this.troopsEl.append(card);
    }
    // Report section 5 step 8: the clan hero (SIM_RULES 5) leads the row.
    const hero = this.s.setup.hero && localizedData(this.s.data).battle.heroes?.[this.s.setup.hero.id] ? ([[this.s.setup.hero.id, 1]] as [string, number][]) : [];
    for (const [type, total] of [...hero, ...Object.entries(this.s.setup.army).sort(([a], [b]) => (a === 'saboteur' ? -1 : b === 'saboteur' ? 1 : 0))]) {
      if (total <= 0) continue;
      const left = this.s.sim.remaining[type] ?? 0;
      // Art audit F12: the warrior's badge reads at card size; the dark field sprite did not (the hero keeps its sprite).
      const badge = cardBadge(type);
      const thumb = badge ?? this.deps.troopThumb(type);
      const def = localizedData(this.s.data).troops[type] ?? localizedData(this.s.data).battle.heroes?.[type];
      const card = h(
        'button',
        { class: `troop-card${badge ? ' badge-art' : ''}${this.selected === type ? ' on' : ''}${left <= 0 ? ' empty' : ''}${hero.length && type === hero[0][0] ? ' hero' : ''}`, type: 'button', 'aria-label': def?.name ?? type, 'data-type': type, title: def?.description ?? type },
        thumb ? h('img', { src: thumb, alt: '' }) : null,
        h('span', { class: 'troop-count' }, `×${left}`),
      );
      card.addEventListener('click', () => {
        if (this.left(type) <= 0) return;
        this.selected = type;
        this.lastTroop = type;
        uiArt.haptic('selection');
        this.renderTroops();
      });
      this.troopsEl.append(card);
    }
  }

  private tick(): void {
    const sim = this.s.sim;
    this.drawChevrons();
    if (this.deps.coach) this.coach();
    const secs = this.s.mode === 'scout' ? sim.duration / localizedData(this.s.data).battle.ticksPerSecond : this.s.secondsLeft();
    this.timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const pct = sim.countable ? Math.floor((sim.destroyedCount * 100) / sim.countable) : 0;
    this.pctEl.textContent = `${pct}%`;
    const t = localizedData(this.s.data).battle.starThresholds;
    const stars = (pct >= t.destruction ? 1 : 0) + (sim.hallDestroyed ? 1 : 0) + (pct >= t.full ? 1 : 0);
    if (stars !== this.lastStars) {
      clear(this.starsEl);
      for (let i = 0; i < 3; i++) this.starsEl.append(h('span', { class: `star${i < stars ? ' on' : ''}` }, '★'));
      if (this.lastStars >= 0 && stars > this.lastStars) {
        this.starsEl.classList.add('bump');
        sound.play('star');
      }
      window.setTimeout(() => this.starsEl.classList.remove('bump'), 400);
      this.lastStars = stars;
    }
    // Loot still on the field.
    const remaining: Cost = {};
    const all = totalLoot(this.s.setup.base);
    for (const k of Object.keys(all) as ResourceKind[]) remaining[k] = Math.max(0, (all[k] ?? 0) - (sim.loot[k] ?? 0));
    // Audit M10: rebuilt only when a number changes (it was every 100 ms).
    const shown = this.s.mode === 'replay' ? sim.loot : remaining;
    const lootSig = RESOURCE_KINDS.map((k) => shown[k] ?? 0).join();
    if (lootSig !== this.lootSig) {
      this.lootSig = lootSig;
      this.lootEl.replaceChildren(lootChips(shown));
    }
    if (this.s.mode === 'live') {
      // Keep troop counts fresh without rebuilding on every tick.
      this.troopsEl.querySelectorAll<HTMLElement>('.troop-card').forEach((el) => {
        // The troop id, not the aria-label: that is the display name, which used to make every count read ×0.
        const type = el.dataset.type ?? '';
        const n = this.left(type);
        const c = el.querySelector('.troop-count');
        if (c && c.textContent !== `×${n}`) c.textContent = `×${n}`;
        el.classList.toggle('empty', n <= 0);
      });
    }
    if (sim.ended && !this.finished && this.s.mode !== 'scout') {
      this.finished = true;
      if (this.s.mode === 'live') {
        const out = this.deps.onFinished();
        if (out) this.showResults(out.result, out.banked, out.trophies, out.bonus, out.eventBonus, out.note, out.overflow, out.pending, out.stake);
      } else {
        this.toast(i18nText("ui.replay_finished_c807fbe581"));
      }
    }
  }


  /**
   * Attack tapped. An online raid waits for the server (it sends the battle seed only now: ledger audit A1),
   * so the button says so and stays put if the raid could not start.
   */
  private async attackTapped(btn: HTMLButtonElement): Promise<void> {
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = i18nText("ui.starting_bbe5fc3b9e");
    const ok = await this.deps.onAttack();
    if (!ok) {
      btn.disabled = false;
      btn.textContent = i18nLabel(label);
      return;
    }
    this.pathChip = null;
    this.renderBottom();
    this.renderTroops();
    // The scout drawer and its buttons are gone: frame every open point again for the first tap.
    window.requestAnimationFrame(() => {
      this.placeToasts();
      this.view?.fit();
    });
  }
  private confirmEnd(): void {
    const close = this.modal(
      i18nText("ui.end_the_battle_bcdafa61db"),
      h('p', {}, i18nText("ui.your_remaining_troops_go_back_home_you_cb260370b3")),
      [
        { label: i18nText("ui.keep_fighting_ca172d948b"), onClick: () => close() },
        { label: t('battle.end'), danger: true, onClick: () => { close(); this.s.surrender(); } },
      ],
    );
  }

  private showResults(r: BattleResult, banked: Cost, trophies: number, bonus?: Cost, eventBonus?: Cost, note?: string, overflow?: Cost, pending = false, stake?: number): void {
    // Result feel (re-audit design item 11): stars slam in one by one with a sound and haptic each, a banner for a
    // flawless raid, and the loot counts up. Reduced motion shows the end state at once.
    celebrate(r.stars > 0 ? 'victory' : 'defeat');
    const still = reducedMotion();
    const starsRow = h('div', { class: 'result-stars' });
    const STAR_GAP = 0.32;
    for (let i = 0; i < 3; i++) {
      const won = i < r.stars;
      starsRow.append(h('span', { class: `star big${won ? ' on slam' : ''}`, style: `animation-delay:${0.25 + i * STAR_GAP}s` }, '★'));
      if (won) window.setTimeout(() => celebrate('star'), still ? 0 : (250 + i * STAR_GAP * 1000 + 180));
    }
    if (r.destruction >= 100) window.setTimeout(() => celebrate('perfect'), still ? 0 : 250 + 3 * STAR_GAP * 1000);
    const used = i18nList(Object.entries(r.used).map(([t, n]) => i18nText("ui.message_14677cb26f", { arg1: n, arg2: localizedData(this.s.data).troops[t]?.name ?? t })));
    const title = r.stars === 3 ? t('battle.perfect') : r.stars > 0 ? t('battle.victory') : t('battle.defeat');
    const body = h(
      'div',
      { class: `results ${r.stars > 0 ? 'win' : 'loss'}` },
      r.destruction >= 100 ? h('div', { class: 'result-banner', role: 'status' }, h('b', {}, '100%'), h('span', {}, i18nText("ui.every_building_down_10af907f34"))) : null,
      starsRow,
      h('p', { class: 'result-pct' }, i18nText("ui.destroyed_788f690ec9", { arg1: r.destruction })),
      note ? h('p', { class: 'note' }, i18nMessage(note)) : null,
      this.deps.grove
        ? h('p', { class: 'muted' }, i18nText("ui.your_stars_count_toward_the_alliance_w_5c35bacca4"))
        : this.deps.practice
          ? h('p', { class: 'muted' }, i18nText("ui.loot_it_would_have_won_49fffbecef"), lootChips(r.loot))
        : pending
          ? h('p', {}, i18nText("ui.loot_won_5491665d1d"), lootChips(r.loot), h('span', { class: 'muted small' }, i18nText("ui.confirming_with_the_server_it_arrives__667ceaec28")))
          : h('p', {}, this.deps.trial || this.deps.special ? i18nLabel('Reward: ') : i18nLabel('Loot: '), countingChips(banked, still ? 0 : 250 + r.stars * STAR_GAP * 1000)),
      this.deps.grove || this.deps.trial || this.deps.practice || this.deps.special || pending ? '' : h('p', {}, i18nLabel('Honor: '), h('span', { class: `chip ${trophies >= 0 ? 'good' : 'short'}` }, icon(icons.leaf), `${trophies >= 0 ? '+' : ''}${trophies}`)),
      ...this.carryNotes(r, stake, pending),
      bonus && Object.keys(bonus).length ? h('p', { class: 'muted small' }, i18nText("ui.includes_your_league_bonus_b40d9ae1a0"), lootChips(bonus)) : null,
      eventBonus && Object.keys(eventBonus).length ? h('p', { class: 'muted small' }, i18nText("ui.includes_the_event_bonus_8c87bb2bac"), lootChips(eventBonus)) : null,
      ...closeCalls(this.s.sim, localizedData(this.s.data)).map((cc) => h('p', { class: 'close-call' }, i18nMessage(cc.text))),
      used ? h('p', { class: 'muted small' }, t('battle.used', { list: used })) : null,
      // The settlement says exactly what did not fit; nothing is inferred from totals.
      overflow && Object.values(overflow).some((v) => (v ?? 0) > 0) ? h('p', { class: 'note' }, i18nText("ui.did_not_fit_in_your_storage_e281ba747c"), lootChips(overflow)) : null,
    );
    this.modal(title, body, [
      { label: t('battle.watchReplay'), onClick: () => this.deps.onReplay() },
      {
        label: t('battle.returnHome'),
        primary: true,
        onClick: () => {
          // Retention audit G26: a real raid's win may be followed by the store's review sheet (rarely; reviewPrompt.ts).
          if (!this.deps.grove && !this.deps.trial && !this.deps.practice && !this.deps.special && !this.deps.replayOf) noteBattleResult(r.stars > 0, !this.deps.coach);
          this.deps.onHome();
        },
      },
    ], false);
  }

  /** What the raid carried home (sim/carry.ts): the stake's outcome and, for a one-role squad, the share it carried. */
  private carryNotes(r: BattleResult, stake: number | undefined, pending: boolean): HTMLElement[] {
    if (this.deps.grove || this.deps.trial || this.deps.practice || this.deps.special || this.deps.replayOf) return [];
    const gd = this.s.data;
    const out: HTMLElement[] = [];
    const m = stake !== undefined ? gd.raids.stakes?.byStars[String(stake)] : undefined;
    // Online the server settles the stake; the note waits for its answer.
    if (!pending && m !== undefined) {
      out.push(h('p', { class: `note ${r.stars >= stake! ? 'good' : 'short'}` }, r.stars >= stake! ? t('stake.met', { stars: stake, mult: fmtDecimal(m, Math.round(m * 10) === m * 10 ? 1 : 2) }) : t('stake.missed', { stars: stake })));
    }
    const share = diversityShare(armyDiversity(r.used, this.s.setup, gd), gd);
    if (share < 1 && (pending || m === undefined || r.stars >= stake!)) out.push(h('p', { class: 'muted small' }, t('carry.diversity', { pct: fmtPercent(share * 100) })));
    return out;
  }

  toast(text: string): void {
    // One line of hints at a time, in the band `safeArea` keeps free of points.
    this.placeToasts();
    const t = h('div', { class: 'toast' }, ownedText(text));
    this.toastEl.replaceChildren(t);
    const ms = Math.min(4200, 1800 + text.length * 25);
    window.setTimeout(() => t.classList.add('out'), ms);
    window.setTimeout(() => t.remove(), ms + 400);
  }

  /**
   * First-raid coach (re-audit design item 3): the tutorial bubble hides in battle, so one instruction at a time
   * shows here: tap a glowing point, send the rest through another, then smoke the squad as it reaches a tower.
   */
  private coach(): void {
    const sim = this.s.sim;
    let text = '';
    let pulse = '';
    const live = this.s.mode === 'live';
    const deployed = this.s.deployments.some((d) => !isAbility(localizedData(this.s.data), d.troop));
    const smoked = (sim.abilitiesUsed.smoke_bomb ?? 0) > 0;
    const left = Object.values(sim.remaining).reduce((a, b) => a + b, 0);
    if (this.s.mode === 'scout') {
      text = i18nText("ui.your_first_raid_tap_attack_when_you_ar_22236c4591");
      pulse = '.big-attack';
    } else if (live && !sim.ended) {
      const entry = sim.entry;
      const underFire = deployed && sim.troops.some((t) => t.hp > 0 && sim.buildings.some((b) => b.kind === 'defense' && b.combat && !b.destroyed && Math.hypot(b.x + b.size / 2 - t.x, b.y + b.size / 2 - t.y) <= b.combat.range + 1));
      if (!deployed) {
        text = entry ? i18nText("ui.tap_inside_a_glowing_ring_to_send_your_2cae6ad2ba") : i18nText("ui.tap_on_the_grass_outside_the_red_area__ff574c5dca");
        pulse = '.entry-chevron';
      } else if (!smoked && underFire && (sim.charges.smoke_bomb ?? 0) > 0) {
        text = this.selected === 'smoke_bomb' ? i18nText("ui.now_tap_on_your_warriors_near_the_towe_be972feaad") : i18nText("ui.they_are_under_fire_pick_the_smoke_bom_f2e61b2b2d");
        pulse = this.selected === 'smoke_bomb' ? '' : '.troop-card.ability';
      } else if (smoked && sim.tick - this.coachSmokeAt < 40) {
        text = i18nText("ui.inside_the_smoke_towers_can_only_hit_t_d23ff8c4e8");
      } else if (!smoked && left > 0 && entry && entry.points.some((p) => p.used > 0 && p.used >= entry.cover)) {
        text = i18nText("ui.that_ring_is_full_send_the_rest_throug_2a84975e5b");
        pulse = '.entry-chevron';
      }
      if (smoked && !this.coachSmokeAt) this.coachSmokeAt = sim.tick;
    }
    // A toast (the answer to a tap) wins the shared line for its few seconds.
    this.coachEl.hidden = !text || this.toastEl.childElementCount > 0;
    if (this.coachEl.textContent !== text) this.coachEl.textContent = text;
    this.deps.root.querySelectorAll('.coach-pulse').forEach((el) => el.classList.remove('coach-pulse'));
    if (pulse) this.deps.root.querySelectorAll(pulse).forEach((el) => el.classList.add('coach-pulse'));
  }

  private modal(title: string, body: HTMLElement, buttons: { label: string; primary?: boolean; danger?: boolean; onClick: () => void }[], closable = true): () => void {
    const backdrop = h('div', { class: 'modal-backdrop' });
    const close = () => removeWithExit(backdrop);
    const foot = h('div', { class: 'modal-foot' });
    for (const b of buttons) foot.append(h('button', { class: `btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}`, type: 'button', onclick: b.onClick }, b.label));
    backdrop.append(
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', {}, title), closable ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': i18nText("ui.close_7d9eb7acb1"), onclick: close }, icon(icons.close)) : null),
        h('div', { class: 'modal-body' }, body),
        foot,
      ),
    );
    this.modalEl.append(backdrop);
    return close;
  }
}
