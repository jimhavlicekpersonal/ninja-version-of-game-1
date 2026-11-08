import { displayData as localizedData } from './i18n';
import { t } from './i18n';
import type { Analytics } from '../../backend/analytics/events';
import type { GameController } from '../../gameplay/control/controller';
import type { VillageState } from '../../gameplay/sim/types';
import { trainingSkipQuote } from '../../gameplay/sim/village';
import { buildingOnScreen, type ScreenRect } from '../render/anchors';
import { clear, h, icon } from './dom';
import { uiArt, type SenseiMood } from './feedback';
import { formatDuration } from './format';
import { icons } from './icons';

interface Step {
  /** A name for analytics; the save stores the step's index, so the list keeps nine steps in this order. */
  id: string;
  text: string | ((s: VillageState, c: GameController) => string);
  /** CSS selectors of the thing to point at (first visible match wins); a function picks them from the village. */
  targets?: string[] | ((s: VillageState) => string[]);
  /** A building on the map to point at when no target is on screen. */
  mapTarget?: string | ((s: VillageState) => string | null);
  done?: (s: VillageState, c: GameController) => boolean;
  button?: string | (() => string);
  mood?: SenseiMood;
}

const HALL = 'elder_toadstool';
const MINT = 'acorn_orchard';
const TOWER = 'acorn_cannon';
const has = (s: VillageState, type: string) => s.buildings.some((b) => b.type === type);
const hall = (s: VillageState) => s.buildings.find((b) => b.type === HALL)!;
const armySize = (s: VillageState) => Object.values(s.army).reduce((a, b) => a + b, 0);
/** "3m 20s" until a timer ends, or '' once it has. */
const waitText = (endsAt: number | undefined, now: number) => (endsAt && endsAt > now ? formatDuration(endsAt - now) : '');
const lastTrainingEnd = (s: VillageState) => s.training.reduce((m, q) => Math.max(m, q.endsAt), 0);
const ARMY_BUILDINGS = ['burrow_barracks', 'army_camp', TOWER];

// Keep nine steps in this order: saved progress stores the step index (re-audit design item 3 changed what some
// steps ask, never their number or position).
const STEPS: Step[] = [
  { id: 'welcome', text: () => t('tutorial.welcome'), button: () => t('tutorial.welcome.button'), mood: 'smile' },
  {
    id: 'mint',
    // Build, then collect: the first thing a Mint gives back.
    text: (s) => (has(s, MINT) ? t('tutorial.mint.collect') : t('tutorial.mint.build')),
    targets: (s) => (has(s, MINT) ? [`.sheet[data-type="${MINT}"] .btn.collect`] : ['.round-btn.ok', `.shop-card[data-type="${MINT}"]`, '.shop-tabs button[data-tab="resources"]', '.round-btn.build']),
    mapTarget: (s) => (has(s, MINT) ? MINT : null),
    done: (s) => has(s, MINT) && s.stats.collectedAcorns > 0,
  },
  {
    id: 'keep',
    text: () => t('tutorial.keep'),
    // Only the Keep's own sheet: the ring never lands on another building's Upgrade.
    targets: [`.sheet[data-type="${HALL}"] .btn.upgrade:not(:disabled)`],
    mapTarget: HALL,
    done: (s) => Boolean(hall(s).upgrade) || hall(s).level >= 2,
  },
  {
    id: 'finishKeep',
    // Waiting first, Jade second.
    text: (s, c) => {
      const left = waitText(hall(s).upgrade?.endsAt, c.now());
      return left ? t('tutorial.finishKeep.wait', { time: left }) : t('tutorial.finishKeep.done');
    },
    targets: [`.sheet[data-type="${HALL}"] .btn.gold`, '.modal .btn.primary'],
    mapTarget: HALL,
    done: (s) => hall(s).level >= 2,
    mood: 'calm',
  },
  {
    id: 'army',
    text: (s) => {
      const missing = ARMY_BUILDINGS.filter((t) => !has(s, t));
      if (missing.length === 1 && missing[0] === TOWER) return t('tutorial.army.tower');
      return t('tutorial.army.all');
    },
    targets: (s) =>
      ['.round-btn.ok', ...ARMY_BUILDINGS.filter((t) => !has(s, t)).map((t) => `.shop-card[data-type="${t}"]`), `.shop-tabs button[data-tab="${has(s, 'burrow_barracks') && has(s, 'army_camp') ? 'defense' : 'army'}"]`, '.round-btn.build'],
    done: (s) => ARMY_BUILDINGS.every((t) => has(s, t)),
  },
  { id: 'train', text: () => t('tutorial.train'), targets: ['.troop-row .btn.primary', '.round-btn[data-id="army"]'], done: (s) => s.training.length > 0 || armySize(s) > 0 },
  {
    id: 'finishTrain',
    text: (s, c) => {
      const left = waitText(lastTrainingEnd(s), c.now());
      return left ? t('tutorial.finishTrain.wait', { time: left }) : t('tutorial.finishTrain.done');
    },
    targets: ['.modal-backdrop:last-child .btn.primary', '.training .btn.gold', '.round-btn[data-id="army"]'],
    done: (s, c) => armySize(s) > 0 && (s.training.length === 0 || !trainingSkipQuote(s, c.now(), localizedData(c.data))),
  },
  {
    id: 'raid',
    text: () => t('tutorial.raid'),
    targets: ['.big-attack', '.round-btn.attack'],
    done: (s) => s.battleLog.some((r) => r.kind === 'attack'),
    mood: 'stern',
  },
  { id: 'end', text: () => t('tutorial.end'), button: () => t('tutorial.end.button'), mood: 'smile' },
];

/** Guided first steps. Points at buttons and moves on when the player has done each thing. */
export class Tutorial {
  private bubble = h('div', { class: 'tut-bubble' });
  private ring = h('div', { class: 'tut-ring' });
  private timer = 0;
  private text = h('p', {});
  private lastStep = -1;

  constructor(
    private readonly c: GameController,
    private readonly analytics: Analytics,
    root: HTMLElement,
  ) {
    this.bubble.hidden = true;
    this.ring.hidden = true;
    root.append(this.ring, this.bubble);
  }

  private get index(): number {
    return this.c.state.tutorial.step;
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
    this.analytics.log('tutorial_step', { step, id: STEPS[step]?.id ?? 'done', done });
    if (done) {
      window.clearInterval(this.timer);
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    this.render();
  }

  private render(): void {
    const tut = this.c.state.tutorial;
    const i = this.index;
    const step = STEPS[i];
    if (!step || tut.done) {
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    this.lastStep = i;
    clear(this.bubble);
    this.bubble.hidden = false;
    const skip = h('button', { class: 'tut-skip', type: 'button' }, t('tutorial.skip'));
    skip.addEventListener('click', () => this.go(STEPS.length));
    const actions = h('div', { class: 'tut-actions' }, i < STEPS.length - 1 ? skip : '');
    if (step.button) {
      const b = h('button', { class: 'btn primary', type: 'button' }, typeof step.button === 'function' ? step.button() : step.button);
      b.addEventListener('click', () => this.go(i + 1));
      actions.append(b);
    }
    this.text = h('p', {}, this.stepText(step));
    // Sensei Hoshi's portrait from the ART compartment when the composition root provided it (re-audit item 14).
    const face = h('div', { class: 'tut-face' });
    if (uiArt.senseiPortrait) face.innerHTML = uiArt.senseiPortrait(step.mood ?? 'calm');
    else face.append(icon(icons.toadstool));
    this.bubble.append(face, h('div', { class: 'tut-body' }, h('p', { class: 'tut-step' }, t('tutorial.step', { n: i + 1, total: STEPS.length })), this.text, actions));
  }

  private stepText(step: Step): string {
    return typeof step.text === 'function' ? step.text(this.c.state, this.c) : step.text;
  }

  private tick(): void {
    const t = this.c.state.tutorial;
    if (t.done) {
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    const i = this.index;
    const step = STEPS[i];
    if (!step) return;
    if (step.done?.(this.c.state, this.c)) {
      this.go(i + 1);
      return;
    }
    if (i !== this.lastStep) this.render();
    // Countdowns in the text ("ready in 3m") stay current.
    const text = this.stepText(step);
    if (this.text.textContent !== text) this.text.textContent = text;
    // Never cover the battlefield: the battle HUD has its own one-line coach for the first raid.
    const inBattle = document.getElementById('battle-hud')?.hidden === false;
    this.bubble.hidden = inBattle;
    if (inBattle) {
      this.ring.hidden = true;
      return;
    }
    this.place();
    // Point at the first visible target, else at the building on the map.
    let r: ScreenRect | null = null;
    const targets = typeof step.targets === 'function' ? step.targets(this.c.state) : step.targets ?? [];
    for (const sel of targets) {
      // With a dialog open, only something inside the top dialog can be tapped: never ring a button under it.
      const top = [...document.querySelectorAll('.modal-backdrop')].pop() ?? null;
      const found = [...document.querySelectorAll(sel)].find((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && !e.closest('[hidden]') && (!top || top.contains(e));
      });
      if (found) {
        r = found.getBoundingClientRect();
        break;
      }
    }
    const modalOpen = Boolean(document.querySelector('.modal-backdrop'));
    const onMap = typeof step.mapTarget === 'function' ? step.mapTarget(this.c.state) : step.mapTarget;
    if (!r && onMap && !modalOpen) r = buildingOnScreen(onMap);
    if (!r) {
      this.ring.hidden = true;
      return;
    }
    this.ring.hidden = false;
    Object.assign(this.ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  }

  /**
   * Keep the bubble off what the player needs: at the bottom while a sheet or panel is open (the Build/Attack bar is
   * not needed then); otherwise under the top bar and its event line, and clear of the side rail.
   */
  private place(): void {
    const sheet = document.querySelector('#hud .sheet:not([hidden])');
    const low = Boolean(document.querySelector('.modal-backdrop')) || Boolean(sheet);
    this.bubble.classList.toggle('low', low);
    const st = this.bubble.style;
    if (low) {
      st.top = '';
      st.right = '';
      st.left = '';
      st.width = '';
      st.transform = '';
      return;
    }
    const head = document.querySelector('#hud .hud-head');
    const rows = head ? [...head.children].filter((e) => !e.classList.contains('toasts')) : [];
    const below = Math.max(0, ...rows.map((e) => e.getBoundingClientRect().bottom));
    const rail = document.querySelector('#hud .side-rail:not([hidden])')?.getBoundingClientRect();
    const vw = window.innerWidth;
    const right = rail && rail.width ? vw - rail.left + 6 : 12;
    st.top = `${Math.round(below + 8)}px`;
    st.left = '12px';
    st.right = `${Math.round(right)}px`;
    st.width = 'auto';
    st.transform = 'none';
  }
}
