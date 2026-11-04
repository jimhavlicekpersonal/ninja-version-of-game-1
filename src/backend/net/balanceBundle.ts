/**
 * Balance bundles (roadmap step 76): number changes the server hands out so
 * prices, timers and rewards can change without an app release.
 *
 * Rules (each one is checked here, by the game and by the server):
 * - Data only, never code: a list of `{ path, value }` changes to existing
 *   numbers in the game's balance data (Apple 2.5.2 and Google Play allow
 *   downloaded data, not downloaded code).
 * - Never combat: the combat fingerprint (troops, buildings, battle numbers a
 *   battle reads) must not change, so replays and the server's battle checks
 *   stay exact. Combat changes still need SIM_RULES and a release (SHIPPING 3i).
 * - Signed by the operators (ECDSA P-256, SHA-256, raw r||s signature over the
 *   canonical JSON of the bundle without `signature`). The game carries the
 *   public key (VITE_BALANCE_PUBLIC_KEY); a bundle that fails any check is
 *   ignored and the built-in data is used.
 * - Made for one exact build of the data (`base`) and battle rules (`rules`).
 * - The game applies a bundle only when it starts (never mid-session) and
 *   caches it for offline play. Its data version becomes `dataVersion`.
 *
 * Pure: browser and Node (WebCrypto from globalThis.crypto).
 */
import { canonicalJson, combatFingerprintOf, dataVersionOf } from './dataVersion';

export interface BalanceChange {
  /** Keys and array indexes from the top of GameData, e.g. ["economy", "scoutFeeByHall", 3]. */
  path: (string | number)[];
  value: number;
}

export interface BalanceBundle {
  format: 1;
  /** The operators' name for it, e.g. "2026-11-20-cheaper-walls". */
  id: string;
  /** SIM_RULES it was made for. */
  rules: number;
  /** dataVersionOf the built-in data it changes. */
  base: string;
  changes: BalanceChange[];
  /** dataVersionOf the data after the changes. */
  dataVersion: string;
  /** base64 of the raw (r||s) ECDSA P-256 signature over `bundleMessage`. */
  signature: string;
}

/** What is signed: the bundle without its signature, as canonical JSON. */
export function bundleMessage(b: Omit<BalanceBundle, 'signature'> & { signature?: string }): string {
  const { signature: _drop, ...rest } = b;
  return canonicalJson(rest);
}

type Node = Record<string | number, unknown>;

/** The data with the bundle's changes (a copy), or why the bundle is refused. */
export function patchedData<T extends object>(builtIn: T, b: BalanceBundle, simRules: number): { data: T } | { error: string } {
  if (!b || b.format !== 1 || !Array.isArray(b.changes) || typeof b.id !== 'string') return { error: 'not a balance bundle' };
  if (b.rules !== simRules) return { error: `made for battle rules ${b.rules}, this build plays ${simRules}` };
  if (b.base !== dataVersionOf(builtIn)) return { error: 'made for another build of the balance data' };
  if (!b.changes.length || b.changes.length > 5000) return { error: 'no changes, or too many' };
  const data = structuredClone(builtIn) as T;
  for (const c of b.changes) {
    if (!Array.isArray(c?.path) || !c.path.length || c.path.some((k) => typeof k !== 'string' && typeof k !== 'number')) return { error: 'bad change path' };
    if (typeof c.value !== 'number' || !Number.isFinite(c.value)) return { error: `not a number at ${c.path.join('.')}` };
    let node = data as unknown as Node;
    for (const k of c.path.slice(0, -1)) {
      const next = node?.[k];
      if (next === null || typeof next !== 'object') return { error: `no such value: ${c.path.join('.')}` };
      node = next as Node;
    }
    const last = c.path[c.path.length - 1];
    if (!Object.prototype.hasOwnProperty.call(node, last) || typeof node[last] !== 'number') return { error: `only existing numbers can change: ${c.path.join('.')}` };
    node[last] = c.value;
  }
  const combat = (d: object) => combatFingerprintOf(d as { troops: unknown; buildings: unknown; battle: unknown });
  if (combat(data) !== combat(builtIn)) return { error: 'changes combat numbers (those need a new SIM_RULES and an app release)' };
  if (dataVersionOf(data) !== b.dataVersion) return { error: 'data version does not match its changes' };
  return { data };
}

/** Copy every number of `from` into `into` in place (same shape: `from` is `into` with a bundle applied). */
export function copyNumbersInto(into: object, from: object): void {
  const walk = (a: Node, b: Node) => {
    for (const k of Object.keys(b)) {
      const x = b[k];
      if (typeof x === 'number') a[k] = x;
      else if (x && typeof x === 'object' && a[k] && typeof a[k] === 'object') walk(a[k] as Node, x as Node);
    }
  };
  walk(into as Node, from as Node);
}

function base64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Is the bundle signed by the key (base64 SPKI of an ECDSA P-256 public key)? False on any doubt. */
export async function verifyBundle(b: BalanceBundle, publicKeySpki: string): Promise<boolean> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || !publicKeySpki || typeof b?.signature !== 'string') return false;
    const key = await subtle.importKey('spki', base64ToBytes(publicKeySpki.trim()), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, base64ToBytes(b.signature), new TextEncoder().encode(bundleMessage(b)));
  } catch {
    return false;
  }
}
