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
