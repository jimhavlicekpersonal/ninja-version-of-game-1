import type { CapacitorConfig } from '@capacitor/cli';
import { LEGACY_APP_ID } from './tools/release/app-id.mjs';

/**
 * Native app wrapper for iOS and Android. The web build in dist/ is copied
 * into the native projects with `npm run cap:sync`.
 * appId comes from APP_ID (PUB-05, P7-02), the same variable the Android build
 * (`android/app/release.gradle`) and the signed release jobs read; unset, it is the
 * original app's id. A new id means a new App Store / Play listing and Google Play
 * never lets it change after the first upload: the owner chooses it (docs/SHIPPING.md
 * section 6), and the signed jobs refuse the legacy id unless ALLOW_LEGACY_APP_ID=1.
 */
const config: CapacitorConfig = {
  appId: process.env.APP_ID || LEGACY_APP_ID,
  appName: 'Kagemura',
  webDir: 'dist',
  backgroundColor: '#1f2a36',
  ios: {
    contentInset: 'never',
    backgroundColor: '#1f2a36',
  },
  android: {
    backgroundColor: '#1f2a36',
    // The es2020 bundle needs optional chaining and `??` (Chrome 80). Capacitor's default gate is 60,
    // so an Android 7 phone with WebView 51-79 opened a game that could not run (device F12); below
    // this Capacitor shows its own "update Android System WebView" page instead.
    minWebViewVersion: 80,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#c8402f',
    },
  },
};

export default config;
