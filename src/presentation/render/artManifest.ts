/**
 * Real art drop-in. The ART compartment puts image files under public/art/
 * and lists them in public/art/manifest.json:
 *
 *   { "images": [ { "key": "troop.hedgehog_roller", "url": "art/troops/shinobi.png" } ] }
 *
 * Each key is an asset key from docs/art/ASSET_KEYS.md. A loaded image wins
 * over the code-drawn placeholder with the same key (assets.ts skips keys
 * that already exist). A missing or broken manifest just means "no real art".
 *
 * The manifest is optional, so it must never hold up the game (worldwide
 * audit GLOBAL-011): `loadArtManifest` always settles within `timeoutMs`
 * (headers, body and parsing included). When the network is too slow it
 * starts with the last manifest this device saw (or none: code-drawn art),
 * and lets the request finish in the background so the newer list applies on
 * the next launch. Each listed image also has its own load deadline, so a
 * stalled image falls back to the code-drawn one instead of stalling preload.
 */
import type Phaser from 'phaser';

interface ArtImage {
  key: string;
  url: string;
}

/** Small key/value store for the last good manifest (localStorage in the game). */
export interface ArtManifestCache {
  get(): string | null;
  set(value: string | null): void;
}

interface LoadArtManifestOptions {
  /** Longest wait before boot carries on without a fresh manifest. */
  timeoutMs?: number;
  /** How long a late manifest may keep loading in the background (for the next launch). */
  backgroundMs?: number;
  fetch?: typeof fetch;
  cache?: ArtManifestCache | null;
}

/** Boot never waits longer than this for the optional art list. */
export const ART_MANIFEST_TIMEOUT_MS = 2500;
const ART_MANIFEST_BACKGROUND_MS = 30_000;
/** One real-art image may take this long before the code-drawn art is used instead. */
const ART_IMAGE_TIMEOUT_MS = 20_000;
const CACHE_KEY = 'tk.art.manifest';

let images: ArtImage[] = [];

const valid = (i: unknown): i is ArtImage =>
  !!i && typeof (i as ArtImage).key === 'string' && typeof (i as ArtImage).url === 'string' && !/^[a-z]+:/i.test((i as ArtImage).url);

const parseList = (j: unknown): ArtImage[] | null => {
  const list = (j as { images?: unknown[] } | null)?.images;
  return Array.isArray(list) ? list.filter(valid) : null;
};

function localCache(): ArtManifestCache | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    return {
      get: () => {
        try {
          return ls.getItem(CACHE_KEY);
        } catch {
          return null;
        }
      },
      set: (v) => {
        try {
          if (v === null) ls.removeItem(CACHE_KEY);
          else ls.setItem(CACHE_KEY, v);
        } catch {
          /* private mode or full storage: no cache, the manifest is optional */
        }
      },
    };
  } catch {
    return null;
  }
}

function cachedList(cache: ArtManifestCache | null): ArtImage[] {
  try {
    const raw = cache?.get();
    return raw ? (parseList(JSON.parse(raw)) ?? []) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch and read the manifest. Resolves to the list, `[]` when the server
 * says there is none (404, or a well-formed file without images), or `null`
 * when the answer was unusable (network error, abort, 5xx, cut-off JSON).
 */
async function fetchList(url: string, fetchFn: typeof fetch, signal: AbortSignal | undefined): Promise<ArtImage[] | null> {
  try {
    const r = await fetchFn(url, { cache: 'no-cache', signal });
    if (r.status === 404 || r.status === 410) return [];
    if (!r.ok) return null;
    const text = await r.text();
    return parseList(JSON.parse(text)) ?? [];
  } catch {
    return null;
  }
}

export async function loadArtManifest(url = './art/manifest.json', opts: LoadArtManifestOptions = {}): Promise<number> {
  const timeoutMs = opts.timeoutMs ?? ART_MANIFEST_TIMEOUT_MS;
  const backgroundMs = Math.max(timeoutMs, opts.backgroundMs ?? ART_MANIFEST_BACKGROUND_MS);
  const cache = opts.cache === undefined ? localCache() : opts.cache;
  let fetchFn: typeof fetch | undefined = opts.fetch;
  if (!fetchFn) {
    if (typeof fetch !== 'function') {
      images = cachedList(cache);
      return images.length;
    }
    fetchFn = (...a: Parameters<typeof fetch>) => fetch(...a);
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  // The background bound also aborts the request, which ends a stalled body read.
  const giveUp = setTimeout(() => ctrl?.abort(), backgroundMs);
  const work = fetchList(url, fetchFn, ctrl?.signal).then((list) => {
    clearTimeout(giveUp);
    if (list) cache?.set(JSON.stringify({ images: list }));
    return list;
  });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    deadline = setTimeout(() => resolve('late'), timeoutMs);
  });
  const first = await Promise.race([work, late]);
  clearTimeout(deadline);
  // On time: the fresh list. Late or unusable: the last good list from this device, or none.
  images = first === 'late' || first === null ? cachedList(cache) : first;
  return images.length;
}

/** Queue every listed image in a scene's preload step (skips keys already loaded). */
export function queueArt(scene: Phaser.Scene): void {
  for (const i of images) {
    if (scene.textures.exists(i.key)) continue;
    // A stalled image ends as a load error (Phaser maps the XHR timeout to onError) and the code-drawn art stays.
    scene.load.image({ key: i.key, url: i.url, xhrSettings: { responseType: 'blob', timeout: ART_IMAGE_TIMEOUT_MS } });
  }
}

/** The images the last `loadArtManifest` chose (for tests and the art gallery). */
export function artImages(): readonly ArtImage[] {
  return images;
}
