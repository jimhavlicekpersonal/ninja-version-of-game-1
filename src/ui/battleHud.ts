import type { BattleSession } from '../game/battleSession';
import type { BattleHooks } from '../render/BattleScene';
import { totalLoot } from '../sim/battle/basegen';
import type { BattleResult } from '../sim/battle/types';
import type { Cost, ResourceKind } from '../sim/types';
import { RESOURCE_KINDS } from '../sim/types';
import { clear, h, icon } from './dom';
import { formatNumber } from './format';
import { icons } from './icons';

export interface BattleHudDeps {
  root: HTMLElement;
  session: BattleSession;
  troopThumb(type: string): string | null;
  scoutFee: number;
  canPayFee(): boolean;
  onHome(): void;
  onNext(): void;
  onAttack(): void;
  /** Called once when a live battle ends; returns the loot actually banked. */
  onFinished(): { result: BattleResult; banked: Cost } | null;
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
      h('div', { class: 'muted small' }, this.s.mode === 'replay' ? 'Replay' : 'Loot you can win'),
      this.lootEl,
    );
    const right = h('div', { class: 'panel b-right' }, this.timerEl, this.starsEl, this.pctEl);
    root.append(left, right, this.toastEl, this.troopsEl, this.bottomEl, this.modalEl);
    // Pick the first available troop by default.
    this.selected = Object.keys(this.s.setup.army).find((t) => (this.s.sim.remaining[t] ?? 0) > 0) ?? null;
    this.renderBottom();
    this.renderTroops();
    this.tick();
    this.interval = window.setInterval(() => this.tick(), 100);
  }

  destroy(): void {
    window.clearInterval(this.interval);
    clear(this.deps.root);
    this.deps.root.hidden = true;
  }

  hooks(): BattleHooks {
    return {
      selectedTroop: () => this.selected,
      deployFailed: (reason) => {
        if (reason === 'zone') this.toast('Place troops outside the red area.');
        else if (reason === 'empty') this.toast('No more of that troop. Pick another.');
        else this.toast('Pick a troop below first.');
      },
      deployed: () => {
        if (this.s.mode === 'live') this.renderTroops();
        if ((this.s.sim.remaining[this.selected ?? ''] ?? 0) <= 0) {
          this.selected = Object.keys(this.s.setup.army).find((t) => (this.s.sim.remaining[t] ?? 0) > 0) ?? null;
          this.renderTroops();
        }
      },
    };
  }

  private renderBottom(): void {
    clear(this.bottomEl);
    const mode = this.s.mode;
    if (mode === 'scout') {
      const hasArmy = Object.values(this.s.setup.army).some((n) => n > 0);
      this.bottomEl.append(
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.deps.onHome() }, 'Home'),
        h(
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

  private renderTroops(): void {
    clear(this.troopsEl);
    if (this.s.mode === 'replay') return;
    for (const [type, total] of Object.entries(this.s.setup.army)) {
      if (total <= 0) continue;
      const left = this.s.sim.remaining[type] ?? 0;
      const thumb = this.deps.troopThumb(type);
      const card = h(
        'button',
        { class: `troop-card${this.selected === type ? ' on' : ''}${left <= 0 ? ' empty' : ''}`, type: 'button', 'aria-label': type },
        thumb ? h('img', { src: thumb, alt: '' }) : null,
        h('span', { class: 'troop-count' }, `×${left}`),
      );
      card.addEventListener('click', () => {
        if (left <= 0) return;
        this.selected = type;
        this.renderTroops();
      });
      this.troopsEl.append(card);
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
      if (this.lastStars >= 0 && stars > this.lastStars) this.starsEl.classList.add('bump');
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
        const type = el.getAttribute('aria-label') ?? '';
        const n = sim.remaining[type] ?? 0;
        const c = el.querySelector('.troop-count');
        if (c && c.textContent !== `×${n}`) c.textContent = `×${n}`;
        el.classList.toggle('empty', n <= 0);
      });
    }
    if (sim.ended && !this.finished && this.s.mode !== 'scout') {
      this.finished = true;
      if (this.s.mode === 'live') {
        const out = this.deps.onFinished();
        if (out) this.showResults(out.result, out.banked);
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

  private showResults(r: BattleResult, banked: Cost): void {
    const starsRow = h('div', { class: 'result-stars' });
    for (let i = 0; i < 3; i++) starsRow.append(h('span', { class: `star big${i < r.stars ? ' on' : ''}`, style: `animation-delay:${0.2 + i * 0.25}s` }, '★'));
    const used = Object.entries(r.used).map(([t, n]) => `${n} ${this.s.data.troops[t]?.name ?? t}`).join(', ');
    const title = r.stars === 3 ? 'Perfect raid!' : r.stars > 0 ? 'Victory!' : 'Defeat';
    const body = h(
      'div',
      { class: 'results' },
      starsRow,
      h('p', { class: 'result-pct' }, `${r.destruction}% destroyed`),
      h('p', {}, 'Loot: ', lootChips(banked)),
      used ? h('p', { class: 'muted small' }, `Troops used: ${used}`) : null,
      Object.entries(banked).some(([k, v]) => v < (r.loot[k as ResourceKind] ?? 0)) ? h('p', { class: 'note' }, 'Some loot did not fit in your storage.') : null,
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
