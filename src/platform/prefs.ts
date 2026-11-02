/** Small on/off preferences kept in localStorage (per device). */
type Key = 'sessionReminder' | 'reminders';
const DEFAULTS: Record<Key, boolean> = { sessionReminder: true, reminders: false };

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
