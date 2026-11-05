/**
 * The optional real-art manifest never blocks boot (worldwide audit GLOBAL-011):
 * loadArtManifest always settles within its deadline, falls back to the last
 * manifest this device saw (or code-drawn art), and a late answer is kept for
 * the next launch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_MANIFEST_TIMEOUT_MS, artImages, loadArtManifest, type ArtManifestCache } from '../../../src/presentation/render/artManifest';

const memCache = (initial: string | null = null): ArtManifestCache & { value: string | null } => {
  const c = { value: initial, get: () => c.value, set: (v: string | null) => void (c.value = v) };
  return c;
};

const manifest = (n: number) => JSON.stringify({ images: Array.from({ length: n }, (_, i) => ({ key: `troop.k${i}`, url: `art/k${i}.png` })) });

/** Settles the promise under fake timers, or reports that it did not within `ms`. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | 'pending'> {
  let out: T | 'pending' = 'pending';
  void p.then((v) => (out = v));
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('loadArtManifest', () => {
  it('reads a manifest that answers in time and keeps it for later launches', async () => {
    const cache = memCache();
    const fetch = (async () => new Response(manifest(2), { status: 200 })) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch, cache }), 0)).toBe(2);
    expect(artImages().map((i) => i.key)).toEqual(['troop.k0', 'troop.k1']);
    expect(JSON.parse(cache.value!).images).toHaveLength(2);
  });

  it('a fetch that never answers settles at the deadline with code-drawn art', async () => {
    let signal: AbortSignal | undefined;
    const fetch = ((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as typeof globalThis.fetch;
    const p = loadArtManifest('m.json', { fetch, cache: memCache() });
    expect(await within(p, ART_MANIFEST_TIMEOUT_MS - 1)).toBe('pending');
    expect(await within(p, 1)).toBe(0);
    expect(artImages()).toEqual([]);
    // The background request is still bounded: it is aborted later.
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signal?.aborted).toBe(true);
  });

  it('a body that stalls after the headers settles at the deadline', async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"images": [ {"key": "troop.a", "url": "a.png"}'));
        // never closes
      },
    });
    const fetch = (async () => new Response(stalled, { status: 200 })) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch, cache: memCache() }), ART_MANIFEST_TIMEOUT_MS)).toBe(0);
  });

  it('on a slow network it starts with the last good manifest, and a late answer applies next launch', async () => {
    const cache = memCache(manifest(1));
    let answer: (r: Response) => void = () => undefined;
    const slow = (() => new Promise<Response>((r) => (answer = r))) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch: slow, cache }), ART_MANIFEST_TIMEOUT_MS)).toBe(1);
    // The answer arrives after boot: this launch keeps its list, the cache gets the new one.
    answer(new Response(manifest(3), { status: 200 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(artImages()).toHaveLength(1);
    expect(JSON.parse(cache.value!).images).toHaveLength(3);
    // Next launch, again on a stalled network: the late manifest is used.
    const never = (() => new Promise<Response>(() => undefined)) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch: never, cache }), ART_MANIFEST_TIMEOUT_MS)).toBe(3);
  });

  it('offline, a server error or cut-off JSON keeps the last good manifest; 404 means none', async () => {
    const cache = memCache(manifest(2));
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch: offline, cache }), 0)).toBe(2);
    const err = (async () => new Response('busy', { status: 503 })) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch: err, cache }), 0)).toBe(2);
    const cut = (async () => new Response('{"images": [', { status: 200 })) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch: cut, cache }), 0)).toBe(2);
    const gone = (async () => new Response('', { status: 404 })) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch: gone, cache }), 0)).toBe(0);
    expect(JSON.parse(cache.value!).images).toEqual([]);
  });

  it('drops entries with absolute URLs (no art from other hosts)', async () => {
    const fetch = (async () => new Response(JSON.stringify({ images: [{ key: 'a', url: 'https://evil.example/a.png' }, { key: 'b', url: 'art/b.png' }] }), { status: 200 })) as typeof globalThis.fetch;
    expect(await within(loadArtManifest('m.json', { fetch, cache: null }), 0)).toBe(1);
  });
});
