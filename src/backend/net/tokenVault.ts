/**
 * Where player tokens live (Beast Mode SEC-11). The default is localStorage. On iOS,
 * `platform/secureTokens.ts` replaces it at boot with the Keychain (this device only, so an iCloud
 * backup restored to another iPhone carries no session). Reads stay synchronous: that vault keeps a
 * copy in memory and writes through.
 */
export interface TokenVault {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  /** Every key that holds a token. */
  keys(): string[];
}

/** The prefixes of token keys (a player token per server, and a rotated token not yet confirmed). */
const TOKEN_PREFIXES = ['tk.net.token:', 'tk.net.tokenNext:'] as const;

export function isTokenKey(key: string): boolean {
  return TOKEN_PREFIXES.some((p) => key.startsWith(p));
}

export function localTokenVault(storage: () => Storage = () => localStorage): TokenVault {
  return {
    get(key) {
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
      } catch {
        /* private mode: the token lasts for this session only */
      }
    },
    keys() {
      const out: string[] = [];
      try {
        const s = storage();
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k && isTokenKey(k) && s.getItem(k)) out.push(k);
        }
      } catch {
        /* storage blocked: nothing to list */
      }
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
