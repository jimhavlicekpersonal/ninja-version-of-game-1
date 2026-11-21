/**
 * Server push on the installed app (roadmap step 40): ask permission, get
 * this device's APNs or FCM token (Capacitor Push Notifications), and let
 * `Connection.syncPush` tell the server which types it wants and its time
 * zone. The web build has no server push (a closed page cannot be reached).
 * Android needs the owner's Firebase project (`google-services.json`, roadmap
 * step 41); iPhone needs the Push Notifications capability in Xcode.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

interface PushDevice {
  token: string;
  platform: 'ios' | 'android';
}

let pending: Promise<PushDevice | null> | null = null;

/** STB-01: the Android build carries a Firebase configuration (VITE_ANDROID_PUSH=1, set by the workflow that writes it). */
export function androidPushBuilt(env: Record<string, unknown> = import.meta.env as Record<string, unknown>): boolean {
  return env.VITE_ANDROID_PUSH === '1';
}

/** This device's push token, asking permission the first time; null on the web, when refused, or when it fails. */
export function pushDevice(): Promise<PushDevice | null> {
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return Promise.resolve(null);
  // Beast Mode STB-01: on Android, PushNotifications.register() calls FirebaseMessaging.getInstance(), which throws
  // natively (and crashes the app) when the build has no google-services.json. Only a build made with it says so.
  if (platform === 'android' && !androidPushBuilt()) return Promise.resolve(null);
  if (!pending) {
    pending = (async () => {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return null;
      return new Promise<PushDevice | null>((resolve) => {
        void PushNotifications.addListener('registration', (t) => resolve({ token: t.value, platform }));
        void PushNotifications.addListener('registrationError', () => resolve(null));
        try {
          void PushNotifications.register().catch(() => resolve(null));
        } catch (e) {
          console.warn('Push registration failed', e);
          resolve(null);
        }
        setTimeout(() => resolve(null), 15_000);
      });
    })().catch(() => null);
    // A failure is asked again next time (permission granted later, a network problem).
    void pending.then((d) => {
      if (!d) pending = null;
    });
  }
  return pending;
}
