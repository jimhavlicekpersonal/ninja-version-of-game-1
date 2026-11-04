import type { BattleSession } from '../../gameplay/control/battleSession';
import type { BattleHooks, InspectAt } from '../render/BattleScene';
import { inspectInfo, type BattleInfo, type InspectTarget, type WarriorInfo } from './battleInfo';
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

export interface BattleHudDeps {
  root: HTMLElement;
  session: BattleSession;
  myTrophies: number;
  /** Set when watching a replay. */
  replayOf?: { kind: 'attack' | 'defense'; opponentName: string };
  /** Set for Grove Raid attacks (no loot, no Next). */
  grove?: { enemyName: string };
  /** A practice battle (nothing spent or won, no Next). */
  practice?: boolean;
  /** Set for Shadow Trials (practice ladder: no loot from buildings, no honor, no Next). */
  trial?: { tier: number; layout: string; modifiers: string[]; reward: Cost; firstClear: boolean; starsToClear: number };
  troopThumb(type: string): string | null;
  scoutFee: number;
  canPayFee(): boolean;
  onHome(): void;
  onNext(): void;
  onAttack(): void;
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
  /** The info popup: a warrior's stats, a building's name, or a tactic. Never takes taps. */
  private inspectEl = h('div', { class: 'b-inspect', role: 'tooltip', hidden: true });
  private inspecting: { target: InspectTarget; at: InspectAt; from: 'map' | 'card'; card?: HTMLElement } | null = null;
  private inspectSig = '';
  private inspectTimer = 0;
  private holdTimer = 0;
  private interval = 0;
  private finished = false;
  private lastStars = -1;

  constructor(private readonly deps: BattleHudDeps) {
    this.s = deps.session;
    const root = deps.root;
    clear(root);
    root.hidden = false;
    const baseName = this.s.setup.base.name;
    const left = h(
      'div',
      { class: 'panel b-left' },
      h('div', { class: 'b-name' }, baseName, h('span', { class: 'level' }, `Lv ${this.s.setup.base.hallLevel}`)),
      h(
        'div',
        { class: 'muted small' },
        this.s.mode === 'replay'
          ? deps.replayOf?.kind === 'defense'
            ? `Replay: ${deps.replayOf.opponentName} attacks · loot taken`
            : 'Replay · loot won'
          : deps.grove
            ? `Alliance War vs ${deps.grove.enemyName}`
            : deps.trial
              ? `Practice · ${deps.trial.layout}${deps.trial.modifiers.length ? ` · ${deps.trial.modifiers.join(', ')}` : ''} · ${deps.trial.firstClear ? `${deps.trial.starsToClear}★ to clear` : 'already cleared'}`
              : deps.practice
                ? 'Practice battle · nothing is spent or won'
                : this.s.setup.base.practice
                ? `Practice target · ${this.s.setup.base.practice} · loot you can win`
                : 'Loot you can win',
      ),
      deps.grove || deps.practice ? '' : deps.trial ? h('div', { class: 'small' }, deps.trial.firstClear ? 'First-clear reward: ' : 'Reward already claimed', deps.trial.firstClear ? lootChips(deps.trial.reward) : '') : this.lootEl,
      this.s.mode !== 'replay' && !deps.grove && !deps.trial && this.s.setup.base.trophies !== undefined
        ? h(
            'div',
            { class: 'small b-trophies' },
            icon(icons.leaf),
            ` ${this.s.setup.base.trophies} · Win +${winTrophies(deps.myTrophies, this.s.setup.base.trophies, this.s.data)} · Lose −${lossTrophies(deps.myTrophies, this.s.setup.base.trophies, this.s.data)}`,
          )
        : null,
    );
    const right = h('div', { class: 'panel b-right' }, this.timerEl, this.starsEl, this.pctEl);
    root.append(left, right, this.toastEl, this.troopsEl, this.bottomEl, this.inspectEl, this.modalEl);
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
    window.clearTimeout(this.inspectTimer);
    window.clearTimeout(this.holdTimer);
    this.inspecting = null;
    clear(this.deps.root);
    this.deps.root.hidden = true;
  }

  hooks(): BattleHooks {
    return {
      selectedTroop: () => this.selected,
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
      inspect: (target, at) => {
        // The map closes only its own popups: a deploy-bar card keeps its popup while the mouse is on it.
        if (!target) {
          if (this.inspecting?.from === 'map') this.closeInspect();
          return;
        }
        if (at) this.openInspect({ target, at, from: 'map' });
      },
    };
  }

  // ------------------------------------------------------------ info popup

  private openInspect(next: NonNullable<BattleHud['inspecting']>): void {
    this.inspecting = next;
    window.clearTimeout(this.inspectTimer);
    // No hover on a touch screen, so a popup opened by a finger closes by itself.
    if (next.at.touch) this.inspectTimer = window.setTimeout(() => this.closeInspect(), 3500);
    this.renderInspect();
  }

  private closeInspect(): void {
    window.clearTimeout(this.inspectTimer);
    this.inspecting = null;
    this.inspectSig = '';
    this.inspectEl.hidden = true;
  }

  /** Redraws the popup when what it says changes (live hit points, warriors left), and keeps it on screen. */
  private renderInspect(): void {
    const cur = this.inspecting;
    const info = cur ? inspectInfo(this.s.sim, cur.target) : null;
    if (!cur || !info) {
      if (cur) this.closeInspect();
      return;
    }
    const sig = JSON.stringify(info);
    if (sig !== this.inspectSig) {
      this.inspectSig = sig;
      clear(this.inspectEl);
      this.inspectEl.className = `b-inspect ${info.kind}`;
      this.inspectEl.append(...this.inspectBody(info));
    }
    this.inspectEl.hidden = false;
    this.placeInspect(cur);
  }

  private inspectBody(info: BattleInfo): (HTMLElement | string)[] {
    if (info.kind === 'building') return [info.name];
    if (info.kind === 'tactic') {
      return [
        h('div', { class: 'bi-name' }, info.name),
        h('p', { class: 'small' }, info.description),
        h('div', { class: 'bi-foot' }, `×${info.left} left`),
      ];
    }
    return this.warriorBody(info);
  }

  private warriorBody(w: WarriorInfo): HTMLElement[] {
    const thumb = this.deps.troopThumb(w.type);
    const frac = w.maxHp > 0 ? Math.max(0, Math.min(1, w.hp / w.maxHp)) : 0;
    const hp = `${formatNumber(Math.ceil(w.hp))}${w.deployed ? ` / ${formatNumber(Math.ceil(w.maxHp))}` : ''}`;
    const stat = (label: string, value: string) => [h('span', { class: 'muted' }, label), h('span', {}, value)];
    const out: HTMLElement[] = [
      h(
        'div',
        { class: 'bi-head' },
        thumb ? h('img', { src: thumb, alt: '' }) : null,
        h('div', {}, h('div', { class: 'bi-name' }, w.name, h('span', { class: 'level' }, `Lv ${w.level}`)), w.role ? h('div', { class: 'muted small' }, w.role) : null),
      ),
      h('div', { class: 'bi-hp' }, h('span', {}, 'HP'), h('span', { class: `bi-bar${frac < 0.3 ? ' low' : ''}` }, h('span', { style: `width:${(frac * 100).toFixed(1)}%` })), h('span', {}, hp)),
      h(
        'div',
        { class: 'bi-stats' },
        ...stat('Damage/sec', String(w.dps)),
        ...stat('Range', `${w.range} tiles`),
        ...stat('Speed', `${w.speed} tiles/s`),
        ...stat('Moves', w.flies ? 'Flies' : 'On foot'),
        ...stat('Targets', w.targets),
        ...stat('Space', String(w.space)),
      ),
    ];
    if (w.ability) out.push(h('p', { class: 'small' }, h('b', {}, `${w.ability.name}: `), w.ability.text));
    out.push(h('p', { class: 'small muted' }, w.description));
    if (w.status.length) out.push(h('div', { class: 'bi-tags' }, ...w.status.map((t) => h('span', { class: 'chip' }, t))));
    if (w.left !== undefined) {
      const donated = w.donated ? ` · ${w.donated.count} donated at Lv ${w.donated.level} go first` : '';
      out.push(h('div', { class: 'bi-foot' }, `×${w.left} to send${donated}`));
    }
    return out;
  }

  /** Beside the mouse or finger on the map, above the card in the deploy bar; always inside the screen. */
  private placeInspect(cur: NonNullable<BattleHud['inspecting']>): void {
    const el = this.inspectEl;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const m = 8;
    let x: number;
    let y: number;
    if (cur.from === 'card' && cur.card?.isConnected) {
      const r = cur.card.getBoundingClientRect();
      x = r.left + r.width / 2 - w / 2;
      y = r.top - hgt - 12;
    } else {
      // A finger covers what it taps, so a touch popup sits above it.
      const off = cur.at.touch ? 28 : 16;
      x = cur.at.x + off > vw - w - m ? cur.at.x - w - off : cur.at.x + off;
      y = cur.at.touch ? cur.at.y - hgt - off : cur.at.y + off > vh - hgt - m ? cur.at.y - hgt - off : cur.at.y + off;
    }
    x = Math.max(m, Math.min(vw - w - m, x));
    y = Math.max(m, Math.min(vh - hgt - m, y));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** A deploy-bar card shows its warrior's popup on mouse hover, keyboard focus, or a long press. */
  private wireCardInfo(card: HTMLElement, type: string): void {
    const show = (touch: boolean) => {
      const r = card.getBoundingClientRect();
      this.openInspect({ target: { kind: 'card', type }, at: { x: r.left + r.width / 2, y: r.top, touch }, from: 'card', card });
    };
    const hide = () => {
      if (this.inspecting?.from === 'card' && this.inspecting.card === card) this.closeInspect();
    };
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') show(false);
    });
    card.addEventListener('pointerleave', (e) => {
      window.clearTimeout(this.holdTimer);
      if (e.pointerType === 'mouse') hide();
    });
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      window.clearTimeout(this.holdTimer);
      this.holdTimer = window.setTimeout(() => show(true), 450);
    });
    const cancel = () => window.clearTimeout(this.holdTimer);
    card.addEventListener('pointerup', cancel);
    card.addEventListener('pointercancel', cancel);
    // A long press opens the popup, not the browser's menu.
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    card.addEventListener('focus', () => {
      if (card.matches(':focus-visible')) show(false);
    });
    card.addEventListener('blur', hide);
  }

  private scoutEl: HTMLElement | null = null;

  /** What scouting reveals: visible defenses, walls and a tactic for this layout. */
  private renderScout(): void {
    this.scoutEl?.remove();
    this.scoutEl = null;
    if (this.s.mode !== 'scout') return;
    const r = scoutReport(this.s.setup.base, this.s.data);
    const chips = Object.entries(r.defenses).map(([t, n]) => h('span', { class: 'chip' }, `${n}× ${this.s.data.buildings[t]?.name ?? t}`));
    for (const [t, n] of Object.entries(r.counters)) if (!r.defenses[t]) chips.push(h('span', { class: 'chip' }, `${n}× ${this.s.data.buildings[t]?.name ?? t}`));
    if (r.walls) chips.push(h('span', { class: 'chip' }, `${r.walls} walls`));
    const opp = this.s.setup.base;
    this.scoutEl = h(
      'div',
      { class: 'panel scout-report' },
      h('b', {}, opp.practice ? `Practice target · ${opp.practice}` : 'Scout report'),
      h('div', { class: 'chips' }, ...chips),
      ...this.entryIntel(),
      ...r.tips.map((t) => h('p', { class: 'small' }, t)),
    );
    // Before the info popup, so the popup is drawn over the report.
    this.deps.root.insertBefore(this.scoutEl, this.inspectEl);
  }

  /** Infiltration Points in the scout report: the rule in one line, and what each point leads into. */
  private entryIntel(): HTMLElement[] {
    const entry = this.s.sim.entry;
    if (!entry || !entry.points.length) return [];
    const intel = pointIntel(entry.points, this.s.setup.base, this.s.data);
    const chip = (p: (typeof intel)[number]) =>
      h('span', { class: `chip point-chip${p.defenses === 0 ? ' quiet' : ''}` }, h('b', {}, p.label), ` ${p.defenses}${p.antiAir ? ' · AA' : ''}${p.splash ? ' · splash' : ''}`);
    return [
      h('p', { class: 'small' }, h('b', {}, `${entry.points.length} infiltration points. `), `Each hides ${entry.cover} space of warriors, so split your army into squads. Defenses covering each path to the Keep:`),
      h('div', { class: 'chips' }, ...intel.map(chip)),
    ];
  }

  private renderBottom(): void {
    clear(this.bottomEl);
    this.renderScout();
    const mode = this.s.mode;
    if (mode === 'scout') {
      const hasArmy = Object.values(this.s.setup.army).some((n) => n > 0);
      this.bottomEl.append(
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.deps.onHome() }, 'Home'),
        this.deps.grove || this.deps.trial || this.deps.practice
          ? h('span', {}, '')
          : h(
              'button',
              { class: 'btn gold', type: 'button', disabled: !this.deps.canPayFee(), onclick: () => this.deps.onNext() },
              'Next ',
              h('span', { class: 'chip' }, icon(icons.acorns), formatNumber(this.deps.scoutFee)),
            ),
        h(
          'button',
          {
            class: 'btn danger big-attack',
            type: 'button',
            disabled: !hasArmy,
            onclick: () => {
              this.deps.onAttack();
              this.renderBottom();
              this.renderTroops();
            },
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
    // The cards are rebuilt: a popup pinned to an old card moves to its replacement.
    const pinned = this.inspecting?.from === 'card' && this.inspecting.target.kind === 'card' ? this.inspecting.target.type : null;
    clear(this.troopsEl);
    if (this.s.mode === 'replay') return;
    if ((this.s.sim.charges.smoke_bomb ?? 0) > 0 || (this.s.sim.abilitiesUsed.smoke_bomb ?? 0) > 0) {
      const left = this.left('smoke_bomb');
      const card = h(
        'button',
        { class: `troop-card ability${this.selected === 'smoke_bomb' ? ' on' : ''}${left <= 0 ? ' empty' : ''}`, type: 'button', 'aria-label': this.s.data.battle.abilities.smoke_bomb.name, 'data-type': 'smoke_bomb' },
        icon(icons.smoke),
        h('span', { class: 'troop-count' }, `×${left}`),
      );
      card.addEventListener('click', () => {
        if (this.left('smoke_bomb') <= 0) return;
        if (this.selected && !isAbility(this.s.data, this.selected)) this.lastTroop = this.selected;
        this.selected = 'smoke_bomb';
        this.toast('Tap where your warriors are about to come under fire: warriors inside the smoke can only be shot from close up.');
        this.renderTroops();
      });
      this.wireCardInfo(card, 'smoke_bomb');
      this.troopsEl.append(card);
    }
    for (const [type, total] of Object.entries(this.s.setup.army).sort(([a], [b]) => (a === 'saboteur' ? -1 : b === 'saboteur' ? 1 : 0))) {
      if (total <= 0) continue;
      const left = this.s.sim.remaining[type] ?? 0;
      const thumb = this.deps.troopThumb(type);
      const card = h(
        'button',
        { class: `troop-card${this.selected === type ? ' on' : ''}${left <= 0 ? ' empty' : ''}`, type: 'button', 'aria-label': this.s.data.troops[type]?.name ?? type, 'data-type': type },
        thumb ? h('img', { src: thumb, alt: '' }) : null,
        h('span', { class: 'troop-count' }, `×${left}`),
      );
      card.addEventListener('click', () => {
        if (this.left(type) <= 0) return;
        this.selected = type;
        this.lastTroop = type;
        this.renderTroops();
      });
      this.wireCardInfo(card, type);
      this.troopsEl.append(card);
    }
    if (pinned && this.inspecting) {
      const card = [...this.troopsEl.querySelectorAll<HTMLElement>('.troop-card')].find((el) => el.dataset.type === pinned);
      if (card) this.inspecting.card = card;
      else this.closeInspect();
    }
  }

  private tick(): void {
    const sim = this.s.sim;
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
    // Live hit points and counts in an open popup.
    if (this.inspecting) this.renderInspect();
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
    this.closeInspect();
    sound.play(r.stars > 0 ? 'victory' : 'defeat');
    const starsRow = h('div', { class: 'result-stars' });
    for (let i = 0; i < 3; i++) starsRow.append(h('span', { class: `star big${i < r.stars ? ' on' : ''}`, style: `animation-delay:${0.2 + i * 0.25}s` }, '★'));
    const used = Object.entries(r.used).map(([t, n]) => `${n} ${this.s.data.troops[t]?.name ?? t}`).join(', ');
    const title = r.stars === 3 ? 'Perfect raid!' : r.stars > 0 ? 'Victory!' : 'Defeat';
    const body = h(
      'div',
      { class: `results ${r.stars > 0 ? 'win' : 'loss'}` },
      starsRow,
      h('p', { class: 'result-pct' }, `${r.destruction}% destroyed`),
      note ? h('p', { class: 'note' }, note) : null,
      this.deps.grove
        ? h('p', { class: 'muted' }, 'Your stars count toward the Alliance War.')
        : this.deps.practice
          ? h('p', { class: 'muted' }, 'Loot it would have won: ', lootChips(r.loot))
        : pending
          ? h('p', {}, 'Loot won: ', lootChips(r.loot), h('span', { class: 'muted small' }, ' (confirming with the server; it arrives when the server accepts the attack)'))
          : h('p', {}, this.deps.trial ? 'Reward: ' : 'Loot: ', lootChips(banked)),
      this.deps.grove || this.deps.trial || this.deps.practice || pending ? '' : h('p', {}, 'Honor: ', h('span', { class: `chip ${trophies >= 0 ? 'good' : 'short'}` }, icon(icons.leaf), `${trophies >= 0 ? '+' : ''}${trophies}`)),
      bonus && Object.keys(bonus).length ? h('p', { class: 'muted small' }, 'Includes your league bonus: ', lootChips(bonus)) : null,
      eventBonus && Object.keys(eventBonus).length ? h('p', { class: 'muted small' }, 'Includes the event bonus: ', lootChips(eventBonus)) : null,
      ...closeCalls(this.s.sim, this.s.data).map((cc) => h('p', { class: 'close-call' }, cc.text)),
      used ? h('p', { class: 'muted small' }, `Troops used: ${used}`) : null,
      // The settlement says exactly what did not fit; nothing is inferred from totals.
      overflow && Object.values(overflow).some((v) => (v ?? 0) > 0) ? h('p', { class: 'note' }, 'Did not fit in your storage: ', lootChips(overflow)) : null,
    );
    this.modal(title, body, [
      { label: 'Watch replay', onClick: () => this.deps.onReplay() },
      { label: 'Return home', primary: true, onClick: () => this.deps.onHome() },
    ], false);
  }

  toast(text: string): void {
    const t = h('div', { class: 'toast' }, text);
    this.toastEl.append(t);
    while (this.toastEl.childElementCount > 2) this.toastEl.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add('out'), 1800);
    window.setTimeout(() => t.remove(), 2200);
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
