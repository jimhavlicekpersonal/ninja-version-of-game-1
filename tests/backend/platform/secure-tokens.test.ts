// Beast Mode SEC-11: on iOS the sign-in token moves out of WebView localStorage (backed up to iCloud) into the
// Keychain (this device only). The game's token reads stay synchronous: the Keychain is read once at boot.
import { afterEach, describe, expect, it } from 'vitest';
import { localTokenVault, tokenVault, useTokenVault } from '../../../src/backend/net/tokenVault';
import { installSecureTokens, type SecureStorePlugin } from '../../../src/backend/platform/secureTokens';

function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

function fakePlugin(init: Record<string, string> = {}, failWrites = false): SecureStorePlugin & { items: Map<string, string> } {
  const items = new Map(Object.entries(init));
  return {
    items,
    getAll: async () => ({ items: Object.fromEntries(items) }),
    set: async ({ key, value }) => {
      if (failWrites) throw new Error('keychain');
      items.set(key, value);
    },
    remove: async ({ key }) => {
      if (failWrites) throw new Error('keychain');
      items.delete(key);
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => useTokenVault(localTokenVault()));

describe('SEC-11 secure token store', () => {
  it('moves old localStorage tokens into the Keychain and deletes them', async () => {
    const storage = memStorage({ 'tk.net.token:https://a': 'T1', 'tk.net.tokenNext:https://a': 'T2', 'tk.other': 'x' });
    const plugin = fakePlugin();
    expect(await installSecureTokens({ plugin, storage })).toBe(true);
    expect(plugin.items.get('tk.net.token:https://a')).toBe('T1');
    expect(plugin.items.get('tk.net.tokenNext:https://a')).toBe('T2');
    expect(storage.getItem('tk.net.token:https://a')).toBeNull();
    expect(storage.getItem('tk.net.tokenNext:https://a')).toBeNull();
    expect(storage.getItem('tk.other')).toBe('x');
    expect(tokenVault().get('tk.net.token:https://a')).toBe('T1');
    expect(tokenVault().keys()).toContain('tk.net.token:https://a');
  });

  it('keeps a Keychain token over a stale localStorage copy', async () => {
    const storage = memStorage({ 'tk.net.token:https://a': 'OLD' });
    const plugin = fakePlugin({ 'tk.net.token:https://a': 'NEW' });
    await installSecureTokens({ plugin, storage });
    expect(tokenVault().get('tk.net.token:https://a')).toBe('NEW');
    expect(storage.getItem('tk.net.token:https://a')).toBeNull();
  });

  it('writes and removes through to the Keychain, never localStorage', async () => {
    const storage = memStorage();
    const plugin = fakePlugin();
    await installSecureTokens({ plugin, storage });
    tokenVault().set('tk.net.token:https://b', 'T3');
    await flush();
    expect(plugin.items.get('tk.net.token:https://b')).toBe('T3');
    expect(storage.length).toBe(0);
    tokenVault().set('tk.net.token:https://b', null);
    await flush();
    expect(plugin.items.has('tk.net.token:https://b')).toBe(false);
    expect(tokenVault().get('tk.net.token:https://b')).toBeNull();
  });

  it('keeps localStorage (and the token) when the Keychain is missing or refuses writes', async () => {
    const storage = memStorage({ 'tk.net.token:https://a': 'T1' });
    const broken: SecureStorePlugin = { getAll: async () => Promise.reject(new Error('not implemented')), set: async () => {}, remove: async () => {} };
    expect(await installSecureTokens({ plugin: broken, storage })).toBe(false);
    expect(storage.getItem('tk.net.token:https://a')).toBe('T1');
    const refusing = fakePlugin({}, true);
    expect(await installSecureTokens({ plugin: refusing, storage })).toBe(true);
    // the migration write failed: the old copy stays so the player stays signed in
    expect(storage.getItem('tk.net.token:https://a')).toBe('T1');
    expect(tokenVault().get('tk.net.token:https://a')).toBe('T1');
  });
});
