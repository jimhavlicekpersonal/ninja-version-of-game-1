/**
 * Reminder notifications. The installed iOS/Android app schedules real local
 * notifications (see nativeReminders in platform/native.ts). On the web, a page
 * cannot schedule notifications for after it closes, so the web version only
 * notifies while the game is still open in the background.
 */
import type { Reminder } from '../../gameplay/sim/reminders';

export interface ReminderService {
  readonly note: string;
  /** Ask for permission. Returns true if reminders can be shown. */
  enable(): Promise<boolean>;
  schedule(list: Reminder[]): Promise<void>;
  cancelAll(): Promise<void>;
}

export class WebReminders implements ReminderService {
  readonly note = 'On the web, reminders only arrive while the game is still open in the background. The installed app version can remind you when the game is closed.';
  private timers: number[] = [];

  async enable(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  }

  async schedule(list: Reminder[]): Promise<void> {
    await this.cancelAll();
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const now = Date.now();
    for (const r of list) {
      const delay = r.at - now;
      if (delay <= 0 || delay > 24 * 3_600_000) continue;
      this.timers.push(
        window.setTimeout(() => {
          const opts = { body: r.body, icon: './icons/icon-192.png', tag: r.id };
          navigator.serviceWorker?.ready
            .then((reg) => reg.showNotification(r.title, opts))
            .catch(() => new Notification(r.title, opts));
        }, delay),
      );
    }
  }

  async cancelAll(): Promise<void> {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }
}
