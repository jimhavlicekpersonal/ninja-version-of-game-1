/**
 * The Android app's native bridges, with the Capacitor plugins faked:
 * - account recovery sign-in (GLOBAL-008): Google through Credential Manager
 *   (TkAuthPlugin.java), offered only when the build has a server client id;
 * - Play Billing store prices (GLOBAL-007/-001): Play's own formatted price,
 *   currency and micros per store product id; products Play did not return are missing.
 * The server side: a Credential Manager ID token (aud = the server/web client
 * id, azp = the Android client id) is accepted when GOOGLE_CLIENT_IDS lists the
 * audience, and refused otherwise.
 */
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
  native: true,
  platform: 'android',
  plugins: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => cap.platform },
  registerPlugin: (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => {
          const p = (cap.plugins[name] ??= {});
          return (p[method] ??= vi.fn());
        },
      },
    ),
}));

const { platformSignIn } = await import('../../src/backend/platform/auth');
const { PlayBillingPaymentProvider } = await import('../../src/backend/payments/playBilling');
const { verifierFromEnv } = await import('../../server/identity/verify');

const plugin = (name: string) => (cap.plugins[name] ??= {});

beforeEach(() => {
  cap.native = true;
  cap.platform = 'android';
  cap.plugins = {};
});

describe('Android sign-in for account recovery (GLOBAL-008)', () => {
  it('offers Google on Android only when the build has a server client id', () => {
    expect(platformSignIn({ googleClientId: 'web-123.apps.googleusercontent.com' }).available()).toEqual(['google']);
    expect(platformSignIn({}).available()).toEqual([]);
    // Play Games is not in the app: never offered, no friends list.
    expect(platformSignIn({ googleClientId: 'web-123' }).friendProviders?.()).toEqual([]);
  });

  it('asks the native TkAuth plugin with the server client id and passes the token through', async () => {
    plugin('TkAuth').signIn = vi.fn(async () => ({ idToken: 'header.payload.sig' }));
    const source = platformSignIn({ googleClientId: 'web-123.apps.googleusercontent.com' });
    expect(await source.obtain('google')).toEqual({ idToken: 'header.payload.sig' });
    expect(plugin('TkAuth').signIn).toHaveBeenCalledWith({ provider: 'google', serverClientId: 'web-123.apps.googleusercontent.com' });
  });

  it('passes the server nonce to Credential Manager and returns it raw beside the token (backend A15)', async () => {
    plugin('TkAuth').signIn = vi.fn(async () => ({ idToken: 'header.payload.sig' }));
    const source = platformSignIn({ googleClientId: 'web-123' });
    expect(await source.obtain('google', 'n-1')).toEqual({ idToken: 'header.payload.sig', nonce: 'n-1' });
    expect(plugin('TkAuth').signIn).toHaveBeenCalledWith({ provider: 'google', serverClientId: 'web-123', nonce: 'n-1' });
  });

  it('gives native Sign in with Apple the SHA-256 hex of the nonce and the server the raw one', async () => {
    cap.platform = 'ios';
    plugin('TkAuth').signIn = vi.fn(async () => ({ idToken: 'apple-token' }));
    const source = platformSignIn({});
    expect(await source.obtain('apple', 'abc')).toEqual({ idToken: 'apple-token', nonce: 'abc' });
    expect(plugin('TkAuth').signIn).toHaveBeenCalledWith({ provider: 'apple', nonce: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
    // Game Center takes no nonce.
    await source.obtain('gamecenter', 'abc');
    expect(plugin('TkAuth').signIn).toHaveBeenLastCalledWith({ provider: 'gamecenter' });
  });

  it('refuses providers Android cannot give, without calling the plugin', async () => {
    plugin('TkAuth').signIn = vi.fn();
    await expect(platformSignIn({ googleClientId: 'web-123' }).obtain('apple')).rejects.toThrow(/Not available/);
    await expect(platformSignIn({ googleClientId: 'web-123' }).obtain('playgames')).rejects.toThrow(/Not available/);
    await expect(platformSignIn({}).obtain('google')).rejects.toThrow(/Not available/);
    expect(plugin('TkAuth').signIn).not.toHaveBeenCalled();
  });

  it('a cancelled Google sign-in rejects (the HUD shows it, nothing is linked)', async () => {
    plugin('TkAuth').signIn = vi.fn(async () => {
      throw Object.assign(new Error('Google sign-in was cancelled.'), { code: 'cancelled' });
    });
    await expect(platformSignIn({ googleClientId: 'web-123' }).obtain('google')).rejects.toThrow(/cancelled/);
  });

  it('leaves the iPhone sign-ins as they were', async () => {
    cap.platform = 'ios';
    plugin('TkAuth').signIn = vi.fn(async () => ({ idToken: 'apple-token' }));
    const source = platformSignIn({ googleClientId: 'web-123' });
    expect(source.available()).toEqual(['apple', 'gamecenter']);
    expect(await source.obtain('apple')).toEqual({ idToken: 'apple-token' });
    expect(plugin('TkAuth').signIn).toHaveBeenCalledWith({ provider: 'apple' });
    await expect(source.obtain('google')).rejects.toThrow(/Not available/);
  });
});

describe('Japan C17: the storefront country decides the Japanese legal notices', () => {
  it('Play billing country and the App Store storefront come back as alpha-2; anything else is null', async () => {
    const { StoreKitPaymentProvider } = await import('../../src/backend/payments/storekit');
    const { japaneseStorefront } = await import('../../src/presentation/ui/economyUi');
    plugin('TkBilling').billingCountry = vi.fn(async () => ({ countryCode: 'JP' }));
    expect(await new PlayBillingPaymentProvider().storefront()).toBe('JP');
    plugin('TkStore').storefront = vi.fn(async () => ({ countryCode: 'JPN' }));
    expect(await new StoreKitPaymentProvider().storefront()).toBe('JP');
    plugin('TkStore').storefront = vi.fn(async () => ({ countryCode: '' }));
    expect(await new StoreKitPaymentProvider().storefront()).toBeNull();
    plugin('TkBilling').billingCountry = vi.fn(async () => {
      throw new Error('older plugin');
    });
    expect(await new PlayBillingPaymentProvider().storefront()).toBeNull();
    // The storefront wins over the device language; without one the language decides, as before.
    expect(japaneseStorefront('JP', false)).toBe(true);
    expect(japaneseStorefront('US', true)).toBe(false);
    expect(japaneseStorefront(null, true)).toBe(true);
    expect(japaneseStorefront(null, false)).toBe(false);
  });
});

describe('Play Billing store prices', () => {
  it('returns Play’s formatted price, currency and micros keyed by store id; unreturned products are missing', async () => {
    plugin('TkBilling').getProducts = vi.fn(async () => ({
      products: [
        { id: 'jade_pouch', displayName: 'Jade Pouch', displayPrice: 'R$ 4,99', currencyCode: 'BRL', priceMicros: 4_990_000, price: 4.99 },
        { id: 'season_scroll', displayName: 'Season Scroll', displayPrice: '₹89.00', currencyCode: 'INR', priceMicros: 89_000_000, price: 89 },
        { id: 'not_asked_for', displayName: 'x', displayPrice: '$1', currencyCode: 'USD', priceMicros: 1_000_000, price: 1 },
      ],
      unavailable: ['jade_chest'],
    }));
    const prices = await new PlayBillingPaymentProvider().prices(['jade_pouch', 'season_scroll', 'jade_chest', 'jade_pouch']);
    expect(prices).toEqual({
      jade_pouch: { formatted: 'R$ 4,99', currency: 'BRL', micros: 4_990_000 },
      season_scroll: { formatted: '₹89.00', currency: 'INR', micros: 89_000_000 },
    });
    expect(plugin('TkBilling').getProducts).toHaveBeenCalledWith({ ids: ['jade_pouch', 'season_scroll', 'jade_chest'] });
  });

  it('asks Play nothing for no ids, and passes a Play failure on (no invented price)', async () => {
    plugin('TkBilling').getProducts = vi.fn(async () => {
      throw Object.assign(new Error('Google Play Billing is not available'), { code: 'unavailable' });
    });
    expect(await new PlayBillingPaymentProvider().prices([])).toEqual({});
    expect(plugin('TkBilling').getProducts).not.toHaveBeenCalled();
    await expect(new PlayBillingPaymentProvider().prices(['jade_pouch'])).rejects.toThrow(/not available/);
  });

  it('maps store answers: pending stays pending, an undelivered earlier purchase is a failure with Play’s explanation', async () => {
    const play = new PlayBillingPaymentProvider();
    plugin('TkBilling').purchase = vi.fn(async () => {
      throw Object.assign(new Error('The purchase is waiting for payment.'), { code: 'pending' });
    });
    expect(await play.purchase({ productId: 'jade_pouch', name: 'Jade Pouch', usd: 0.99 })).toMatchObject({ ok: false, reason: 'pending' });
    plugin('TkBilling').purchase = vi.fn(async () => {
      throw Object.assign(new Error('An earlier purchase of this item is still being delivered.'), { code: 'already_owned' });
    });
    expect(await play.purchase({ productId: 'jade_pouch', name: 'Jade Pouch', usd: 0.99 })).toMatchObject({ ok: false, reason: 'failed', message: expect.stringMatching(/still being delivered/) });
  });
});

describe('the server accepts Credential Manager Google tokens by audience', () => {
  const NOW = Date.UTC(2026, 10, 5, 12);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'g1', alg: 'RS256', use: 'sig' };
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }), arrayBuffer: async () => new ArrayBuffer(0) });
  const b64u = (s: string) => Buffer.from(s).toString('base64url');
  const token = (claims: Record<string, unknown>) => {
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'g1' }));
    const p = b64u(JSON.stringify({ iss: 'https://accounts.google.com', exp: NOW / 1000 + 600, iat: NOW / 1000, sub: 'google-sub-1', ...claims }));
    return `${h}.${p}.${cryptoSign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
  };

  it('aud = the server/web client id (what Credential Manager issues with setServerClientId) is accepted', async () => {
    const v = verifierFromEnv({ GOOGLE_CLIENT_IDS: 'web-123.apps.googleusercontent.com' }, fetch, () => NOW);
    const t = token({ aud: 'web-123.apps.googleusercontent.com', azp: 'android-456.apps.googleusercontent.com' });
    expect(await v.verify('google', { idToken: t })).toEqual({ provider: 'google', subject: 'google-sub-1' });
  });

  it('a token for another client id is refused', async () => {
    const v = verifierFromEnv({ GOOGLE_CLIENT_IDS: 'web-123.apps.googleusercontent.com' }, fetch, () => NOW);
    await expect(v.verify('google', { idToken: token({ aud: 'someone-else.apps.googleusercontent.com' }) })).rejects.toThrow(/another app/);
  });
});

describe('store errors players read (remnant audit 2026-11-06)', () => {
  it('shows the plugin\'s own sentence, never the store\'s developer text after it', async () => {
    const { storeErrorMessage } = await import('../../src/backend/payments/provider');
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(storeErrorMessage('failed', { code: 'already_owned', message: 'An earlier purchase of this item is still being delivered. Use Store, Restore purchases, or restart the game.' })).toMatch(/still being delivered/);
    expect(storeErrorMessage('failed', { code: 'failed', message: 'Purchase failed: Error code 6, BillingResponseCode.ERROR, debug: Server error, please try again.' })).toBe('The purchase did not go through. If you were charged, it is delivered as soon as the store confirms it.');
    expect(storeErrorMessage('unavailable', { code: 'unavailable', message: 'Purchases are not available here: Billing service unavailable on device.' })).toBe('Purchases are not available right now. Try again later.');
    expect(storeErrorMessage('failed', {})).toMatch(/did not go through/);
    quiet.mockRestore();
  });
});
