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
import { celebrate, countUp, reducedMotion, uiArt } from './feedback';

export interface BattleHudDeps {
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
  onFinished(): { result: BattleResult; banked: Cost; trophies: number; bonus?: Cost; eventBonus?: Cost; overflow?: Cost; note?: string; pending?: boolean } | null;
  onReplay(): void;
}

function lootChips(loot: Cost): HTMLElement {
  const wrap = h('span', { class: 'cost' });
  for (const k of RESOURCE_KINDS) {
    if (!loot[k]) continue;
    wrap.append(h('span', { class: 'chip' }, icon(icons[k as 'acorns' | 'dew'] ?? ''), formatNumber(loot[k]!)));
  }
  if (!wrap.childElementCount) wrap.append(h('span', { class: 'chip' }, 'None'));
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
    const baseName = this.s.setup.base.name;
    const left = h(
      'div',
      { class: 'panel b-left' },
      h('div', { class: 'b-name' }, h('bdi', {}, baseName), h('span', { class: 'level' }, `Lv ${this.s.setup.base.hallLevel}`)),
      h(
        'div',
        { class: 'muted small' },
        this.s.mode === 'replay'
          ? deps.replayOf?.kind === 'defense'
            ? `Replay: ${isolateName(deps.replayOf.opponentName)} attacks · loot taken`
            : 'Replay · loot won'
          : deps.grove
            ? `${deps.grove.title ?? 'Alliance War'} vs ${isolateName(deps.grove.enemyName)}`
            : deps.special
              ? deps.special.title
            : deps.trial
              ? `Practice · ${deps.trial.layout}${deps.trial.modifiers.length ? ` · ${deps.trial.modifiers.join(', ')}` : ''} · ${deps.trial.firstClear ? `${deps.trial.starsToClear}★ to clear` : 'already cleared'}`
              : deps.practice
                ? 'Practice battle · nothing is spent or won'
                : this.s.setup.base.practice
                ? `Practice target · ${this.s.setup.base.practice} · loot you can win`
                : 'Loot you can win',
      ),
      deps.grove || deps.practice || deps.special ? '' : deps.trial ? h('div', { class: 'small' }, deps.trial.firstClear ? 'First-clear reward: ' : 'Reward already claimed', deps.trial.firstClear ? lootChips(deps.trial.reward) : '') : this.lootEl,
      this.s.mode !== 'replay' && !deps.grove && !deps.trial && !deps.special && this.s.setup.base.trophies !== undefined
        ? h(
            'div',
            { class: 'small b-trophies' },
            icon(icons.leaf),
            ` ${this.s.setup.base.trophies} · Win +${winTrophies(deps.myTrophies, this.s.setup.base.trophies, this.s.data)} · Lose −${lossTrophies(deps.myTrophies, this.s.setup.base.trophies, this.s.data)}`,
          )
        : null,
    );
    const right = h('div', { class: 'panel b-right' }, this.timerEl, this.starsEl, this.pctEl);
    this.coachEl.hidden = true;
    root.dataset.mode = this.s.mode;
    root.append(left, right, this.chevronsEl, this.toastEl, this.coachEl, this.troopsEl, this.bottomEl, this.modalEl);
    // Pick the first available troop by default (Saboteurs first: jam, then attack).
    this.selected = this.firstTroop();
    this.renderBottom();
    this.renderTroops();
    if (this.s.mode !== 'replay' && !deps.grove && (this.s.setup.army.saboteur ?? 0) > 0) {
      this.toast('Tactic: send Saboteurs first to jam defenses, then the main force; throw smoke over your warriors as they walk into tower range.');
    }
    this.tick();
    this.interval = window.setInterval(() => this.tick(), 100);
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
    const L = a.left + 26;
    const R = vw - a.right - 26;
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
    const sig = JSON.stringify(items.map((i) => [i.e.index, i.e.left, i.x, i.y, i.deg]));
    if (sig === this.chevronSig) return;
    this.chevronSig = sig;
    this.chevronsEl.replaceChildren(
      ...items.map(({ e, x, y, deg }) =>
        h(
          'button',
          {
            class: 'entry-chevron',
            type: 'button',
            style: `left:${x}px;top:${y}px`,
            'aria-label': `Infiltration point ${e.label}, ${e.left} space left, is off screen: show it`,
            onclick: () => this.view?.showPoint(e.index),
          },
          h('span', { class: 'chev-arrow', style: `transform:rotate(${deg}deg)`, 'aria-hidden': 'true' }, '➤'),
          h('b', {}, e.label),
          h('span', { class: 'chev-left' }, String(e.left)),
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
        if (reason === 'zone') this.toast(this.s.sim.entry ? 'Send warriors in through a glowing infiltration point.' : 'Place troops outside the red area.');
        else if (reason === 'full') this.toast(`That path is full: each point hides ${this.s.sim.entry?.cover ?? 0} space of warriors. Use another point.`);
        else if (reason === 'empty') this.toast(this.selected === 'smoke_bomb' ? 'No Smoke Bombs left.' : 'No more of that troop. Pick another.');
        else this.toast('Pick a troop below first.');
      },
      deployed: () => {
        // After a Smoke Bomb, go back to troops so a second tap never wastes a charge.
        if (this.selected && isAbility(this.s.data, this.selected)) this.selected = this.lastTroop ?? this.firstTroop();
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
    const r = scoutReport(this.s.setup.base, this.s.data);
    const defenseCount = Object.values(r.defenses).reduce((a, b) => a + b, 0);
    const chips = Object.entries(r.defenses).map(([t, n]) => h('span', { class: 'chip' }, `${n}× ${this.s.data.buildings[t]?.name ?? t}`));
    for (const [t, n] of Object.entries(r.counters)) if (!r.defenses[t]) chips.push(h('span', { class: 'chip' }, `${n}× ${this.s.data.buildings[t]?.name ?? t}`));
    if (r.walls) chips.push(h('span', { class: 'chip' }, `${r.walls} walls`));
    const entry = this.s.sim.entry;
    const summary = `${entry?.points.length ? `${entry.points.length} point${entry.points.length === 1 ? '' : 's'} · ` : ''}${defenseCount} defense${defenseCount === 1 ? '' : 's'}`;
    const more = h(
      'div',
      { class: 'scout-more', id: 'scout-more' },
      h('div', { class: 'chips' }, ...chips),
      entry?.points.length ? h('p', { class: 'small' }, `Each point hides ${entry.cover} space of warriors, so split your army into squads. The number on a point is how many defenses cover its path to the Keep; tap one to see the path.`) : null,
      ...this.armyTips(r.tips).map((t) => h('p', { class: 'small' }, t)),
    );
    more.hidden = !this.scoutOpen;
    const toggle = h(
      'button',
      { class: 'chip scout-toggle', type: 'button', 'aria-expanded': String(this.scoutOpen), 'aria-controls': 'scout-more' },
      summary,
      h('span', { class: 'scout-caret', 'aria-hidden': 'true' }, this.scoutOpen ? '▾' : '▸'),
    );
    toggle.addEventListener('click', () => {
      this.scoutOpen = !this.scoutOpen;
      this.renderScout();
      this.view?.fit();
    });
    this.scoutEl = h('div', { class: `panel scout-report${this.scoutOpen ? ' open' : ''}` }, h('div', { class: 'scout-row' }, toggle, ...this.pointChips()), more);
    this.deps.root.insertBefore(this.scoutEl, this.troopsEl);
  }

  /**
   * Scout tips that name warriors only when the player brings them: a tip built around a warrior they don't have is
   * left out (the smoke advice stays, everyone has Smoke Bombs).
   * TODO(GAME THEORY, docs/game-theory/REQUESTS.md): give `scoutReport` the army so the sim words the tips itself.
   */
  private armyTips(tips: string[]): string[] {
    const army = this.s.setup.army;
    const gd = this.s.data;
    const names = Object.entries(gd.troops).map(([id, t]) => ({ id, name: t.name }));
    return tips.flatMap((tip) => {
      const named = names.filter((n) => new RegExp(`\\b${n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(tip));
      if (!named.length || named.some((n) => (army[n.id] ?? 0) > 0)) return [tip];
      // "Defenses cover each other: jam one with a Saboteur, and throw smoke…" without Saboteurs: keep the smoke half.
      const smoke = tip.match(/^(.*?:)\s.*?(throw smoke .*)$/i);
      return smoke ? [`${smoke[1]} ${smoke[2]}`] : [];
    });
  }

  /** One chip per Infiltration Point: letter and how many defenses cover its path (tap: highlight the path). */
  private pointChips(): HTMLElement[] {
    const entry = this.s.sim.entry;
    if (!entry || !entry.points.length) return [];
    const intel = pointIntel(entry.points, this.s.setup.base, this.s.data);
    return intel.map((p, i) => {
      const on = this.pathChip === p.label;
      const b = h(
        'button',
        {
          class: `chip point-chip${p.defenses === 0 ? ' quiet' : ''}${on ? ' on' : ''}`,
          type: 'button',
          'aria-pressed': String(on),
          'aria-label': `Point ${p.label}: ${p.defenses} defense${p.defenses === 1 ? '' : 's'} cover its path${p.antiAir ? ', anti-air' : ''}${p.splash ? ', splash' : ''}`,
        },
        h('b', {}, p.label),
        ` ${p.defenses}${p.antiAir ? ' · AA' : ''}${p.splash ? ' · splash' : ''}`,
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
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.deps.onHome() }, 'Home'),
        this.deps.grove || this.deps.trial || this.deps.practice || this.deps.special
          ? h('span', {}, '')
          : h(
              'button',
              { class: 'btn gold', type: 'button', disabled: !this.deps.canPayFee(), onclick: () => this.deps.onNext() },
              h('span', {}, 'Next'),
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
          hasArmy ? 'Attack!' : 'Train troops first',
        ),
      );
    } else if (mode === 'live') {
      this.bottomEl.append(h('button', { class: 'btn danger', type: 'button', onclick: () => this.confirmEnd() }, 'End battle'));
    } else {
      const speed = h('button', { class: 'btn ghost', type: 'button' }, `Speed ${this.s.speed}×`);
      speed.addEventListener('click', () => {
        this.s.speed = this.s.speed === 1 ? 2 : this.s.speed === 2 ? 4 : 1;
        speed.textContent = `Speed ${this.s.speed}×`;
      });
      this.bottomEl.append(speed, h('button', { class: 'btn primary', type: 'button', onclick: () => this.deps.onHome() }, 'Exit replay'));
    }
  }

  private lastTroop: string | null = null;

  private firstTroop(): string | null {
    const order = Object.keys(this.s.setup.army).sort((a, b) => (a === 'saboteur' ? -1 : b === 'saboteur' ? 1 : 0));
    return order.find((t) => (this.s.sim.remaining[t] ?? 0) > 0) ?? null;
  }

  /** Units left for a troop, or charges left for an ability. */
  private left(type: string): number {
    return isAbility(this.s.data, type) ? this.s.sim.charges[type] ?? 0 : this.s.sim.remaining[type] ?? 0;
  }

  private renderTroops(): void {
    clear(this.troopsEl);
    if (this.s.mode === 'replay') return;
    if ((this.s.sim.charges.smoke_bomb ?? 0) > 0 || (this.s.sim.abilitiesUsed.smoke_bomb ?? 0) > 0) {
      const left = this.left('smoke_bomb');
      const card = h(
        'button',
        { class: `troop-card ability${this.selected === 'smoke_bomb' ? ' on' : ''}${left <= 0 ? ' empty' : ''}`, type: 'button', 'aria-label': this.s.data.battle.abilities.smoke_bomb.name, 'data-type': 'smoke_bomb', title: this.s.data.battle.abilities.smoke_bomb.description },
        icon(icons.smoke),
        h('span', { class: 'troop-count' }, `×${left}`),
      );
      card.addEventListener('click', () => {
        if (this.left('smoke_bomb') <= 0) return;
        if (this.selected && !isAbility(this.s.data, this.selected)) this.lastTroop = this.selected;
        this.selected = 'smoke_bomb';
        uiArt.haptic('selection');
        this.toast('Tap where your warriors are about to come under fire: warriors inside the smoke can only be shot from close up.');
        this.renderTroops();
      });
      this.troopsEl.append(card);
    }
    for (const [type, total] of Object.entries(this.s.setup.army).sort(([a], [b]) => (a === 'saboteur' ? -1 : b === 'saboteur' ? 1 : 0))) {
      if (total <= 0) continue;
      const left = this.s.sim.remaining[type] ?? 0;
      const thumb = this.deps.troopThumb(type);
      const card = h(
        'button',
        { class: `troop-card${this.selected === type ? ' on' : ''}${left <= 0 ? ' empty' : ''}`, type: 'button', 'aria-label': this.s.data.troops[type]?.name ?? type, 'data-type': type, title: this.s.data.troops[type]?.description ?? type },
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
    const secs = this.s.mode === 'scout' ? sim.duration / this.s.data.battle.ticksPerSecond : this.s.secondsLeft();
    this.timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const pct = sim.countable ? Math.floor((sim.destroyedCount * 100) / sim.countable) : 0;
    this.pctEl.textContent = `${pct}%`;
    const t = this.s.data.battle.starThresholds;
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
    clear(this.lootEl);
    this.lootEl.append(lootChips(this.s.mode === 'replay' ? sim.loot : remaining));
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
        if (out) this.showResults(out.result, out.banked, out.trophies, out.bonus, out.eventBonus, out.note, out.overflow, out.pending);
      } else {
        this.toast('Replay finished.');
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
    btn.textContent = 'Starting…';
    const ok = await this.deps.onAttack();
    if (!ok) {
      btn.disabled = false;
      btn.textContent = label;
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
      'End the battle?',
      h('p', {}, 'Your remaining troops go back home. You keep any loot you already won.'),
      [
        { label: 'Keep fighting', onClick: () => close() },
        { label: 'End battle', danger: true, onClick: () => { close(); this.s.surrender(); } },
      ],
    );
  }

  private showResults(r: BattleResult, banked: Cost, trophies: number, bonus?: Cost, eventBonus?: Cost, note?: string, overflow?: Cost, pending = false): void {
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
    const used = Object.entries(r.used).map(([t, n]) => `${n} ${this.s.data.troops[t]?.name ?? t}`).join(', ');
    const title = r.stars === 3 ? 'Perfect raid!' : r.stars > 0 ? 'Victory!' : 'Defeat';
    const body = h(
      'div',
      { class: `results ${r.stars > 0 ? 'win' : 'loss'}` },
      r.destruction >= 100 ? h('div', { class: 'result-banner', role: 'status' }, h('b', {}, '100%'), h('span', {}, 'Every building down')) : null,
      starsRow,
      h('p', { class: 'result-pct' }, `${r.destruction}% destroyed`),
      note ? h('p', { class: 'note' }, note) : null,
      this.deps.grove
        ? h('p', { class: 'muted' }, 'Your stars count toward the Alliance War.')
        : this.deps.practice
          ? h('p', { class: 'muted' }, 'Loot it would have won: ', lootChips(r.loot))
        : pending
          ? h('p', {}, 'Loot won: ', lootChips(r.loot), h('span', { class: 'muted small' }, ' (confirming with the server; it arrives when the server accepts the attack)'))
          : h('p', {}, this.deps.trial || this.deps.special ? 'Reward: ' : 'Loot: ', countingChips(banked, still ? 0 : 250 + r.stars * STAR_GAP * 1000)),
      this.deps.grove || this.deps.trial || this.deps.practice || this.deps.special || pending ? '' : h('p', {}, 'Honor: ', h('span', { class: `chip ${trophies >= 0 ? 'good' : 'short'}` }, icon(icons.leaf), `${trophies >= 0 ? '+' : ''}${trophies}`)),
      bonus && Object.keys(bonus).length ? h('p', { class: 'muted small' }, 'Includes your league bonus: ', lootChips(bonus)) : null,
      eventBonus && Object.keys(eventBonus).length ? h('p', { class: 'muted small' }, 'Includes the event bonus: ', lootChips(eventBonus)) : null,
      ...closeCalls(this.s.sim, this.s.data).map((cc) => h('p', { class: 'close-call' }, cc.text)),
      used ? h('p', { class: 'muted small' }, `Warriors used: ${used}`) : null,
      // The settlement says exactly what did not fit; nothing is inferred from totals.
      overflow && Object.values(overflow).some((v) => (v ?? 0) > 0) ? h('p', { class: 'note' }, 'Did not fit in your storage: ', lootChips(overflow)) : null,
    );
    this.modal(title, body, [
      { label: 'Watch replay', onClick: () => this.deps.onReplay() },
      { label: 'Return home', primary: true, onClick: () => this.deps.onHome() },
    ], false);
  }

  toast(text: string): void {
    // One line of hints at a time, in the band `safeArea` keeps free of points.
    this.placeToasts();
    const t = h('div', { class: 'toast' }, text);
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
    const deployed = this.s.deployments.some((d) => !isAbility(this.s.data, d.troop));
    const smoked = (sim.abilitiesUsed.smoke_bomb ?? 0) > 0;
    const left = Object.values(sim.remaining).reduce((a, b) => a + b, 0);
    if (this.s.mode === 'scout') {
      text = 'Your first raid. Tap Attack! when you are ready.';
      pulse = '.big-attack';
    } else if (live && !sim.ended) {
      const entry = sim.entry;
      const underFire = deployed && sim.troops.some((t) => t.hp > 0 && sim.buildings.some((b) => b.kind === 'defense' && b.combat && !b.destroyed && Math.hypot(b.x + b.size / 2 - t.x, b.y + b.size / 2 - t.y) <= b.combat.range + 1));
      if (!deployed) {
        text = entry ? 'Tap inside a glowing ring to send your warriors in. Arrows at the edge lead to more rings.' : 'Tap on the grass outside the red area to send your warriors in.';
        pulse = '.entry-chevron';
      } else if (!smoked && underFire && (sim.charges.smoke_bomb ?? 0) > 0) {
        text = this.selected === 'smoke_bomb' ? 'Now tap on your warriors near the tower.' : 'They are under fire! Pick the Smoke Bomb, then tap on your warriors.';
        pulse = this.selected === 'smoke_bomb' ? '' : '.troop-card.ability';
      } else if (smoked && sim.tick - this.coachSmokeAt < 40) {
        text = 'Inside the smoke, towers can only hit them from close up.';
      } else if (!smoked && left > 0 && entry && entry.points.some((p) => p.used > 0 && p.used >= entry.cover)) {
        text = 'That ring is full. Send the rest through another glowing ring.';
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
    const close = () => backdrop.remove();
    const foot = h('div', { class: 'modal-foot' });
    for (const b of buttons) foot.append(h('button', { class: `btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}`, type: 'button', onclick: b.onClick }, b.label));
    backdrop.append(
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', {}, title), closable ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon(icons.close)) : null),
        h('div', { class: 'modal-body' }, body),
        foot,
      ),
    );
    this.modalEl.append(backdrop);
    return close;
  }
}
