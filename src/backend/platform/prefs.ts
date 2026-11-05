/** Small on/off preferences kept in localStorage (per device). */
export type PrefKey = 'sessionReminder' | 'reminders' | 'crashReports';
type Key = PrefKey;
/**
 * crashReports: send crash reports when the build has a Sentry DSN. Off until the player switches it on in Settings
 * (opt-in, as the privacy policy and store declarations say). Devices that never touched the switch follow this
 * default, so they stopped sending when it changed from on to off (worldwide audit GLOBAL-019); an explicit choice
 * already stored ('1' or '0') is kept.
 */
export const PREF_DEFAULTS: Readonly<Record<Key, boolean>> = { sessionReminder: true, reminders: false, crashReports: false };
const DEFAULTS = PREF_DEFAULTS;

export const prefs = {
  get(k: Key): boolean {
    try {
      const v = localStorage.getItem(`tk.pref.${k}`);
      return v === null ? DEFAULTS[k] : v === '1';
    } catch {
      return DEFAULTS[k];
    }
  },
  set(k: Key, v: boolean): void {
    try {
      localStorage.setItem(`tk.pref.${k}`, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
};

/** Per-type notification choices (per device). Only used once notifications are switched on. */
export const notifyPrefs = {
  get(id: string, fallback: boolean): boolean {
    try {
      const v = localStorage.getItem(`tk.notify.${id}`);
      return v === null ? fallback : v === '1';
    } catch {
      return fallback;
    }
  },
  set(id: string, v: boolean): void {
    try {
      localStorage.setItem(`tk.notify.${id}`, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
  enabledSet(types: { id: string; default: boolean }[]): Set<string> {
    return new Set(types.filter((t) => notifyPrefs.get(t.id, t.default)).map((t) => t.id));
  },
};
