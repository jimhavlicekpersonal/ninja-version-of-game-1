/**
 * Haptic feedback (art re-audit item 6). In the iOS and Android apps it uses the Capacitor Haptics
 * plugin (Taptic Engine / Android vibrator effects). On the web it is a no-op except for the few
 * strong moments (a building falls, a star is won), which use a very short `navigator.vibrate` on
 * touch devices that support it (Android Chrome); iOS Safari has no vibrate, so nothing happens.
 *
 * The player can switch it off in Settings (GUI: `setHapticsEnabled`); the choice is stored in
 * localStorage `tk.haptics` ('1' on, '0' off) and defaults to on. Calls are rate-limited, so a
 * busy battle never turns into a continuous buzz.
 *
 * Wiring: BattleScene calls `haptic('light')` on deploy, `haptic('medium')` when a building is
 * destroyed, `haptic('heavy')` for the Keep, `haptic('success')` for each star. The GUI calls
 * `haptic('selection')` when a troop card is picked.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'selection';

export const HAPTICS_STORAGE_KEY = 'tk.haptics';

/** Minimum milliseconds between two haptics of the same kind. */
const GAP_MS: Record<HapticKind, number> = { light: 60, medium: 90, heavy: 250, success: 200, selection: 35 };
/** Web vibration patterns (ms): only the strong moments, kept very short. */
const WEB_PATTERN: Partial<Record<HapticKind, number | number[]>> = { medium: 12, heavy: 28, success: [14, 50, 22] };

let enabled: boolean | null = null;
/** iOS and Android only play selection ticks between selectionStart and selectionEnd; we start once and keep it open. */
let selectionOpen = false;
const last = new Map<HapticKind, number>();

function read(): boolean {
  try {
    return localStorage.getItem(HAPTICS_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Whether haptics are on (default on). */
export function hapticsEnabled(): boolean {
  if (enabled === null) enabled = read();
  return enabled;
}

/** Switch haptics on or off and remember the choice. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(HAPTICS_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: the choice lasts for this session */
  }
}

function native(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function coarse(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Play one haptic. Safe to call anywhere; never throws and never waits. */
export function haptic(kind: HapticKind): void {
  if (!hapticsEnabled()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (last.get(kind) ?? -Infinity) < GAP_MS[kind]) return;
  last.set(kind, now);
  if (native()) {
    const p =
      kind === 'selection' ? (selectionOpen ? Haptics.selectionChanged() : ((selectionOpen = true), Haptics.selectionStart().then(() => Haptics.selectionChanged())))
      : kind === 'success' ? Haptics.notification({ type: NotificationType.Success })
      : Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy });
    void p.catch(() => undefined);
    return;
  }
  const pattern = WEB_PATTERN[kind];
  if (pattern === undefined || !coarse() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* blocked until the first user gesture */
  }
}
