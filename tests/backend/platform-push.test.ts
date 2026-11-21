/** Beast Mode 2026-11-21 STB-01: Android registered for push without Firebase (a native crash, every launch). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const register = vi.fn(async () => undefined);
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { requestPermissions: async () => ({ receive: 'granted' }), addListener: async () => ({ remove: async () => undefined }), register },
}));

const read = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');

describe('STB-01: Android push only in builds with Firebase', () => {
  it('without VITE_ANDROID_PUSH, pushDevice resolves null and never registers', async () => {
    const { pushDevice, androidPushBuilt } = await import('../../src/backend/platform/push');
    expect(androidPushBuilt({})).toBe(false);
    expect(androidPushBuilt({ VITE_ANDROID_PUSH: '1' })).toBe(true);
    expect(await pushDevice()).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('the Android workflow sets VITE_ANDROID_PUSH only from the step that writes google-services.json', () => {
    const wf = read('.github/workflows/android.yml');
    expect(wf).toMatch(/printf '%s' "\$GOOGLE_SERVICES_JSON" > android\/app\/google-services\.json/);
    expect(wf.match(/VITE_ANDROID_PUSH:/g)).toHaveLength(1);
    expect(wf).toMatch(/VITE_ANDROID_PUSH: \$\{\{ steps\.firebase\.outputs\.push \}\}/);
  });
});
