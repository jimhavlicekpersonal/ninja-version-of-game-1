/**
 * The service worker template run in a fake service-worker global (worldwide
 * audit GLOBAL-018): error pages never replace the cached shell, a stalled
 * page request falls back to it after a deadline, and a failed or interrupted
 * precache never deletes the previous build's cache or leaves a partial one
 * in use.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEMPLATE = readFileSync(new URL('../../../src/backend/pwa/sw.template.js', import.meta.url), 'utf8');
const ORIGIN = 'https://game.test';
const SCOPE = `${ORIGIN}/app/`;
const NAV_TIMEOUT_MS = 3500;

type ReqLike = string | { url: string; method?: string; mode?: string };
const urlOf = (r: ReqLike) => (typeof r === 'string' ? r : r.url);

class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(r: ReqLike, opts?: { ignoreSearch?: boolean }) {
    const u = new URL(urlOf(r), SCOPE);
    if (opts?.ignoreSearch) u.search = '';
    const hit = this.entries.get(u.href) ?? (opts?.ignoreSearch ? [...this.entries].find(([k]) => k.split('?')[0] === u.href)?.[1] : undefined);
    return hit?.clone();
  }
  async put(r: ReqLike, res: Response) {
    this.entries.set(new URL(urlOf(r), SCOPE).href, res.clone());
  }
  async delete(r: ReqLike) {
    return this.entries.delete(new URL(urlOf(r), SCOPE).href);
  }
  async keys() {
    return [...this.entries.keys()].map((u) => new Request(u));
  }
  async text(path: string) {
    return (await this.match(path))?.text();
  }
}

class FakeCacheStorage {
  readonly map = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.map.has(name)) this.map.set(name, new FakeCache());
    return this.map.get(name)!;
  }
  async has(name: string) {
    return this.map.has(name);
  }
  async keys() {
    return [...this.map.keys()];
  }
  async delete(name: string) {
    return this.map.delete(name);
  }
  async match(r: ReqLike, opts?: { ignoreSearch?: boolean }) {
    for (const c of this.map.values()) {
      const hit = await c.match(r, opts);
      if (hit) return hit;
    }
    return undefined;
  }
}

type Net = (url: string, req: ReqLike) => Promise<Response>;

/** One worker script instance (one build) in a fake global. */
function worker(opts: { build: string; files: string[]; caches: FakeCacheStorage; net: Net; hashes?: Record<string, string> }) {
  const source = TEMPLATE.replace('__BUILD_ID__', opts.build).replace('__PRECACHE__', JSON.stringify(opts.files)).replace('/*__HASHES__*/ {}', JSON.stringify(opts.hashes ?? {}));
  const listeners = new Map<string, (e: unknown) => void>();
  const log: { url: string; cache?: string }[] = [];
  let skipped = false;
  let updates = 0;
  const self = {
    location: new URL(`${SCOPE}sw.js`),
    registration: { update: async () => void updates++ },
    addEventListener: (t: string, f: (e: unknown) => void) => listeners.set(t, f),
    skipWaiting: async () => {
      skipped = true;
    },
    clients: { claim: async () => undefined },
  };
  const context = vm.createContext({
    self,
    caches: opts.caches,
    fetch: (r: ReqLike) => {
      const url = new URL(urlOf(r), SCOPE).href;
      log.push({ url, cache: typeof r === 'string' ? undefined : (r as Request).cache });
      return opts.net(url, r);
    },
    Request,
    Response,
    Headers,
    URL,
    Date,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    console,
  });
  vm.runInContext(source, context);
  const extendable = () => {
    let p: Promise<unknown> = Promise.resolve();
    return { waitUntil: (x: Promise<unknown>) => void (p = x), done: () => p };
  };
  return {
    log,
    get skipped() {
      return skipped;
    },
    get updates() {
      return updates;
    },
    async install() {
      const e = extendable();
      listeners.get('install')!(e);
      return e.done();
    },
    async activate() {
      const e = extendable();
      listeners.get('activate')!(e);
      return e.done();
    },
    /** Dispatch a fetch; resolves to the response (or undefined when the worker lets the browser handle it). */
    request(path: string, mode: 'navigate' | 'no-cors' = 'no-cors'): Promise<Response | undefined> {
      let p: Promise<Response> | undefined;
      listeners.get('fetch')!({ request: { url: new URL(path, SCOPE).href, method: 'GET', mode }, respondWith: (x: Promise<Response>) => void (p = x) });
      return p ?? Promise.resolve(undefined);
    },
  };
}

const FILES = ['./', './index.html', './assets/index-abc.js', './assets/index-abc.css', './manifest.webmanifest', './icons/icon-192.png'];

/** A server that serves every file with a body naming the build. */
const serve =
  (build: string, override: (path: string, attempt: number) => Promise<Response> | null = () => null): Net =>
  (url) => {
    const path = url.slice(SCOPE.length) || '(shell)';
    const n = (counts.get(path) ?? 0) + 1;
    counts.set(path, n);
    return override(path, n) ?? Promise.resolve(new Response(`${build}:${path}`, { status: 200 }));
  };
let counts = new Map<string, number>();

/** Settle a promise under fake timers: its value, or 'pending'. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | 'pending'> {
  let out: T | 'pending' = 'pending';
  void p.then((v) => (out = v));
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

async function installed(build: string, caches = new FakeCacheStorage()) {
  const sw = worker({ build, files: FILES, caches, net: serve(build) });
  await sw.install();
  await sw.activate();
  return { sw, caches };
}

beforeEach(() => {
  counts = new Map();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('service worker template', () => {
  it('has each build placeholder exactly once (vite.config.ts replaces the first occurrence)', () => {
    expect(TEMPLATE.split('__BUILD_ID__')).toHaveLength(2);
    expect(TEMPLATE.split('__PRECACHE__')).toHaveLength(2);
  });

  it('installs every file into its own versioned cache; only hashed files may come from the HTTP cache', async () => {
    const { sw, caches } = await installed('b1');
    expect(sw.skipped).toBe(true);
    const c = caches.map.get('tk-b1')!;
    expect(c.entries.size).toBe(FILES.length);
    expect(await c.text('./')).toBe('b1:(shell)');
    // Client re-audit item 10: the page just downloaded the hashed files, so the install reuses
    // the HTTP cache for them instead of downloading the whole game a second time.
    // Device F5: everything else is revalidated with the server (a 304 when unchanged), never re-downloaded blindly.
    for (const l of sw.log) expect(l.cache).toBe(l.url.includes('/assets/') ? 'default' : 'no-cache');
    expect(sw.log.filter((l) => l.cache === 'default').map((l) => l.url.slice(SCOPE.length)).sort()).toEqual(['assets/index-abc.css', 'assets/index-abc.js']);
  });

  it('a hashed file that failed from the HTTP cache is fetched again past it', async () => {
    const caches = new FakeCacheStorage();
    const sw = worker({
      build: 'b1',
      files: FILES,
      caches,
      net: serve('b1', (path, attempt) => (path === 'assets/index-abc.js' && attempt === 1 ? Promise.resolve(new Response('gone', { status: 503 })) : null)),
    });
    await sw.install();
    const js = sw.log.filter((l) => l.url.endsWith('assets/index-abc.js')).map((l) => l.cache);
    expect(js).toEqual(['default', 'reload']);
    expect(await caches.map.get('tk-b1')!.text('./assets/index-abc.js')).toBe('b1:assets/index-abc.js');
  });
});

describe('navigation', () => {
  it('a 5xx page is neither cached nor shown: the cached shell is served', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw = worker({ build: 'b1', files: FILES, caches, net: async () => new Response('<h1>502 Bad Gateway</h1>', { status: 502 }) });
    const res = await within(sw.request('./', 'navigate'), 0);
    expect(await (res as Response).text()).toBe('b1:(shell)');
    expect(await caches.map.get('tk-b1')!.text('./')).toBe('b1:(shell)');
    // A 404 during a deploy is treated the same way.
    const sw404 = worker({ build: 'b1', files: FILES, caches, net: async () => new Response('Not found', { status: 404 }) });
    expect(await ((await within(sw404.request('./?friend=abc', 'navigate'), 0)) as Response).text()).toBe('b1:(shell)');
  });

  it("the game's page comes from the cache at once (no network wait), then the worker checks for a new build (device F4)", async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw = worker({ build: 'b1', files: FILES, caches, net: () => new Promise<Response>(() => undefined) });
    for (const page of ['./', './?friend=KAGE-1', './index.html', './index.html?sandbox']) {
      expect(await ((await within(sw.request(page, 'navigate'), 0)) as Response).text()).toBe(page.startsWith('./index') ? 'b1:index.html' : 'b1:(shell)');
    }
    expect(sw.log).toHaveLength(0);
    expect(sw.updates).toBe(1); // at most one explicit check a minute
    await vi.advanceTimersByTimeAsync(61_000);
    await within(sw.request('./', 'navigate'), 0);
    expect(sw.updates).toBe(2);
  });

  it('another page comes from the network but never overwrites the precached shell', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw = worker({ build: 'b1', files: FILES, caches, net: async () => new Response('fresh news page', { status: 200 }) });
    expect(await ((await within(sw.request('./news.html', 'navigate'), 0)) as Response).text()).toBe('fresh news page');
    expect(await caches.map.get('tk-b1')!.text('./')).toBe('b1:(shell)');
  });

  it('a stalled page falls back to the cached shell after the deadline', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw = worker({ build: 'b1', files: FILES, caches, net: () => new Promise<Response>(() => undefined) });
    const p = sw.request('./news.html', 'navigate');
    expect(await within(p, NAV_TIMEOUT_MS - 1)).toBe('pending');
    const res = await within(p, 1);
    expect(await (res as Response).text()).toBe('b1:(shell)');
  });

  it('with no cached shell a slow page is waited for, and offline it is a network error', async () => {
    let answer: (r: Response) => void = () => undefined;
    const sw = worker({ build: 'b1', files: FILES, caches: new FakeCacheStorage(), net: () => new Promise<Response>((r) => (answer = r)) });
    const p = sw.request('./', 'navigate');
    expect(await within(p, NAV_TIMEOUT_MS * 3)).toBe('pending');
    answer(new Response('slow but fine', { status: 200 }));
    expect(await ((await within(p, 0)) as Response).text()).toBe('slow but fine');
    const off = worker({
      build: 'b1',
      files: FILES,
      caches: new FakeCacheStorage(),
      net: async () => {
        throw new TypeError('offline');
      },
    });
    expect(((await within(off.request('./', 'navigate'), 0)) as Response).type).toBe('error');
  });

  it('offline: the cached shell, whatever the query string', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw = worker({
      build: 'b1',
      files: FILES,
      caches,
      net: async () => {
        throw new TypeError('offline');
      },
    });
    expect(await ((await within(sw.request('./?sandbox', 'navigate'), 0)) as Response).text()).toBe('b1:(shell)');
  });

  it('assets come from this build\'s cache first; misses go to the network and are not cached', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw = worker({ build: 'b1', files: FILES, caches, net: async () => new Response('net', { status: 200 }) });
    expect(await ((await within(sw.request('./assets/index-abc.js'), 0)) as Response).text()).toBe('b1:assets/index-abc.js');
    expect(sw.log).toHaveLength(0);
    expect(await ((await within(sw.request('./assets/lazy-zzz.js'), 0)) as Response).text()).toBe('net');
    expect(caches.map.get('tk-b1')!.entries.has(`${SCOPE}assets/lazy-zzz.js`)).toBe(false);
  });
});

describe('install and update', () => {
  const B2 = ['./', './index.html', './assets/index-new.js', './assets/index-abc.css', './manifest.webmanifest', './icons/icon-192.png'];

  it('a failed precache fails the install and leaves the previous cache serving', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw2 = worker({ build: 'b2', files: B2, caches, net: serve('b2', (path) => (path === 'icons/icon-192.png' ? Promise.resolve(new Response('', { status: 404 })) : null)) });
    await expect(sw2.install()).rejects.toThrow(/404/);
    expect(sw2.skipped).toBe(false);
    // The old build's cache is complete and untouched.
    const old = caches.map.get('tk-b1')!;
    expect(old.entries.size).toBe(FILES.length);
    expect(await old.text('./')).toBe('b1:(shell)');
    // The partial cache has no shell and no unhashed files: nothing in it can be served as a page.
    const partial = caches.map.get('tk-b2');
    const left = partial ? [...partial.entries.keys()] : [];
    expect(left.every((u) => u.includes('/assets/'))).toBe(true);
    expect(left).not.toContain(SCOPE);
    // The old worker still serves the old shell offline.
    const oldWorker = worker({
      build: 'b1',
      files: FILES,
      caches,
      net: async () => {
        throw new TypeError('offline');
      },
    });
    expect(await ((await within(oldWorker.request('./', 'navigate'), 0)) as Response).text()).toBe('b1:(shell)');
  });

  it('a server error during precache (5xx) is retried, then fails the install the same way', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    const sw2 = worker({ build: 'b2', files: B2, caches, net: serve('b2', (path) => (path === 'index.html' ? Promise.resolve(new Response('oops', { status: 503 })) : null)) });
    await expect(sw2.install()).rejects.toThrow(/503/);
    expect(counts.get('index.html')).toBe(1 + 3); // b1 once, b2 three attempts
    expect(caches.map.get('tk-b1')!.entries.size).toBe(FILES.length);
  });

  it('an interrupted download is retried, and a resumed install reuses hashed files', async () => {
    const caches = new FakeCacheStorage();
    await installed('b1', caches);
    // First attempt: the network dies on the manifest every time.
    const dead = worker({
      build: 'b2',
      files: B2,
      caches,
      net: serve('b2', (path) => (path === 'manifest.webmanifest' ? Promise.reject(new TypeError('network connection was lost')) : null)),
    });
    await expect(dead.install()).rejects.toThrow(/lost/);
    expect(caches.map.has('tk-b1')).toBe(true);
    // Second attempt: one drop, then it works. The new hashed script is not downloaded again; the unchanged CSS comes from b1.
    const before = counts.get('assets/index-new.js') ?? 0;
    const tried = counts.get('manifest.webmanifest') ?? 0;
    const sw2 = worker({
      build: 'b2',
      files: B2,
      caches,
      net: serve('b2', (path, n) => (path === 'manifest.webmanifest' && n === tried + 1 ? Promise.reject(new TypeError('dropped')) : null)),
    });
    await sw2.install();
    expect(counts.get('manifest.webmanifest')).toBe(tried + 2);
    expect(sw2.skipped).toBe(true);
    expect(counts.get('assets/index-new.js')).toBe(before);
    expect(counts.get('assets/index-abc.css')).toBe(1);
    const fresh = caches.map.get('tk-b2')!;
    expect(fresh.entries.size).toBe(B2.length);
    expect(await fresh.text('./')).toBe('b2:(shell)');
    // Only now, on activate, does the old cache go (other apps' caches stay).
    await caches.open('other-app');
    expect(caches.map.has('tk-b1')).toBe(true);
    await sw2.activate();
    expect([...caches.map.keys()].sort()).toEqual(['other-app', 'tk-b2']);
  });

  it('a public file with the same content hash is copied from the previous build, a changed one downloaded (device F5)', async () => {
    const caches = new FakeCacheStorage();
    const files = [...FILES, './privacy.html'];
    const h1 = { 'manifest.webmanifest': 'm1', 'icons/icon-192.png': 'i1', 'privacy.html': 'p1' };
    const sw1 = worker({ build: 'b1', files, caches, net: serve('b1'), hashes: h1 });
    await sw1.install();
    await sw1.activate();
    // b2 changes only the privacy page.
    const sw2 = worker({ build: 'b2', files, caches, net: serve('b2'), hashes: { ...h1, 'privacy.html': 'p2' } });
    await sw2.install();
    const fetched = sw2.log.map((l) => l.url.slice(SCOPE.length));
    expect(fetched).not.toContain('icons/icon-192.png');
    expect(fetched).not.toContain('manifest.webmanifest');
    expect(fetched).toContain('privacy.html');
    const c2 = caches.map.get('tk-b2')!;
    expect(await c2.text('./icons/icon-192.png')).toBe('b1:icons/icon-192.png');
    expect(await c2.text('./privacy.html')).toBe('b2:privacy.html');
    expect((await c2.match('./privacy.html'))!.headers.get('x-tk-hash')).toBe('p2');
    expect(c2.entries.size).toBe(files.length);
  });

  it('a redirected or opaque answer is never precached', async () => {
    const caches = new FakeCacheStorage();
    const redirected = new Response('login page', { status: 200 });
    Object.defineProperty(redirected, 'redirected', { value: true });
    const sw = worker({ build: 'b1', files: FILES, caches, net: serve('b1', (path) => (path === '(shell)' ? Promise.resolve(redirected) : null)) });
    await expect(sw.install()).rejects.toThrow();
    expect(caches.map.get('tk-b1')?.entries.has(SCOPE)).toBeFalsy();
  });
});
