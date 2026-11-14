/* Kagemura service worker: makes the game load offline after the first visit.
   Generated at build time from src/backend/pwa/sw.template.js (see vite.config.ts,
   which fills in the build id and the precache list).

   Rules (worldwide audit GLOBAL-018):
   - Each build installs into its own cache. The install succeeds only when every
     file arrived with a good answer (200, same origin, not redirected); the app
     shell goes in last, so a cache that holds it is complete. If anything fails,
     the install fails, the previous worker keeps serving its own complete cache,
     and nothing from the failed attempt is ever served.
   - Old caches are deleted only on activate, which runs only after a complete
     install.
   - Pages (device F4): the game's own page (the scope root or index.html) and any
     page this build precached come from the cache at once, so a cold start on a
     slow link no longer waits for the network; the browser's service-worker
     update check (and `registration.update()` here, at most once a minute) is
     what brings the next build, which installs completely before it is used.
     Other pages: network first, but never longer than NAV_TIMEOUT_MS when a
     known-good shell is cached, and an error page (5xx, 404, ...) never
     replaces it. Pages from the network are not written over the precached
     shell, so the shell always matches the cached scripts it loads.
   - Everything else (hashed JS/CSS, icons): this build's cache first.
   - Install reads hashed files through the HTTP cache (the page just downloaded them). Public
     files carry a content hash from the build (`HASHES`, device F5): one an earlier build cached
     with the same hash is copied, not downloaded; the rest are revalidated with the server
     (`no-cache`: a 304 costs a few hundred bytes), never re-downloaded blindly (`reload`). The
     512 px and Apple touch icons are not precached at all (the OS fetches them at install). */
const CACHE = 'tk-__BUILD_ID__';
const LANGUAGE_FILES = /*__LANGUAGE_FILES__*/ {};
const selectedLanguage = new URL(self.location.href).searchParams.get('lang') || 'en';
const PRECACHE = __PRECACHE__.concat(LANGUAGE_FILES[selectedLanguage] || []);
/** Content hash per public (unhashed) file, from the build: same hash, same bytes. */
const HASHES = /*__HASHES__*/ {};
/** Header that records a cached file's content hash. */
const HASH_HEADER = 'x-tk-hash';
const SHELL = './';
/** How long a page request may take before the cached shell is shown instead. */
const NAV_TIMEOUT_MS = 3500;
/** Tries per file during install (a weak network drops some downloads). */
const FETCH_ATTEMPTS = 3;
/** Files downloaded at once during install (gentle on slow links). */
const CONCURRENCY = 4;
/** At most one explicit update check per this long (navigations also trigger the browser's own). */
const UPDATE_EVERY_MS = 60000;

const abs = (u) => new URL(u, self.location.href).href;
/** Vite's hashed build output: the same name always means the same content. */
const immutable = (u) => new URL(abs(u)).pathname.includes('/assets/');
/** Only complete, same-origin, final answers are cached. */
const usable = (res) => Boolean(res) && res.status === 200 && (res.type === 'basic' || res.type === 'default') && !res.redirected;

/** The build's content hash for a public file (undefined for hashed assets and the page). */
const hashOf = (u) => HASHES[new URL(abs(u)).pathname.slice(new URL(abs(SHELL)).pathname.length)];

/**
 * How a file is downloaded during install. Hashed build files (`/assets/`) may come from the
 * browser's HTTP cache: the page that registered this worker has just downloaded them, and a
 * hashed name always means the same bytes, so the first visit no longer downloads the whole game
 * twice (client re-audit item 10). A retry goes past it. Everything else (the page, the manifest,
 * icons, legal pages) is revalidated with the server (`no-cache`): a stale index.html would name
 * scripts this build no longer has, and an unchanged file answers 304 instead of its bytes
 * (device F5; it used to be `reload`, a full download of every public file on every build).
 */
const cacheModeFor = (url, attempt) => (immutable(url) && attempt === 0 ? 'default' : attempt === 0 ? 'no-cache' : 'reload');

/** A copy of a response that records the content hash the build gave its file. */
async function withHash(res, hash) {
  if (!hash) return res;
  const headers = new Headers(res.headers);
  headers.set(HASH_HEADER, hash);
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

async function fetchFresh(url) {
  let last = new Error(`Could not download ${url}`);
  for (let i = 0; i < FETCH_ATTEMPTS; i++) {
    try {
      const res = await fetch(new Request(abs(url), { cache: cacheModeFor(url, i) }));
      if (usable(res)) return res;
      last = new Error(`${url} answered ${res.status}`);
      if (res.status < 500 && res.status !== 408 && res.status !== 429) break; // a 404 will not get better
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * A file already downloaded by an earlier build (or an interrupted install of this one): any
 * hashed asset, or a public file whose recorded content hash matches this build's.
 */
async function reuse(cache, url) {
  const hash = hashOf(url);
  const same = (res) => usable(res) && (immutable(url) || (hash !== undefined && res.headers.get(HASH_HEADER) === hash));
  const own = await cache.match(abs(url));
  if (same(own)) return true;
  for (const key of await caches.keys()) {
    if (key === CACHE || !key.startsWith('tk-')) continue;
    const hit = await (await caches.open(key)).match(abs(url));
    if (same(hit)) {
      await cache.put(abs(url), hit);
      return true;
    }
  }
  return false;
}

async function precache() {
  const cache = await caches.open(CACHE);
  // Never treat a cache as complete before its shell is written again below.
  await cache.delete(abs(SHELL));
  const files = [...new Set(PRECACHE.filter((f) => abs(f) !== abs(SHELL)))];
  let next = 0;
  let failed = null;
  const worker = async () => {
    while (next < files.length && !failed) {
      const url = files[next++];
      try {
        if ((immutable(url) || hashOf(url)) && (await reuse(cache, url))) continue;
        await cache.put(abs(url), await withHash(await fetchFresh(url), hashOf(url)));
      } catch (e) {
        failed = failed || e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  if (failed) throw failed;
  await cache.put(abs(SHELL), await fetchFresh(SHELL));
}

/** After a failed install: keep the hashed files (and hash-checked public ones) for the next attempt, drop everything else. */
async function discardPartial() {
  if (!(await caches.has(CACHE))) return;
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) if (!immutable(req.url) && !hashOf(req.url)) await cache.delete(req);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache().then(
      () => self.skipWaiting(),
      (e) =>
        discardPartial().then(() => {
          throw e; // the install fails: the old worker and its cache stay in charge
        }),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const own = await caches.open(CACHE);
      if (usable(await own.match(abs(SHELL)))) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('tk-') && k !== CACHE).map((k) => caches.delete(k)));
      }
      await self.clients.claim();
    })(),
  );
});

async function cached(req, opts) {
  if (!(await caches.has(CACHE))) return undefined;
  const hit = await (await caches.open(CACHE)).match(req, opts);
  return usable(hit) ? hit : undefined;
}

/** The known-good page for a navigation: its own cached copy, else the app shell. */
async function shellFor(req) {
  return (await cached(req, { ignoreSearch: true })) || (await cached(abs(SHELL)));
}

/** The game's own page: the scope root or its index.html, whatever the query string. */
function appPage(req) {
  const path = new URL(req.url).pathname;
  const root = new URL(abs(SHELL)).pathname;
  return path === root || path === root + 'index.html';
}

let lastUpdate = 0;
/** Ask the browser to look for a newer build (in the background; the cached page is already showing). */
function checkForUpdate() {
  const now = Date.now();
  if (now - lastUpdate < UPDATE_EVERY_MS || !self.registration || typeof self.registration.update !== 'function') return Promise.resolve();
  lastUpdate = now;
  return self.registration.update().catch(() => undefined);
}

/** Cache first for the game's page and precached pages (device F4), else network first with a deadline. */
async function navigate(req, event) {
  const own = (await cached(req, { ignoreSearch: true }).catch(() => undefined)) || (appPage(req) ? await cached(abs(SHELL)).catch(() => undefined) : undefined);
  if (own) {
    const check = checkForUpdate();
    if (event && typeof event.waitUntil === 'function') event.waitUntil(check);
    return own;
  }
  return networkFirst(req);
}

function networkFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (res) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(res);
    };
    // Too slow: show the cached shell if there is one (otherwise keep waiting for the network).
    timer = setTimeout(() => {
      shellFor(req).then((hit) => hit && finish(hit), () => undefined);
    }, NAV_TIMEOUT_MS);
    fetch(req).then(
      (res) => {
        if (res.ok) return finish(res);
        // An error page never replaces a working game.
        return shellFor(req).then(
          (hit) => finish(hit || res),
          () => finish(res),
        );
      },
      () =>
        shellFor(req).then(
          (hit) => finish(hit || Response.error()),
          () => finish(Response.error()),
        ),
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(navigate(req, event));
    return;
  }
  event.respondWith(cached(req).then((hit) => hit || fetch(req)));
});
