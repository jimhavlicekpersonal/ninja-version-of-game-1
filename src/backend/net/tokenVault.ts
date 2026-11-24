/**
 * Where player tokens live (Beast Mode SEC-11). The default is localStorage. On iOS,
 * `platform/secureTokens.ts` replaces it at boot with the Keychain (this device only, so an iCloud
 * backup restored to another iPhone carries no session). Reads stay synchronous: that vault keeps a
 * copy in memory and writes through.
 */
export interface TokenVault {
  get(key: string): string | null;
  /**
   * False when the value could not be kept beyond this session (storage full or blocked, F3 2026-11-24): the
   * vault still answers it from memory until the app closes, but a caller that would lose an identity
   * without it (a token rotation) must not rely on it.
   */
  set(key: string, value: string | null): boolean;
  /** Every key that holds a token. */
  keys(): string[];
}

/** The prefixes of token keys (a player token per server, and a rotated token not yet confirmed). */
const TOKEN_PREFIXES = ['tk.net.token:', 'tk.net.tokenNext:'] as const;

export function isTokenKey(key: string): boolean {
  return TOKEN_PREFIXES.some((p) => key.startsWith(p));
}

export function localTokenVault(storage: () => Storage = () => localStorage): TokenVault {
  // F3: values whose write failed (storage full, private mode), answered from memory for this session.
  const unstored = new Map<string, string | null>();
  return {
    get(key) {
      if (unstored.has(key)) return unstored.get(key) ?? null;
      try {
        return storage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value) storage().setItem(key, value);
        else storage().removeItem(key);
        unstored.delete(key);
        return true;
      } catch {
        /* storage full or private mode: the value lasts for this session only */
        unstored.set(key, value || null);
        return false;
      }
    },
    keys() {
      const out: string[] = [];
      try {
        const s = storage();
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k && isTokenKey(k) && s.getItem(k) && !unstored.has(k)) out.push(k);
        }
      } catch {
        /* storage blocked: nothing to list */
      }
      for (const [k, v] of unstored) if (v && isTokenKey(k)) out.push(k);
      return out;
    },
  };
}

let current: TokenVault = localTokenVault();

export function tokenVault(): TokenVault {
  return current;
}

/** Replace the vault (boot on iOS, tests). Adapters made afterwards use it. */
export function useTokenVault(v: TokenVault): void {
  current = v;
}
