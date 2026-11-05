/**
 * Fingerprints of the game's balance data (roadmap step 72), shared by the
 * game and the server. Pure (browser and Node), no dependencies.
 *
 * - `dataVersionOf(data)`: every value in `src/gameplay/data` (text included).
 *   The game sends it as `x-data-version`; the server records it on every
 *   ticket, so a battle is checked against the data it was played with.
 * - `combatFingerprintOf(data)`: only the numbers a battle reads. It must
 *   match `tests/gameplay/battle/rules-version.test.ts` (a test checks that):
 *   a change here means SIM_RULES must change too. A balance bundle (step 76)
 *   may never change it.
 */

/** JSON with object keys sorted, so the same data always gives the same text. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`;
}

/** 53-bit string hash (cyrb53), as 14 hex digits. Not cryptographic: it names builds, it does not protect them. */
export function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

const cache = new WeakMap<object, string>();

/** Forget a cached data version (after a balance bundle changed the object in place, step 76). */
export function forgetDataVersion(data: object): void {
  cache.delete(data);
}

/** The data version of a GameData object (cached per object; call forgetDataVersion after changing it in place). */
export function dataVersionOf(data: object): string {
  const known = cache.get(data);
  if (known) return known;
  const v = hash53(canonicalJson(data));
  cache.set(data, v);
  return v;
}

// Same rules as tests/gameplay/battle/rules-version.test.ts: text, prices and timers never change a battle.
const NOT_COMBAT = new Set(['name', 'description', 'text', 'summary', 'look', 'tip', '$comment', 'research', 'cost', 'trainSeconds', 'buildSeconds', 'unlockKeep', 'barracksLevel', 'levelCapOffset', 'ratePerHour', 'storage', 'trainingSpeed', 'reinforcement', 'inShop', 'clear', 'scoutFeeByHall', 'generatedLootByHall', 'maxReplays']);

function stripNonCombat(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNonCombat);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !NOT_COMBAT.has(k)).map(([k, x]) => [k, stripNonCombat(x)]));
  return v;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The combat fingerprint (troops, buildings and battle.json, without text, prices and timers). */
export function combatFingerprintOf(data: { troops: unknown; buildings: unknown; battle: unknown }): string {
  return fnv(JSON.stringify(stripNonCombat({ troops: data.troops, buildings: data.buildings, battle: data.battle })));
}

/**
 * Compare two client builds ("1.4.2+ios", "0.1.0"): negative when `a` is
 * older. Only the numeric part before "+" counts; missing parts are 0.
 */
export function compareBuilds(a: string, b: string): number {
  const parts = (s: string) => s.split('+')[0].split(/[.-]/).map((x) => Number.parseInt(x, 10)).map((n) => (Number.isFinite(n) ? n : 0));
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
