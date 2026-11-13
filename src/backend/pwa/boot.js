/* Kagemura start-up guard, inlined into index.html by vite.config.ts (`bootGuard`) as the
   first script, before the game's module. Written in ES5 on purpose: it must run on browsers
   too old for the game so it can say so.

   1. Polyfills the few newer built-ins the game calls on iOS 15.0-15.3 and Android WebView < 98:
      structuredClone (plain data: objects, arrays, Map, Set, Date, typed arrays) and .at().
   2. Feature check: without ES modules, modern syntax, Promise/Map/Set or a 2D canvas the game
      cannot run, so it shows "please update" instead of a splash that never ends. Inside the
      Capacitor app it names Android System WebView, not a browser (device F12; capacitor.config.ts
      also sets android.minWebViewVersion 80, so Capacitor's own update page normally comes first).
   3. Load guard: if the module fails to download or parse, the splash turns into "Couldn't load
      Kagemura" with Retry. If start-up makes no progress for SLOW_MS (the game reports each step
      with window.__tkBoot.progress(text)), a "taking a long time" card is added under the splash,
      which keeps its progress line; it goes away again when progress resumes (report section 5
      step 3: on a slow phone and a slow network the card used to replace the splash at 25 s while
      painting was nearly done, and its Retry restarted the whole download). Until the game's module
      runs, every finished download (PerformanceObserver 'resource') also counts as progress, so a
      slow 2G download of the scripts is not mistaken for a hang (device F3). The first Retry
      re-downloads the page and its script past the HTTP cache; a later one (the same failure
      again) also removes the service worker and its caches when online, so a broken offline copy
      can't keep serving. The game calls window.__tkBoot.done() once its first frame is on screen.

   Tests: tests/backend/pwa/boot.test.ts. */
(function (w) {
  'use strict';
  var d = w.document;
  var SLOW_MS = 25000;
  var RETRY_KEY = 'tk.bootRetry';

  // ------------------------------------------------------------------ polyfills
  function cloneError(what) {
    var msg = what + ' could not be cloned.';
    try {
      return new DOMException(msg, 'DataCloneError');
    } catch (e) {
      var err = new Error(msg);
      err.name = 'DataCloneError';
      return err;
    }
  }
  function deepClone(value, seen) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'function' || typeof value === 'symbol') throw cloneError(String(value));
      return value;
    }
    if (seen.has(value)) return seen.get(value);
    var out, i, keys;
    var tag = Object.prototype.toString.call(value);
    if (Array.isArray(value)) {
      out = new Array(value.length);
      seen.set(value, out);
      for (i = 0; i < value.length; i++) if (i in value) out[i] = deepClone(value[i], seen);
      return out;
    }
    if (tag === '[object Date]') return seen.set(value, (out = new Date(value.getTime()))), out;
    if (tag === '[object RegExp]') return seen.set(value, (out = new RegExp(value.source, value.flags))), out;
    if (tag === '[object Map]') {
      out = new Map();
      seen.set(value, out);
      value.forEach(function (v, k) {
        out.set(deepClone(k, seen), deepClone(v, seen));
      });
      return out;
    }
    if (tag === '[object Set]') {
      out = new Set();
      seen.set(value, out);
      value.forEach(function (v) {
        out.add(deepClone(v, seen));
      });
      return out;
    }
    if (tag === '[object ArrayBuffer]') return seen.set(value, (out = value.slice(0))), out;
    if (ArrayBuffer.isView(value)) {
      var buf = deepClone(value.buffer, seen);
      out = tag === '[object DataView]' ? new DataView(buf, value.byteOffset, value.byteLength) : new value.constructor(buf, value.byteOffset, value.length);
      return seen.set(value, out), out;
    }
    if (tag === '[object Error]') {
      out = new Error(value.message);
      out.name = value.name;
      if (value.stack) out.stack = value.stack;
      return seen.set(value, out), out;
    }
    if (tag === '[object Boolean]' || tag === '[object Number]' || tag === '[object String]') return Object(value.valueOf());
    if (typeof Node !== 'undefined' && value instanceof Node) throw cloneError('A DOM node');
    // Plain objects (and class instances, which structuredClone also turns into plain objects).
    out = {};
    seen.set(value, out);
    keys = Object.keys(value);
    for (i = 0; i < keys.length; i++) out[keys[i]] = deepClone(value[keys[i]], seen);
    return out;
  }
  if (typeof w.structuredClone !== 'function' && typeof Map === 'function') {
    w.structuredClone = function structuredClone(value) {
      if (!arguments.length) throw new TypeError("Failed to execute 'structuredClone': 1 argument required.");
      return deepClone(value, new Map());
    };
  }
  function at(n) {
    var len = this.length >>> 0;
    n = Math.trunc ? Math.trunc(n) || 0 : n | 0;
    if (n < 0) n += len;
    return n < 0 || n >= len ? undefined : this[n];
  }
  function addAt(proto) {
    if (proto && !proto.at) Object.defineProperty(proto, 'at', { value: at, writable: true, configurable: true });
  }
  addAt(Array.prototype);
  addAt(String.prototype);
  if (typeof Int8Array === 'function') addAt(Object.getPrototypeOf(Int8Array.prototype));
  if (!Object.hasOwn) {
    Object.defineProperty(Object, 'hasOwn', {
      value: function (o, k) {
        return Object.prototype.hasOwnProperty.call(Object(o), k);
      },
      writable: true,
      configurable: true,
    });
  }

  // ------------------------------------------------------------------ feature check
  function missingFeatures() {
    var missing = [];
    var s = d && d.createElement ? d.createElement('script') : null;
    if (!s || !('noModule' in s)) missing.push('JavaScript modules');
    try {
      new Function('var a = { b: 1 }; return a?.b ?? 0;');
    } catch (e) {
      // Only a syntax error counts: a page policy that forbids eval must not lock players out.
      if (e && e.name === 'SyntaxError') missing.push('modern JavaScript');
    }
    if (typeof Promise !== 'function' || typeof Map !== 'function' || typeof Set !== 'function' || typeof WeakMap !== 'function' || typeof Symbol !== 'function') missing.push('Promise, Map and Set');
    if (typeof w.requestAnimationFrame !== 'function') missing.push('animation frames');
    if (typeof w.fetch !== 'function') missing.push('fetch');
    try {
      var c = d.createElement('canvas');
      if (!c.getContext || !c.getContext('2d')) missing.push('canvas drawing');
    } catch (e) {
      missing.push('canvas drawing');
    }
    return missing;
  }

  // ------------------------------------------------------------------ load guard
  var state = { done: false, shown: '', timer: 0, unsupported: [], slowCard: null, slowHost: null };

  function session(get, value) {
    try {
      if (get) return Number(w.sessionStorage.getItem(RETRY_KEY)) || 0;
      if (value) w.sessionStorage.setItem(RETRY_KEY, String(value));
      else w.sessionStorage.removeItem(RETRY_KEY);
    } catch (e) {
      /* storage blocked: every retry counts as the first */
    }
    return 0;
  }

  function tr(text) { return w.__kgTranslateBoot ? w.__kgTranslateBoot(text) : text; }

  function el(tag, attrs, text) {
    var e = d.createElement(tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = tr(text);
    return e;
  }

  var CARD = 'max-width:420px;margin:16px;padding:18px 20px;text-align:center;font:600 15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#26303d;text-shadow:none;letter-spacing:0;background:#f7f0e1;border-radius:20px;box-shadow:0 10px 40px rgba(0,0,0,.45)';
  var BTN = 'margin:12px 6px 0;min-height:44px;padding:10px 18px;border:0;border-radius:14px;font:700 15px system-ui,-apple-system,sans-serif;background:#4f9a5b;color:#fff;cursor:pointer';

  function bootEl() {
    var b = d.getElementById('boot');
    if (!b && d.body) {
      b = el('div', { id: 'boot' });
      d.body.appendChild(b);
    }
    if (b) {
      // Works without the game's stylesheet too (it may be what failed).
      b.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1d2537;z-index:50;opacity:1;pointer-events:auto';
      b.classList.remove('done');
    }
    return b;
  }

  /**
   * Replace the splash with a message card. kind: 'failed' | 'slow' | 'unsupported'. The slow card
   * is added under the splash instead (its progress line keeps updating) and removed by progress().
   */
  function show(kind, detail) {
    if (state.done || state.shown === 'unsupported' || state.shown === 'failed' || state.shown === kind) return;
    if (!d.body) {
      d.addEventListener('DOMContentLoaded', function () {
        show(kind, detail);
      });
      return;
    }
    var keepSplash = kind === 'slow';
    var b = keepSplash ? d.getElementById('boot') || bootEl() : bootEl();
    if (!b) return;
    dropSlowCard();
    state.shown = kind;
    if (!keepSplash) while (b.firstChild) b.removeChild(b.firstChild);
    var card = el('div', { class: 'boot-fail', role: 'alert', style: CARD });
    if (keepSplash) {
      state.slowCard = card;
      state.slowHost = b;
    }
    if (kind === 'unsupported') {
      card.appendChild(el('p', { style: 'margin:0 0 8px;font-size:17px' }, 'Kagemura needs a newer browser'));
      if (nativeApp()) {
        // Inside the iOS/Android app (device F12) the fix is the system WebView (Android System
        // WebView in Google Play) or iOS itself, never "Chrome": the app does not use the browser.
        card.appendChild(el('p', { style: 'margin:0;font-weight:500' }, 'Update your browser or Android System WebView, then try again. Your saved village stays on this device.'));
        var miss = el('p', { style: 'margin:8px 0 0;font:400 12px monospace;color:#5f6b78;word-break:break-word' });
        miss.textContent = detail;
        card.appendChild(miss);
      } else card.appendChild(el('p', { style: 'margin:0;font-weight:500' }, tr('This browser is missing: {detail}. Update your phone (iOS 15 or later) or your browser (Chrome, Safari, Edge or Firefox from 2021 or later), then open Kagemura again.').replace('{detail}', detail)));
    } else {
      card.appendChild(el('p', { style: 'margin:0 0 8px;font-size:17px' }, kind === 'slow' ? 'Kagemura is taking a long time to load' : "Couldn't load Kagemura"));
      card.appendChild(el('p', { style: 'margin:0;font-weight:500' }, kind === 'slow' ? 'Nothing has moved for a while. It keeps loading in the background, or you can start again.' : 'Check your connection and try again. Your village is saved on this device.'));
      if (detail) card.appendChild(el('p', { style: 'margin:8px 0 0;font:400 12px monospace;color:#5f6b78;word-break:break-word' }, tr('The action could not be completed. Please try again.')));
      var retry = el('button', { type: 'button', style: BTN }, 'Retry');
      retry.addEventListener('click', function () {
        retry.disabled = true;
        retry.textContent = tr('Retrying…');
        api.retry();
      });
      card.appendChild(retry);
    }
    b.appendChild(card);
  }

  /** Running inside the Capacitor app (its bridge script runs before this one). */
  function nativeApp() {
    var cap = w.Capacitor;
    try {
      return Boolean(cap && (typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : cap.platform && cap.platform !== 'web'));
    } catch (e) {
      return false;
    }
  }

  function reload() {
    w.location.reload();
  }

  function dropSlowCard() {
    if (state.slowCard && state.slowHost) state.slowHost.removeChild(state.slowCard);
    state.slowCard = null;
    state.slowHost = null;
  }

  function armSlowTimer() {
    w.clearTimeout(state.timer);
    state.timer = w.setTimeout(function () {
      show('slow');
    }, SLOW_MS);
  }

  var api = {
    /**
     * Called by the game at each start-up step (and as painting advances): the "taking a long
     * time" clock starts again, and a slow card already shown goes away.
     */
    progress: function () {
      if (state.done || state.shown === 'failed' || state.shown === 'unsupported') return;
      dropSlowCard();
      if (state.shown === 'slow') state.shown = '';
      armSlowTimer();
    },
    /** Called by the game once its first frame is on screen: the guard stands down. */
    done: function () {
      state.done = true;
      w.clearTimeout(state.timer);
      session(false, 0);
      dropSlowCard();
      // A card shown before the game made it: hand the splash back so it can fade out.
      var b = state.shown && d.getElementById('boot');
      if (b) b.style.cssText = '';
    },
    /** The game shows its own error screen (boot().catch): the guard stops its timer only. */
    stop: function () {
      w.clearTimeout(state.timer);
    },
    retry: function () {
      var tries = session(true) + 1;
      session(false, tries);
      var page = w.location.href.split('#')[0];
      var script = d.querySelector('script[type="module"][src]');
      var urls = [page];
      if (script) urls.push(script.src);
      var fresh = function () {
        // Download the page and its script again past the HTTP cache, then reload.
        return Promise.all(
          urls.map(function (u) {
            return w.fetch(u, { cache: 'reload', credentials: 'same-origin' }).catch(function () {
              return null;
            });
          })
        );
      };
      var clearOffline = function () {
        // A second failure in a row: the offline copy may be the broken part. Only when online, so
        // an offline player keeps the copy that may still work after a reboot.
        if (tries < 2 || w.navigator.onLine === false) return Promise.resolve();
        var jobs = [];
        if (w.navigator.serviceWorker && w.navigator.serviceWorker.getRegistrations) {
          jobs.push(
            w.navigator.serviceWorker.getRegistrations().then(function (regs) {
              return Promise.all(
                regs.map(function (r) {
                  return r.unregister();
                })
              );
            })
          );
        }
        if (w.caches && w.caches.keys) {
          jobs.push(
            w.caches.keys().then(function (keys) {
              return Promise.all(
                keys
                  .filter(function (k) {
                    return k.indexOf('tk-') === 0;
                  })
                  .map(function (k) {
                    return w.caches.delete(k);
                  })
              );
            })
          );
        }
        return Promise.all(jobs).catch(function () {});
      };
      if (typeof Promise !== 'function' || typeof w.fetch !== 'function') return reload();
      var t = w.setTimeout(reload, 8000); // never hang on the retry itself
      clearOffline()
        .then(fresh)
        .then(
          function () {
            w.clearTimeout(t);
            reload();
          },
          function () {
            w.clearTimeout(t);
            reload();
          }
        );
    },
    show: show,
    get unsupported() {
      return state.unsupported;
    },
  };
  w.__tkBoot = api;

  state.unsupported = d ? missingFeatures() : [];
  if (state.unsupported.length) {
    show('unsupported', state.unsupported.join(', '));
    return;
  }

  armSlowTimer();

  // Every file of the game that finishes downloading counts as progress too (device F3): before the
  // game's module runs it cannot report steps itself, and on a 2G link its scripts take longer than
  // the slow card's clock. Browsers without PerformanceObserver keep the plain clock.
  try {
    if (typeof w.PerformanceObserver === 'function') {
      new w.PerformanceObserver(function () {
        if (!w.__tkStarted) api.progress();
      }).observe({ type: 'resource', buffered: false });
    }
  } catch (e) {
    /* 'type' unsupported (old WebKit): no download progress */
  }

  // The game's module (or its stylesheet) failed to download: resource errors don't bubble, so
  // listen in the capture phase.
  w.addEventListener(
    'error',
    function (e) {
      if (state.done) return;
      var t = e && e.target;
      if (t && t !== w && t.tagName === 'SCRIPT') {
        show('failed', 'The game script did not download.');
        return;
      }
      // A parse or run-time error while the module is still loading (the game marks itself
      // started before boot(), which reports its own errors).
      // Errors from other origins (browser extensions, injected scripts) are not ours to report.
      var file = (e && e.filename) || '';
      if ((t === w || !t || !t.tagName) && (!file || file.indexOf(w.location.origin) === 0)) {
        if (!w.__tkStarted) show('failed', e && e.message);
      }
    },
    true
  );
  w.addEventListener('unhandledrejection', function (e) {
    if (state.done || w.__tkStarted) return;
    var r = e && e.reason;
    // A dynamic import that failed before the game started.
    show('failed', (r && r.message) || String(r));
  });
})(typeof window !== 'undefined' ? window : this);
