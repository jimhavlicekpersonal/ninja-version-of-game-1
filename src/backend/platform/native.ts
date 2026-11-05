/** Native-only services for the iOS/Android app (Capacitor). */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Reminder } from '../../gameplay/sim/reminders';
import type { ReminderService } from './reminders';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platform = (): string => Capacitor.getPlatform();

function numericId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

/** Real local notifications, scheduled when the game goes to the background. */
export class NativeReminders implements ReminderService {
  readonly note = 'The app reminds you even when the game is closed.';

  async enable(): Promise<boolean> {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  }

  async schedule(list: Reminder[]): Promise<void> {
    await this.cancelAll();
    const now = Date.now();
    // Reminders are never exact alarms: the app does not ask for SCHEDULE_EXACT_ALARM (removed from the merged
    // Android manifest, re-audit), and exact ones would open the system's "Alarms & reminders" screen.
    const notifications = list
      .filter((r) => r.at > now + 5000)
      .slice(0, 20)
      .map((r) => ({ id: numericId(r.id), title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true }, isExactNotification: false }));
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  }

  async cancelAll(): Promise<void> {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}
