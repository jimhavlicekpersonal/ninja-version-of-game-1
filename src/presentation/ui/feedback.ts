/**
 * Feel and art the HUD borrows from the ART compartment (re-audit design items 11, 14, 15): haptics (re-exported by
 * the art contract `audio/sound.ts`), the Sensei portrait and the daily chest. `art/portraits.ts` and `art/chest.ts`
 * are not art contract files (compartments.json), so the composition root (`src/main.ts`) hands them in once with
 * `provideUiArt`; until then the HUD falls back to its icons. Everything a result screen does for feel goes through
 * `celebrate`, in one place.
 */
import { haptic, hapticsEnabled, setHapticsEnabled, sound, type HapticKind } from '../audio/sound';

export type { HapticKind };
export type SenseiMood = 'calm' | 'smile' | 'stern' | 'surprised';

interface UiArtHooks {
  /** `audio/haptics.ts` `haptic` (rate-limited, respects the player's switch). */
  haptic(kind: HapticKind): void;
  /** `art/portraits.ts` `senseiPortrait`: an SVG string. */
  senseiPortrait: ((mood: SenseiMood) => string) | null;
  /** `art/chest.ts` `chestSvg`: an SVG string. */
  chestSvg: ((state: 'closed' | 'open') => string) | null;
  /** `art/chest.ts` `revealChest`: plays the honest lid-opens-then-reward reveal in `host`. */
  revealChest: ((host: HTMLElement, reward: HTMLElement, opts?: { instant?: boolean; onOpen?: () => void }) => Promise<void>) | null;
  /** `audio/haptics.ts` switch, for Settings. */
  hapticsSetting: { get(): boolean; set(on: boolean): void } | null;
}

export const uiArt: UiArtHooks = { haptic, senseiPortrait: null, chestSvg: null, revealChest: null, hapticsSetting: { get: hapticsEnabled, set: setHapticsEnabled } };

/** Called once by the composition root. */
export function provideUiArt(hooks: Partial<UiArtHooks>): void {
  Object.assign(uiArt, hooks);
}

export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Longest exit animation (`.modal-backdrop.out` in styles.css): the element goes even if no animationend arrives. */
const EXIT_MS = 200;

/**
 * Remove a dialog backdrop with its exit motion (art audit F10: dialogs popped in but vanished in one frame). It is
 * marked `.out` at once (no longer the top dialog, no taps); with reduced motion it goes immediately.
 */
export function removeWithExit(el: HTMLElement): void {
  if (el.classList.contains('out')) return;
  el.classList.add('out');
  if (reducedMotion() || !el.isConnected) {
    el.remove();
    return;
  }
  const done = () => el.remove();
  el.addEventListener('animationend', (e) => {
    if (e.target === el) done();
  });
  window.setTimeout(done, EXIT_MS);
}

/** Sound and haptics for the big moments of a result screen. */
export function celebrate(moment: 'star' | 'victory' | 'defeat' | 'perfect'): void {
  if (moment === 'star') {
    sound.play('star');
    uiArt.haptic('success');
  } else if (moment === 'perfect') {
    sound.play('perfect');
    uiArt.haptic('heavy');
  } else {
    sound.play(moment);
    if (moment === 'victory') uiArt.haptic('medium');
  }
}

/** Count a number up from 0 (formatted by `fmt`); with reduced motion it shows the final number at once. */
export function countUp(el: HTMLElement, to: number, fmt: (n: number) => string, ms = 900, delay = 0): void {
  if (reducedMotion() || to <= 0) {
    el.textContent = fmt(to);
    return;
  }
  el.textContent = fmt(0);
  const start = performance.now() + delay;
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    // Ease out: fast at first, settling on the real number.
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - t, 3))));
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}
