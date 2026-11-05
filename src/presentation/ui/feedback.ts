/**
 * Feel and art the HUD borrows from the ART compartment (re-audit design items 11, 14, 15): haptics, the Sensei
 * portrait and the daily chest. GUI may import only the art contract files (compartments.json), so the composition
 * root (`src/main.ts`) hands these in once with `provideUiArt`; until then they are no-ops and the HUD falls back to
 * its icons. Everything a result screen does for feel goes through `celebrate`, in one place.
 */
import { sound } from '../audio/sound';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'selection';
export type SenseiMood = 'calm' | 'smile' | 'stern' | 'surprised';

export interface UiArtHooks {
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

export const uiArt: UiArtHooks = { haptic: () => undefined, senseiPortrait: null, chestSvg: null, revealChest: null, hapticsSetting: null };

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

/** Sound and haptics for the big moments of a result screen. */
export function celebrate(moment: 'star' | 'victory' | 'defeat' | 'perfect'): void {
  if (moment === 'star') {
    sound.play('star');
    uiArt.haptic('success');
  } else if (moment === 'perfect') {
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
