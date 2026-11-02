import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native app wrapper for iOS and Android. The web build in dist/ is copied
 * into the native projects with `npm run cap:sync`.
 * Change appId to your own reverse-domain id before publishing.
 */
const config: CapacitorConfig = {
  appId: 'com.toadstoolkingdoms.app',
  appName: 'Toadstool Kingdoms',
  webDir: 'dist',
  backgroundColor: '#6fcdee',
  ios: {
    contentInset: 'never',
    backgroundColor: '#6fcdee',
  },
  android: {
    backgroundColor: '#6fcdee',
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#5ccf4a',
    },
  },
};

export default config;
