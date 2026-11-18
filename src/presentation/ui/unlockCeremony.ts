/**
 * A short moment when a new warrior unlocks (retention audit G22): the badge pops in with the name, for a few
 * seconds. A tap anywhere skips it; "Train" opens the Army panel. Reduced motion shows it without any movement
 * (the global rule in styles.css). It never covers a battle or a dialog: the HUD waits for a calm moment.
 */
import { t } from './i18n';
import { h } from './dom';
import { reducedMotion, uiArt } from './feedback';

const KEY = 'tk.troopsKnown';
/** How long the card stays when nobody taps it. */
export const CEREMONY_MS = 4500;

/**
 * Troops unlocked since last time. The first time (nothing stored) is silent: an existing village never gets a
 * ceremony for warriors it already had.
 */
export function newUnlocks(known: readonly string[] | null, now: readonly string[]): string[] {
  if (!known) return [];
  const had = new Set(known);
  return now.filter((id) => !had.has(id));
}

export function loadKnown(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function saveKnown(ids: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids].sort()));
  } catch {
    /* no storage: the next start is silent again */
  }
}

interface CeremonyWarrior {
  name: string;
  badge: string | null;
}

/** Show the card in `root`; resolves when it is gone. */
export function showCeremony(root: HTMLElement, warriors: CeremonyWarrior[], onTrain: () => void): Promise<void> {
  return new Promise((resolve) => {
    const shown = warriors.slice(0, 3);
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (reducedMotion()) {
        card.remove();
        resolve();
        return;
      }
      card.classList.add('out');
      window.setTimeout(() => {
        card.remove();
        resolve();
      }, 220);
    };
    const train = h('button', { class: 'btn primary', type: 'button' }, t('unlock.train'));
    train.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      onTrain();
    });
    const card = h(
      'div',
      { class: 'ceremony', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'ceremony-card' },
        h('p', { class: 'ceremony-title' }, t('unlock.title', { n: warriors.length })),
        h('div', { class: 'ceremony-badges' }, ...shown.map((w) => h('figure', {}, w.badge ? h('img', { src: w.badge, alt: '' }) : null, h('figcaption', {}, w.name)))),
        h('div', { class: 'actions' }, train, h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, t('unlock.later'))),
      ),
    );
    card.addEventListener('click', () => close());
    root.append(card);
    uiArt.haptic('success');
    const timer = window.setTimeout(close, CEREMONY_MS);
  });
}

/**
 * P6-08 (UIS-06, BNL-08, PLY-12): the same card for any milestone: a title, up to three icons, up to three lines and
 * one button. A league change, each Keep level (its unlock list, before any offer), the hero at his Keep, tempering.
 */
export interface Milestone {
  title: string;
  icons?: (string | null)[];
  lines?: string[];
  button?: { label: string; onClick(): void };
}

export function showMilestone(root: HTMLElement, m: Milestone): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (reducedMotion()) {
        card.remove();
        resolve();
        return;
      }
      card.classList.add('out');
      window.setTimeout(() => {
        card.remove();
        resolve();
      }, 220);
    };
    const act = m.button ? h('button', { class: 'btn primary', type: 'button' }, m.button.label) : null;
    act?.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      m.button!.onClick();
    });
    const icons = (m.icons ?? []).filter((x): x is string => Boolean(x)).slice(0, 3);
    const card = h(
      'div',
      { class: 'ceremony milestone', role: 'status', 'aria-live': 'polite', 'data-id': 'milestone' },
      h('div', { class: 'ceremony-card' },
        h('p', { class: 'ceremony-title' }, m.title),
        icons.length ? h('div', { class: 'ceremony-badges' }, ...icons.map((src) => h('figure', {}, h('img', { src, alt: '' })))) : null,
        ...(m.lines ?? []).slice(0, 3).map((l) => h('p', { class: 'small' }, l)),
        h('div', { class: 'actions' }, act, h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, t('unlock.later'))),
      ),
    );
    card.addEventListener('click', () => close());
    root.append(card);
    uiArt.haptic('success');
    const timer = window.setTimeout(close, CEREMONY_MS + 1500);
  });
}

const MILESTONES_KEY = 'tk.milestones';

/** What the device has already celebrated (null: never stored, so the first look is silent). */
export interface MilestoneMarks {
  league: string;
  keep: number;
  hero: boolean;
  temper: boolean;
}

export function loadMarks(): MilestoneMarks | null {
  try {
    const v = JSON.parse(localStorage.getItem(MILESTONES_KEY) ?? 'null') as Partial<MilestoneMarks> | null;
    return v && typeof v.keep === 'number' && typeof v.league === 'string' ? { league: v.league, keep: v.keep, hero: Boolean(v.hero), temper: Boolean(v.temper) } : null;
  } catch {
    return null;
  }
}

export function saveMarks(m: MilestoneMarks): void {
  try {
    localStorage.setItem(MILESTONES_KEY, JSON.stringify(m));
  } catch {
    /* no storage: the next start is silent again */
  }
}

/** The milestones between what the device saw and what is true now (in the order to show them). */
export function milestonesDue(seen: MilestoneMarks | null, now: MilestoneMarks): ('league' | 'keep' | 'hero' | 'temper')[] {
  if (!seen) return [];
  const out: ('league' | 'keep' | 'hero' | 'temper')[] = [];
  if (now.keep > seen.keep) out.push('keep');
  if (now.hero && !seen.hero) out.push('hero');
  if (now.temper && !seen.temper) out.push('temper');
  if (now.league !== seen.league) out.push('league');
  return out;
}
