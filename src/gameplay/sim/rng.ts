/** Small, fast, seedable PRNG (mulberry32). Same seed, same numbers, on every device. */
export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Float in [0, 1). */
export function next(r: Rng): number {
  r.state = (r.state + 0x6d2b79f5) >>> 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function int(r: Rng, min: number, max: number): number {
  return min + Math.floor(next(r) * (max - min + 1));
}

export function pick<T>(r: Rng, list: readonly T[]): T {
  return list[Math.floor(next(r) * list.length)];
}

/** Mix two numbers into a new 32-bit seed. */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stable 32-bit hash of a string id (FNV-1a), for seeds. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
