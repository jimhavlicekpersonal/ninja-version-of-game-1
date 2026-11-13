import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native app wrapper for iOS and Android. The web build in dist/ is copied
 * into the native projects with `npm run cap:sync`.
 * appId is still the original app's id on purpose: changing it creates a new
 * App Store / Play listing. Change it only when you set up the new listing
 * (docs/SHIPPING.md).
 */
const config: CapacitorConfig = {
  appId: 'com.toadstoolkingdoms.app',
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
