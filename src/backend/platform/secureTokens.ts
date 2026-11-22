/**
 * Beast Mode SEC-11: on iOS, player tokens go to the Keychain through the TkSecureStore plugin
 * (ios/App/App/TkSecureStorePlugin.swift, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly) instead of
 * WebView localStorage, which iCloud and computer backups include. Android already excludes its WebView
 * storage from backups (data_extraction_rules.xml); the web keeps localStorage.
 *
 * At boot the Keychain is read once into memory; old localStorage tokens are copied in and deleted only
 * once the Keychain holds them. If the plugin is missing or refuses a write, the token stays (or goes) in
 * localStorage so the player is never signed out by this.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isTokenKey, localTokenVault, useTokenVault, type TokenVault } from '../net/tokenVault';

export interface SecureStorePlugin {
  getAll(): Promise<{ items: Record<string, string> }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
}

interface Options {
  plugin?: SecureStorePlugin;
  storage?: Storage;
}

/** True when the Keychain vault is installed. Call once, before the Connection is made. */
export async function installSecureTokens(o: Options = {}): Promise<boolean> {
  const plugin = o.plugin ?? (Capacitor.getPlatform() === 'ios' ? registerPlugin<SecureStorePlugin>('TkSecureStore') : null);
  if (!plugin) return false;
  const storage = o.storage ?? globalThis.localStorage;
  const fallback = localTokenVault(() => storage);
  let items: Record<string, string>;
  try {
    items = (await plugin.getAll()).items ?? {};
  } catch {
    return false;
  }
  const mem = new Map<string, string>(Object.entries(items).filter(([k, v]) => isTokenKey(k) && v));
  for (const key of fallback.keys()) {
    const old = fallback.get(key);
    if (!old) continue;
    if (mem.has(key)) {
      fallback.set(key, null);
      continue;
    }
    try {
      await plugin.set({ key, value: old });
      mem.set(key, old);
      fallback.set(key, null);
    } catch {
      mem.set(key, old); // stays in localStorage too
    }
  }
  const vault: TokenVault = {
    get: (key) => mem.get(key) ?? null,
    set(key, value) {
      if (value) mem.set(key, value);
      else mem.delete(key);
      const write = value ? plugin.set({ key, value }) : plugin.remove({ key });
      write.then(
        () => fallback.set(key, null),
        () => fallback.set(key, value),
      );
    },
    keys: () => [...mem.keys()],
  };
  useTokenVault(vault);
  return true;
}
