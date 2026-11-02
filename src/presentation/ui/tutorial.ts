import type { Analytics } from '../../backend/analytics/events';
import type { GameController } from '../../gameplay/control/controller';
import type { VillageState } from '../../gameplay/sim/types';
import { clear, h, icon } from './dom';
import { icons } from './icons';

interface Step {
  text: string;
  /** CSS selector of the thing to point at (first visible match wins). */
  targets?: string[];
  done?: (s: VillageState) => boolean;
  button?: string;
}

const has = (s: VillageState, type: string) => s.buildings.some((b) => b.type === type);
const hall = (s: VillageState) => s.buildings.find((b) => b.type === 'elder_toadstool')!;
const armySize = (s: VillageState) => Object.values(s.army).reduce((a, b) => a + b, 0);

const STEPS: Step[] = [
  { text: "Welcome, young ruler! I'm the Clan Keep. Let's grow your village together.", button: "Let's go!" },
  { text: 'First, food for the village. Tap Build and place a Coin Mint.', targets: ['.round-btn.ok', '.shop-card', '.round-btn.build'], done: (s) => has(s, 'acorn_orchard') },
  { text: 'Now upgrade me! Tap the Clan Keep (the big mushroom), then Upgrade.', targets: ['.sheet .btn.upgrade'], done: (s) => Boolean(hall(s).upgrade) || hall(s).level >= 2 },
  { text: "Upgrades take time, but you have Jade. Tap Finish now to complete it instantly!", targets: ['.modal .btn.primary', '.sheet .btn.gold'], done: (s) => hall(s).level >= 2 },
  { text: 'Every ruler needs an army. Build a Training Dojo and a Squad Courtyard (Build, then the Army tab).', targets: ['.round-btn.ok', '.shop-tabs button:nth-child(2)', '.round-btn.build'], done: (s) => has(s, 'burrow_barracks') && has(s, 'army_camp') },
  { text: 'When they are ready, open the Army panel and train some Shinobi.', targets: ['.troop-row .btn.primary', '.round-btn[aria-label="Army"]'], done: (s) => s.training.length > 0 || armySize(s) > 0 },
  { text: 'Use a few Jade again: tap Finish training.', targets: ['.modal-backdrop:last-child .btn.primary', '.training .btn.gold', '.round-btn[aria-label="Army"]'], done: (s) => armySize(s) > 0 && s.training.length === 0 },
  { text: 'Time for adventure! Tap Attack, then Attack! and tap the grass outside the red area to send your troops.', targets: ['.big-attack', '.round-btn.attack'], done: (s) => s.battleLog.length > 0 },
  { text: 'Wonderful! Collect resources, upgrade, raid, and join an Alliance for friends. Have fun!', button: 'Finish' },
];

/** Guided first steps. Points at buttons and moves on when the player has done each thing. */
export class Tutorial {
  private bubble = h('div', { class: 'tut-bubble' });
  private ring = h('div', { class: 'tut-ring' });
  private timer = 0;

  constructor(
    private readonly c: GameController,
    private readonly analytics: Analytics,
    root: HTMLElement,
  ) {
    this.bubble.hidden = true;
    this.ring.hidden = true;
    root.append(this.ring, this.bubble);
  }

  start(): void {
    if (this.c.state.tutorial.done) return;
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 400);
  }

  restart(): void {
    this.c.dispatch({ type: 'tutorial', step: 0, done: false });
    this.start();
  }

  private go(step: number): void {
    const done = step >= STEPS.length;
    this.c.dispatch({ type: 'tutorial', step, done });
    this.analytics.log('tutorial_step', { step, done });
    if (done) {
      window.clearInterval(this.timer);
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    this.render();
  }

  private render(): void {
    const t = this.c.state.tutorial;
    const step = STEPS[t.step];
    if (!step || t.done) {
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    clear(this.bubble);
    this.bubble.hidden = false;
    const skip = h('button', { class: 'tut-skip', type: 'button' }, 'Skip tutorial');
    skip.addEventListener('click', () => this.go(STEPS.length));
    const actions = h('div', { class: 'tut-actions' }, t.step < STEPS.length - 1 ? skip : '');
    if (step.button) {
      const b = h('button', { class: 'btn primary', type: 'button' }, step.button);
      b.addEventListener('click', () => this.go(t.step + 1));
      actions.append(b);
    }
    this.bubble.append(h('div', { class: 'tut-face' }, icon(icons.toadstool)), h('div', { class: 'tut-body' }, h('p', {}, step.text), actions));
  }

  private tick(): void {
    const t = this.c.state.tutorial;
    if (t.done) return;
    const step = STEPS[t.step];
    if (!step) return;
    if (step.done?.(this.c.state)) {
      this.go(t.step + 1);
      return;
    }
    // Get out of the way of open panels.
    this.bubble.classList.toggle('low', Boolean(document.querySelector('.modal-backdrop')));
    // Point at the first visible target.
    let el: Element | null = null;
    for (const sel of step.targets ?? []) {
      const found = [...document.querySelectorAll(sel)].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !(e.closest('[hidden]'));
      });
      if (found) {
        el = found;
        break;
      }
    }
    if (!el) {
      this.ring.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    this.ring.hidden = false;
    Object.assign(this.ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  }
}
