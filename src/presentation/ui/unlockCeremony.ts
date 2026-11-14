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

export interface CeremonyWarrior {
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
