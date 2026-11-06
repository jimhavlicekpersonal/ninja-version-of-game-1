/**
 * Getting a sign-in from the platform, to link it or to sign in on a new
 * device (roadmap step 24). The server checks whatever comes back.
 * - iPhone app: Sign in with Apple and Game Center, through the native
 *   "TkAuth" plugin (ios/App/App/TkAuthPlugin.swift).
 * - Web: Google (Google Identity Services, VITE_GOOGLE_CLIENT_ID) and Sign
 *   in with Apple JS (VITE_APPLE_SERVICES_ID), loaded from the providers' own
 *   script hosts only when used.
 * - Android app: Sign in with Google through Credential Manager, the native
 *   "TkAuth" plugin (android/.../TkAuthPlugin.java), when the build has
 *   VITE_GOOGLE_CLIENT_ID (the server/web OAuth client id: the ID token's
 *   audience, which the server's GOOGLE_CLIENT_IDS must list). Play Games is
 *   not offered (no Play Games SDK in the app).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LinkCredential, LinkProvider } from '../net/protocol';
import { bandFromAgeRange, type AgeBand } from '../../gameplay/sim/age';

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
  /** iPhone: 'apple' | 'gamecenter'. Android: 'google' with the server (web) client id. */
  signIn(o: { provider: 'apple' | 'gamecenter' } | { provider: 'google'; serverClientId: string }): Promise<LinkCredential>;
  /** iOS 14.5+: the Game Center friends list (asks the player the first time). */
  gameCenterFriends(): Promise<{ ids: string[] }>;
}
const TkAuth = registerPlugin<TkAuthPlugin>('TkAuth');

/** The store's age signal (re-audit): iOS 26+ Declared Age Range, Android Play Age Signals (TkAgePlugin.swift / .java). */
interface TkAgePlugin {
  ageRange(): Promise<
    | { status: 'range'; lower: number; upper?: number; source?: string; significantChange?: 'approved' | 'pending' | 'declined'; installId?: string }
    | { status: 'verification_required'; source?: string }
    | { status: 'unavailable'; reason?: string }
  >;
}
const TkAge = registerPlugin<TkAgePlugin>('TkAge');

/**
 * The age band the device's store reports (sim/age.ts `bandFromAgeRange`: the
 * youngest age in the range decides), or null when there is no signal: the web,
 * older iOS, regions where the store shares no age, a declined request, an app
 * not installed from the store, or any error. The game then shows its own age
 * screen. Never throws. Unverified on devices (no Xcode/Android SDK where it was written).
 */
export async function storeAgeBand(): Promise<AgeBand | null> {
  const s = await storeAgeSignal();
  return s.kind === 'band' ? s.band : null;
}

/**
 * What the store says about the age (report section 5 step 7, compliance C01): a band; `verify` when the
 * store requires this user to verify their age first (Play: a US state with an app-store age law), which
 * the game must not replace with its own question; or `none` (no signal: ask with the game's screen).
 */
export type StoreAgeSignal = { kind: 'band'; band: AgeBand } | { kind: 'verify'; store: 'play' | 'apple' } | { kind: 'none' };

export async function storeAgeSignal(): Promise<StoreAgeSignal> {
  if (!Capacitor.isNativePlatform()) return { kind: 'none' };
  try {
    const r = await TkAge.ageRange();
    if (r.status === 'range') {
      const band = bandFromAgeRange(r.lower, r.upper ?? null);
      return band ? { kind: 'band', band } : { kind: 'none' };
    }
    if (r.status === 'verification_required') return { kind: 'verify', store: r.source === 'apple' ? 'apple' : 'play' };
    return { kind: 'none' };
  } catch {
    return { kind: 'none' };
  }
}

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
  auth: { init(o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void; signIn(): Promise<{ authorization: { id_token: string; code?: string } }> };
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
      if (native) {
        if (plat === 'ios') return ['apple', 'gamecenter'];
        // GLOBAL-008: account recovery on Android (reinstall, new phone).
        if (plat === 'android' && opts.googleClientId) return ['google'];
        return [];
      }
      const out: LinkProvider[] = [];
      if (opts.appleServicesId) out.push('apple');
      if (opts.googleClientId) out.push('google');
      return out;
    },
    async obtain(provider) {
      if (native) {
        if (plat === 'android') {
          if (provider !== 'google' || !opts.googleClientId) throw new Error('Not available on this device.');
          return TkAuth.signIn({ provider: 'google', serverClientId: opts.googleClientId });
        }
        if (plat !== 'ios' || (provider !== 'apple' && provider !== 'gamecenter')) throw new Error('Not available on this device.');
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
        // The code lets the server revoke the Apple tokens when the account is deleted (App Review 5.1.1(v)).
        return { idToken: r.authorization.id_token, ...(r.authorization.code ? { authorizationCode: r.authorization.code } : {}) };
      }
      throw new Error('Not available on this device.');
    },
  };
}
