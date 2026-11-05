/**
 * The game's side of balance bundles (roadmap step 76).
 *
 * At start, before the village loads, `applyCached` checks the bundle kept
 * from the last session (signature, rules, base data, no combat changes) and
 * copies its numbers into the game's data in place. During the session
 * `offer` checks what the server hands out and keeps it for the next start;
 * nothing changes mid-session. Any doubt: the built-in data is used.
 */
import { copyNumbersInto, patchedData, verifyBundle, type BalanceBundle } from './balanceBundle';
import type { KeyValue } from './connection';
import { dataVersionOf, forgetDataVersion } from './dataVersion';

const KEY = 'tk.balance.bundle';

export class BalanceLoader {
  /** The data as built into this version (bundles are always checked against it). */
  private readonly builtIn: object;
  /** The bundle in use this session, if any. */
  applied: BalanceBundle | null = null;

  constructor(
    private readonly kv: KeyValue,
    /** The game's data object, changed in place by `applyCached`. */
    private readonly target: object,
    private readonly simRules: number,
    /** Base64 SPKI of the operators' public key (VITE_BALANCE_PUBLIC_KEY). Empty: bundles are never used. */
    private readonly publicKey: string,
  ) {
    this.builtIn = structuredClone(target);
  }

  /** Apply the bundle kept from the last session, if it still checks out. Call once, before the game starts. */
  async applyCached(): Promise<BalanceBundle | null> {
    const raw = this.kv.get(KEY);
    if (!raw || !this.publicKey) return null;
    let b: BalanceBundle;
    try {
      b = JSON.parse(raw) as BalanceBundle;
    } catch {
      this.kv.set(KEY, null);
      return null;
    }
    const checked = (await verifyBundle(b, this.publicKey)) ? patchedData(this.builtIn, b, this.simRules) : { error: 'bad signature' };
    if ('error' in checked) {
      this.kv.set(KEY, null);
      return null;
    }
    copyNumbersInto(this.target, checked.data);
    forgetDataVersion(this.target);
    this.applied = b;
    return b;
  }

  /**
   * What the server offers now (null: it has none). A valid new bundle is kept
   * for the next start; none at all clears the kept one. Returns what happened.
   */
  async offer(b: BalanceBundle | null): Promise<'next-start' | 'same' | 'cleared' | 'refused' | 'none'> {
    if (!b) {
      if (this.kv.get(KEY) === null) return 'none';
      this.kv.set(KEY, null);
      return 'cleared';
    }
    if (this.applied?.id === b.id && this.applied.signature === b.signature) return 'same';
    if (!this.publicKey || !(await verifyBundle(b, this.publicKey)) || 'error' in patchedData(this.builtIn, b, this.simRules)) return 'refused';
    this.kv.set(KEY, JSON.stringify(b));
    return 'next-start';
  }

  /** The data version the game plays with (X-Data-Version). */
  dataVersion(): string {
    return dataVersionOf(this.target);
  }
}
