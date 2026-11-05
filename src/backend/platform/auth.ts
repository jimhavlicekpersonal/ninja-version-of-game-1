/**
 * Getting a sign-in from the platform, to link it or to sign in on a new
 * device (roadmap step 24). The server checks whatever comes back.
 * - iPhone app: Sign in with Apple and Game Center, through the native
 *   "TkAuth" plugin (ios/App/App/TkAuthPlugin.swift).
 * - Web: Google (Google Identity Services, VITE_GOOGLE_CLIENT_ID) and Sign
 *   in with Apple JS (VITE_APPLE_SERVICES_ID), loaded from the providers' own
 *   script hosts only when used.
 * - Android app: none yet (Play Games / Credential Manager need the Play
 *   services SDKs in the Android project; roadmap note under step 24).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LinkCredential, LinkProvider } from '../net/protocol';

export interface SignInSource {
  /** Providers this device can sign in with. */
  available(): LinkProvider[];
  /** Ask the player to sign in; throws when they cancel or it fails. */
  obtain(provider: LinkProvider): Promise<LinkCredential>;
  /** Platforms whose friends list this device can read (roadmap step 61, opt-in). */
  friendProviders?(): ('gamecenter' | 'playgames')[];
  /**
   * The player's friends on that platform (Game Center teamPlayerIDs). The
   * system asks the player first; throws when they say no or are not signed in.
   */
  friendIds?(provider: 'gamecenter' | 'playgames'): Promise<string[]>;
}

interface TkAuthPlugin {
  signIn(o: { provider: 'apple' | 'gamecenter' }): Promise<LinkCredential>;
  /** iOS 14.5+: the Game Center friends list (asks the player the first time). */
  gameCenterFriends(): Promise<{ ids: string[] }>;
}
const TkAuth = registerPlugin<TkAuthPlugin>('TkAuth');

export const PROVIDER_NAMES: Record<LinkProvider, string> = { apple: 'Apple', google: 'Google', gamecenter: 'Game Center', playgames: 'Play Games' };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not reach the sign-in service.'));
    document.head.append(s);
  });
}

interface GoogleId {
  accounts: { id: { initialize(o: { client_id: string; callback: (r: { credential?: string }) => void; cancel_on_tap_outside?: boolean }): void; prompt(cb?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void } };
}
interface AppleIdJs {
  auth: { init(o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void; signIn(): Promise<{ authorization: { id_token: string } }> };
}

export function platformSignIn(opts: { googleClientId?: string; appleServicesId?: string } = {}): SignInSource {
  const native = Capacitor.isNativePlatform();
  const plat = Capacitor.getPlatform();
  return {
    // Step 61: Game Center friends on iPhone. Play Games friends need the Play Games SDK (not in the Android app yet).
    friendProviders() {
      return native && plat === 'ios' ? ['gamecenter'] : [];
    },
    async friendIds(provider) {
      if (!native || plat !== 'ios' || provider !== 'gamecenter') throw new Error('Not available on this device.');
      return (await TkAuth.gameCenterFriends()).ids;
    },
    available() {
      if (native) return plat === 'ios' ? ['apple', 'gamecenter'] : [];
      const out: LinkProvider[] = [];
      if (opts.appleServicesId) out.push('apple');
      if (opts.googleClientId) out.push('google');
      return out;
    },
    async obtain(provider) {
      if (native) {
        if (provider !== 'apple' && provider !== 'gamecenter') throw new Error('Not available on this device.');
        return TkAuth.signIn({ provider });
      }
      if (provider === 'google' && opts.googleClientId) {
        await loadScript('https://accounts.google.com/gsi/client');
        const google = (window as unknown as { google: GoogleId }).google;
        return new Promise<LinkCredential>((resolve, reject) => {
          google.accounts.id.initialize({ client_id: opts.googleClientId!, callback: (r) => (r.credential ? resolve({ idToken: r.credential }) : reject(new Error('Google sign-in was cancelled.'))) });
          google.accounts.id.prompt((n) => {
            if (n.isNotDisplayed() || n.isSkippedMoment()) reject(new Error('Google sign-in did not open. Allow third-party sign-in for this site and try again.'));
          });
        });
      }
      if (provider === 'apple' && opts.appleServicesId) {
        await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
        const AppleID = (window as unknown as { AppleID: AppleIdJs }).AppleID;
        AppleID.auth.init({ clientId: opts.appleServicesId, scope: '', redirectURI: location.origin + location.pathname, usePopup: true });
        const r = await AppleID.auth.signIn();
        return { idToken: r.authorization.id_token };
      }
      throw new Error('Not available on this device.');
    },
  };
}
