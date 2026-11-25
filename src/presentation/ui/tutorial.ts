import { displayData as localizedData } from './i18n';
import { t } from './i18n';
import type { Analytics } from '../../backend/analytics/events';
import type { GameController } from '../../gameplay/control/controller';
import type { VillageState } from '../../gameplay/sim/types';
import { builderStatus, trainingSkipQuote } from '../../gameplay/sim/village';
import { chestReady } from '../../gameplay/sim/daily';
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
  /** A second line under the text, when it applies. */
  extra?: (s: VillageState, c: GameController) => string;
  /** Pressing the step's button also does this (after the step ends). */
  after?: (c: GameController) => void;
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
    // P3-04 (PAC-04): no ring on the Jade "Finish now"; the step ends once the Keep is building and an Artisan is free,
    // so the army steps run while it builds.
    targets: [],
    mapTarget: HALL,
    done: (s, c) => hall(s).level >= 2 || (Boolean(hall(s).upgrade) && builderStatus(s, localizedData(c.data), c.now()).free > 0),
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
    // P3-04: the Jade "Finish training" and its confirm are no longer ringed; the text still names the choice.
    targets: ['.round-btn[data-id="army"]'],
    done: (s, c) => armySize(s) > 0 && (s.training.length === 0 || !trainingSkipQuote(s, c.now(), localizedData(c.data))),
  },
  {
    id: 'raid',
    text: () => t('tutorial.raid'),
    targets: ['.big-attack', '.round-btn.attack'],
    done: (s) => s.battleLog.some((r) => r.kind === 'attack'),
    mood: 'stern',
  },
  {
    id: 'end',
    text: () => t('tutorial.end'),
    button: () => t('tutorial.end.button'),
    mood: 'smile',
    // Retention audit G6 / P3-11 (PLY-04): the last step points at the Keep first (after the first raid storage is often
    // nearly full) and the daily chest second: its line says Finish opens it while it is ready.
    targets: [`.sheet[data-type="${HALL}"] .btn.upgrade:not(:disabled)`],
    mapTarget: HALL,
    extra: (s, c) => (chestReady(s, c.now(), localizedData(c.data)) ? t('tutorial.end.daily') : ''),
    after: (c) => {
      if (chestReady(c.state, c.now(), localizedData(c.data))) document.querySelector<HTMLElement>('.side-rail .round-btn[data-id="daily"]:not([hidden])')?.click();
    },
  },
];

/**
 * Chapter 2, Sensei's lessons (2026-11-25): after the nine guided steps, short lessons on what the first steps leave
 * out. They never block the game (every lesson has a button), point only at things that are on screen, and keep their
 * progress on this device (`tk.lessons`), not in the save: the nine steps above and the save format stay as they are.
 */
const TREASURY = 'acorn_silo';
const STOREHOUSE = 'dew_cistern';
const levelOf = (s: VillageState, type: string) => Math.max(0, ...s.buildings.filter((b) => b.type === type).map((b) => b.level));
const defenses = (s: VillageState, c: GameController) => s.buildings.filter((b) => c.data.buildings[b.type]?.category === 'defense').length;
const next = () => t('lesson.next');
const RAIL = (id: string) => [`.side-rail .round-btn[data-id="${id}"]:not([hidden])`];
const LESSONS: Step[] = [
  { id: 'lessons', text: () => t('lesson.intro'), button: () => t('lesson.intro.button'), mood: 'smile' },
  {
    id: 'storage',
    text: () => t('lesson.storage'),
    targets: [`.sheet[data-type="${TREASURY}"] .btn.upgrade:not(:disabled)`, `.sheet[data-type="${STOREHOUSE}"] .btn.upgrade:not(:disabled)`],
    mapTarget: TREASURY,
    done: (s) => levelOf(s, TREASURY) >= 2 && levelOf(s, STOREHOUSE) >= 2,
    button: next,
  },
  { id: 'collectAll', text: () => t('lesson.collectAll'), targets: ['[data-id="collect-all"]'], mapTarget: MINT, button: next },
  { id: 'artisans', text: () => t('lesson.artisans'), targets: ['.res-builders'], button: next, mood: 'calm' },
  { id: 'defenses', text: () => t('lesson.defenses'), targets: ['.round-btn.build'], done: (s, c) => defenses(s, c) >= 3, button: next, mood: 'stern' },
  { id: 'walls', text: () => t('lesson.walls'), targets: ['.round-btn.build'], button: next },
  { id: 'research', text: () => t('lesson.research'), targets: ['.army-tabs [role="tab"]:last-child', '.round-btn[data-id="army"]'], done: (s) => s.research.active.length > 0, button: next },
  { id: 'strategies', text: () => t('lesson.strategies'), targets: ['[data-id="strategies"] summary', '.round-btn[data-id="army"]'], button: next },
  { id: 'jade', text: () => t('lesson.jade'), targets: ['.army-buys .btn.buy', '.round-btn[data-id="army"]'], button: next, mood: 'calm' },
  { id: 'saveArmy', text: () => t('lesson.saveArmy'), targets: ['.round-btn[data-id="army"]'], done: (s) => s.armyPresets.length > 0, button: next },
  { id: 'scout', text: () => t('lesson.scout'), targets: ['.round-btn.attack'], button: next, mood: 'stern' },
  { id: 'abilities', text: () => t('lesson.abilities'), button: next, mood: 'stern' },
  { id: 'shield', text: () => t('lesson.shield'), button: next, mood: 'calm' },
  { id: 'defenseLog', text: () => t('lesson.defenseLog'), targets: ['.round-btn[data-id="log"]'], button: next },
  { id: 'daily', text: () => t('lesson.daily'), targets: RAIL('daily'), button: next, mood: 'smile' },
  { id: 'trials', text: () => t('lesson.trials'), targets: RAIL('trials'), button: next },
  { id: 'alliance', text: () => t('lesson.alliance'), targets: RAIL('alliance'), button: next, mood: 'smile' },
  { id: 'lessonsEnd', text: () => t('lesson.end'), button: () => t('lesson.end.button'), mood: 'smile' },
];

/** Lessons start by themselves only for a young village; an older one can start them from Settings. */
const LESSONS_AUTO_MAX_KEEP = 4;
const LESSONS_KEY = 'tk.lessons';
interface LessonProgress {
  step: number;
  done: boolean;
}
function loadLessons(): LessonProgress | null {
  try {
    const v = JSON.parse(localStorage.getItem(LESSONS_KEY) ?? 'null') as LessonProgress | null;
    return v && Number.isInteger(v.step) && v.step >= 0 ? { step: v.step, done: Boolean(v.done) } : null;
  } catch {
    return null;
  }
}
function storeLessons(p: LessonProgress): void {
  try {
    localStorage.setItem(LESSONS_KEY, JSON.stringify(p));
  } catch {
    /* private mode: the lessons run for this session only */
  }
}

/** For tests: the lesson ids in order. */
export const LESSON_IDS = LESSONS.map((l) => l.id);

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Guided first steps. Points at buttons and moves on when the player has done each thing. */
export class Tutorial {
  private bubble = h('div', { class: 'tut-bubble' });
  private ring = h('div', { class: 'tut-ring' });
  private timer = 0;
  private text = h('p', {});
  private lastStep = -1;
  private scrolledFor = -1;
  /** Chapter 2 progress (null: not started on this device). */
  private lessons: LessonProgress | null = loadLessons();

  constructor(
    private readonly c: GameController,
    private readonly analytics: Analytics,
    root: HTMLElement,
    /** P6-09: asks before skipping (the HUD's confirm dialog); without it a skip is one tap, as before. */
    private readonly ask?: (title: string, text: string, confirmLabel: string) => Promise<boolean>,
  ) {
    this.bubble.hidden = true;
    this.ring.hidden = true;
    root.append(this.ring, this.bubble);
  }

  /** The running chapter: the nine guided steps (in the save), then the lessons (on this device), else nothing. */
  private get phase(): { steps: Step[]; index: number; lessons: boolean } | null {
    const tut = this.c.state.tutorial;
    if (!tut.done) return { steps: STEPS, index: tut.step, lessons: false };
    if (this.lessons && !this.lessons.done) return { steps: LESSONS, index: this.lessons.step, lessons: true };
    return null;
  }

  /** A finished first chapter starts the lessons once, for a young village. */
  private maybeBeginLessons(): void {
    if (this.lessons || !this.c.state.tutorial.done) return;
    const keep = this.c.state.buildings.find((b) => b.type === HALL)?.level ?? 1;
    if (keep > LESSONS_AUTO_MAX_KEEP) return;
    this.lessons = { step: 0, done: false };
    storeLessons(this.lessons);
  }

  start(): void {
    this.maybeBeginLessons();
    if (!this.phase) return;
    this.lastStep = -1;
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 400);
  }

  restart(): void {
    this.c.dispatch({ type: 'tutorial', step: 0, done: false });
    this.lessons = null;
    try {
      localStorage.removeItem(LESSONS_KEY);
    } catch {
      /* nothing stored */
    }
    this.start();
  }

  /** Settings → replay only the lessons (any village, the first chapter left as it is). */
  restartLessons(): void {
    if (!this.c.state.tutorial.done) return this.start();
    this.lessons = { step: 0, done: false };
    storeLessons(this.lessons);
    this.start();
  }

  private go(step: number): void {
    const ph = this.phase;
    if (ph?.lessons) {
      const done = step >= LESSONS.length;
      this.lessons = { step, done };
      storeLessons(this.lessons);
      // No analytics event: the server reads `tutorial_step` as the first chapter's funnel (done = tutorial done).
    } else {
      const done = step >= STEPS.length;
      this.c.dispatch({ type: 'tutorial', step, done });
      this.analytics.log('tutorial_step', { step, id: STEPS[step]?.id ?? 'done', done });
      if (done) this.maybeBeginLessons();
    }
    this.scrolledFor = -1;
    if (!this.phase) {
      window.clearInterval(this.timer);
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    this.lastStep = -1;
    this.render();
  }

  private render(): void {
    const ph = this.phase;
    const step = ph?.steps[ph.index];
    if (!ph || !step) {
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    const i = ph.index;
    const steps = ph.steps;
    this.lastStep = i;
    clear(this.bubble);
    this.bubble.hidden = false;
    // P6-09 (PLY-01): the skip link sits in the bubble's top corner, away from the bottom bar, and asks once (it was one
    // tap over the Army button, and a playtester skipped the whole tutorial twice by accident).
    const skipLabel = ph.lessons ? t('lesson.skip') : t('tutorial.skip');
    const skip = h('button', { class: 'tut-skip corner', type: 'button', 'data-id': ph.lessons ? 'lessons-skip' : 'tutorial-skip' }, skipLabel);
    skip.addEventListener('click', () => {
      if (!this.ask) return this.go(steps.length);
      void this.ask(skipLabel, ph.lessons ? t('lesson.skipAsk') : t('tutorial.skipAsk'), skipLabel).then((yes) => {
        // Skipping the first chapter also skips the lessons that would follow it.
        if (yes && !ph.lessons) {
          this.lessons = { step: LESSONS.length, done: true };
          storeLessons(this.lessons);
        }
        if (yes) this.go(steps.length);
      });
    });
    const actions = h('div', { class: 'tut-actions' });
    if (step.button) {
      const b = h('button', { class: 'btn primary', type: 'button' }, typeof step.button === 'function' ? step.button() : step.button);
      b.addEventListener('click', () => {
        this.go(i + 1);
        step.after?.(this.c);
      });
      actions.append(b);
    }
    this.text = h('p', {}, this.stepText(step));
    const extra = step.extra?.(this.c.state, this.c);
    // Sensei Hoshi's portrait from the ART compartment when the composition root provided it (re-audit item 14).
    const face = h('div', { class: 'tut-face' });
    if (uiArt.senseiPortrait) face.innerHTML = uiArt.senseiPortrait(step.mood ?? 'calm');
    else face.append(icon(icons.toadstool));
    // Beast Mode UX-08: the step label and Skip share one row that wraps, so a long translation or a larger text
    // size never draws one over the other (Skip used to sit absolutely in the corner).
    const label = ph.lessons ? t('lesson.step', { n: i + 1, total: steps.length }) : t('tutorial.step', { n: i + 1, total: steps.length });
    const head = h('div', { class: 'tut-head' }, h('p', { class: 'tut-step' }, label), i < steps.length - 1 ? skip : '');
    this.bubble.append(face, h('div', { class: 'tut-body' }, head, this.text, extra ? h('p', { class: 'tut-extra' }, extra) : null, actions));
  }

  private stepText(step: Step): string {
    return typeof step.text === 'function' ? step.text(this.c.state, this.c) : step.text;
  }

  private tick(): void {
    const ph = this.phase;
    if (!ph) {
      this.bubble.hidden = true;
      this.ring.hidden = true;
      return;
    }
    const i = ph.index;
    const step = ph.steps[i];
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
        // P6-09: a target outside its scroll box is scrolled into view once per step (the hit test there found the canvas).
        if (this.scrolledFor !== i && (r.top < 0 || r.top + r.height > window.innerHeight)) {
          this.scrolledFor = i;
          (found as HTMLElement).scrollIntoView?.({ block: 'nearest' });
          r = found.getBoundingClientRect();
        }
        break;
      }
    }
    const modalOpen = Boolean(document.querySelector('.modal-backdrop'));
    const onMap = typeof step.mapTarget === 'function' ? step.mapTarget(this.c.state) : step.mapTarget;
    if (!r && onMap && !modalOpen) {
      r = buildingOnScreen(onMap);
      // P6-09: never ring the map through an open sheet (it rang the Mint's Upgrade while the text asked for the Keep).
      const sheet = document.querySelector('#hud .sheet:not([hidden])')?.getBoundingClientRect();
      if (r && sheet && overlaps(r.left, r.left + r.width, sheet.left, sheet.right) && overlaps(r.top, r.top + r.height, sheet.top, sheet.bottom)) r = null;
    }
    this.place(onMap, r);
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
  private place(mapTarget?: string | null, ringed?: ScreenRect | null): void {
    const sheet = document.querySelector('#hud .sheet:not([hidden])');
    const modal = Boolean(document.querySelector('.modal-backdrop'));
    const low = modal || Boolean(sheet);
    this.bubble.classList.toggle('low', low);
    const st = this.bubble.style;
    if (low) {
      st.right = '';
      st.left = '';
      st.width = '';
      st.transform = '';
      st.top = '';
      // P6-09 (PLY-02): find the free band first. Over a sheet the bubble sits above it (never over the bottom bar,
      // never over the sheet's sticky action row); in a dialog at the bottom, or at the top when the target is there.
      const height = this.bubble.getBoundingClientRect().height;
      if (!height) return;
      const vh = window.innerHeight;
      const head = document.querySelector('#hud .hud-head');
      const below = Math.max(8, ...(head ? [...head.children].filter((e) => !e.classList.contains('toasts')).map((e) => e.getBoundingClientRect().bottom + 6) : []));
      const free = (y: number) => y >= 0 && y + height <= vh && !(ringed && overlaps(y, y + height, ringed.top - 8, ringed.top + ringed.height + 8));
      const choices: number[] = [];
      const sr = sheet?.getBoundingClientRect();
      // Sideways the sheet is a side panel: the bubble goes beside it, under the top bar.
      if (!modal && sr && window.innerWidth - sr.right >= 260) {
        const rail = document.querySelector('#hud .side-rail:not([hidden])')?.getBoundingClientRect();
        const railLeft = Boolean(rail && rail.width && rail.left < window.innerWidth / 2);
        st.left = `${Math.round(sr.right + 8)}px`;
        st.right = `${Math.round(rail && rail.width && !railLeft ? window.innerWidth - rail.left + 6 : 12)}px`;
        st.width = 'auto';
        st.transform = 'none';
        st.top = `${Math.round(below)}px`;
        st.bottom = 'auto';
        return;
      }
      if (!modal && sr) choices.push(Math.round(sr.top - height - 8), Math.round(below));
      else choices.push(Math.round(vh - height - 12), 8);
      const y = choices.find(free) ?? choices[0];
      st.top = `${Math.max(0, y)}px`;
      st.bottom = 'auto';
      return;
    }
    st.bottom = '';
    const head = document.querySelector('#hud .hud-head');
    const rows = head ? [...head.children].filter((e) => !e.classList.contains('toasts')) : [];
    const below = Math.max(0, ...rows.map((e) => e.getBoundingClientRect().bottom));
    const rail = document.querySelector('#hud .side-rail:not([hidden])')?.getBoundingClientRect();
    const vw = window.innerWidth;
    // Clear of the rail on whichever side it is (right-to-left languages put it on the left).
    const railLeft = Boolean(rail && rail.width && rail.left < vw / 2);
    const right = rail && rail.width && !railLeft ? vw - rail.left + 6 : 12;
    st.left = railLeft ? `${Math.round(rail!.right + 6)}px` : '12px';
    st.right = `${Math.round(right)}px`;
    st.width = 'auto';
    st.transform = 'none';
    // Art audit F13: on a phone the bubble under the top bar covered the Keep on the very first frame. When it would
    // cover the building this step is about (the Keep otherwise), it sits just above the bottom buttons instead.
    const top = Math.round(below + 8);
    st.top = `${top}px`;
    const target = buildingOnScreen(mapTarget ?? HALL);
    const height = this.bubble.getBoundingClientRect().height;
    const bar = document.querySelector('#hud .hud-bottom:not([hidden])')?.getBoundingClientRect();
    if (target && height && bar && overlaps(top, top + height, target.top, target.top + target.height)) {
      const low = Math.round(bar.top - height - 10);
      if (low > top && !overlaps(low, low + height, target.top, target.top + target.height)) st.top = `${low}px`;
    }
  }
}
