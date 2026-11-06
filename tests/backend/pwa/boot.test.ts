/**
 * The inline start-up guard (src/backend/pwa/boot.js, inlined into index.html by vite.config.ts),
 * client re-audit items 1 and 2: polyfills for iOS 15.0-15.3 / old Android WebViews, the "please
 * update" screen, and "Couldn't load Kagemura" with Retry instead of a splash that never ends.
 * Run in a fresh V8 context with a tiny fake DOM (there is no browser in `npm test`; Playwright
 * checks of the built page are listed in src/backend/CLAUDE.md).
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(new URL('../../../src/backend/pwa/boot.js', import.meta.url), 'utf8');

class FakeEl {
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  style = { cssText: '' };
  textContent = '';
  disabled = false;
  listeners: Record<string, (() => void)[]> = {};
  private classes = new Set<string>();
  constructor(
    readonly tagName: string,
    extra: Record<string, unknown> = {},
  ) {
    Object.assign(this, extra);
  }
  classList = {
    add: (c: string) => void this.classes.add(c),
    remove: (c: string) => void this.classes.delete(c),
    contains: (c: string) => this.classes.has(c),
  };
  get firstChild(): FakeEl | null {
    return this.children[0] ?? null;
  }
  appendChild(c: FakeEl) {
    this.children.push(c);
    return c;
  }
  removeChild(c: FakeEl) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  addEventListener(t: string, f: () => void) {
    (this.listeners[t] ??= []).push(f);
  }
  getContext() {
    return {};
  }
  /** All text below this element. */
  text(): string {
    return [this.textContent, ...this.children.map((c) => c.text())].join(' ').trim();
  }
  find(tag: string): FakeEl | undefined {
    for (const c of this.children) {
      if (c.tagName === tag) return c;
      const deep = c.find(tag);
      if (deep) return deep;
    }
    return undefined;
  }
}

interface Env {
  ctx: vm.Context;
  win: Record<string, unknown> & { __tkBoot: { done(): void; retry(): void; unsupported: string[] }; __tkStarted?: boolean };
  boot: FakeEl;
  fire: (type: string, event: unknown) => void;
  reloads: number;
  fetched: { url: string; cache?: string }[];
  unregistered: number;
  deleted: string[];
}

function load(opts: { noModule?: boolean; online?: boolean; preamble?: string; session?: Map<string, string> } = {}): Env {
  const boot = new FakeEl('DIV', { id: 'boot' });
  const body = new FakeEl('BODY');
  const winListeners: Record<string, ((e: unknown) => void)[]> = {};
  const session = opts.session ?? new Map<string, string>();
  const env = { reloads: 0, fetched: [] as { url: string; cache?: string }[], unregistered: 0, deleted: [] as string[] } as Env;
  const document = {
    body,
    createElement: (tag: string) => (tag === 'script' ? new FakeEl('SCRIPT', opts.noModule === false ? {} : { noModule: false }) : new FakeEl(tag.toUpperCase())),
    getElementById: (id: string) => (id === 'boot' ? boot : null),
    querySelector: () => ({ src: 'https://game.test/assets/index-abc.js' }),
    addEventListener: () => undefined,
  };
  const win: Record<string, unknown> = {
    document,
    location: { href: 'https://game.test/', origin: 'https://game.test', reload: () => env.reloads++ },
    navigator: {
      onLine: opts.online ?? true,
      serviceWorker: { getRegistrations: async () => [{ unregister: async () => (env.unregistered++, true) }] },
    },
    caches: { keys: async () => ['tk-b1', 'other-app'], delete: async (k: string) => (env.deleted.push(k), true) },
    sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v), removeItem: (k: string) => void session.delete(k) },
    fetch: async (url: string, init?: { cache?: string }) => (env.fetched.push({ url, cache: init?.cache }), { ok: true }),
    requestAnimationFrame: () => 0,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    addEventListener: (t: string, f: (e: unknown) => void) => void (winListeners[t] ??= []).push(f),
  };
  win.window = win;
  const ctx = vm.createContext(win);
  if (opts.preamble) vm.runInContext(opts.preamble, ctx);
  vm.runInContext(SOURCE, ctx);
  Object.assign(env, { ctx, win, boot, fire: (type: string, event: unknown) => winListeners[type]?.forEach((f) => f(event)) });
  return env;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('polyfills (iOS 15.0-15.3, Android WebView < 98)', () => {
  const env = () => load({ preamble: 'delete Array.prototype.at; delete String.prototype.at; delete Object.hasOwn;' });

  it('adds structuredClone, .at() and Object.hasOwn where missing', () => {
    const { ctx } = env();
    expect(vm.runInContext('typeof structuredClone', ctx)).toBe('function');
    expect(vm.runInContext('[1, 2, 3].at(-1)', ctx)).toBe(3);
    expect(vm.runInContext('[1, 2, 3].at(5)', ctx)).toBeUndefined();
    expect(vm.runInContext("'abc'.at(-2)", ctx)).toBe('b');
    expect(vm.runInContext('new Uint8Array([4, 5]).at(-1)', ctx)).toBe(5);
    expect(vm.runInContext("Object.hasOwn({ a: 1 }, 'a') && !Object.hasOwn({}, 'toString')", ctx)).toBe(true);
    // Not enumerable: `for…in` over an array never sees it.
    expect(vm.runInContext('Object.keys(Array.prototype).includes("at")', ctx)).toBe(false);
  });

  it('structuredClone deep-copies the plain data the game clones (villages, battle records)', () => {
    const { ctx } = env();
    const out = vm.runInContext(
      `(() => {
        const src = { n: 1, s: 'x', b: true, nil: null, u: undefined, arr: [1, { k: [2] }], date: new Date(5), map: new Map([['a', { v: 1 }]]), set: new Set([1, 2]), bytes: new Uint8Array([1, 2, 3]) };
        src.self = src;
        const c = structuredClone(src);
        c.arr[1].k.push(9);
        c.map.get('a').v = 7;
        return {
          independent: src.arr[1].k.length === 1 && src.map.get('a').v === 1,
          values: [c.n, c.s, c.b, c.nil, 'u' in c && c.u === undefined, c.date.getTime(), c.set.has(2), Array.from(c.bytes).join(',')],
          cycle: c.self === c && c !== src,
          types: [c.date instanceof Date, c.map instanceof Map, c.set instanceof Set, c.bytes instanceof Uint8Array, Array.isArray(c.arr)],
        };
      })()`,
      ctx,
    );
    expect(out.independent).toBe(true);
    expect(out.values).toEqual([1, 'x', true, null, true, 5, true, '1,2,3']);
    expect(out.cycle).toBe(true);
    expect(out.types).toEqual([true, true, true, true, true]);
  });

  it('structuredClone refuses functions like the real one', () => {
    const { ctx } = env();
    expect(vm.runInContext("(() => { try { structuredClone({ f() {} }); return 'cloned'; } catch (e) { return e.name; } })()", ctx)).toBe('DataCloneError');
    expect(vm.runInContext("(() => { try { structuredClone(); return 'ok'; } catch (e) { return e.name; } })()", ctx)).toBe('TypeError');
  });

  it('matches the platform structuredClone on a village-shaped object', () => {
    const village = { resources: { acorns: 10, dew: 0 }, buildings: [{ id: 'b1', type: 'hut', x: 1, y: 2, level: 3, upgrade: null }], training: [], flags: { sandbox: false }, note: undefined };
    const { ctx } = env();
    ctx.input = village;
    const ours = vm.runInContext('JSON.stringify(structuredClone(input))', ctx);
    expect(ours).toBe(JSON.stringify(structuredClone(village)));
  });
});

describe('feature check', () => {
  it('a browser without ES modules gets "needs a newer browser" instead of an endless splash', () => {
    const { boot, win } = load({ noModule: false });
    expect(win.__tkBoot.unsupported).toContain('JavaScript modules');
    expect(boot.text()).toMatch(/needs a newer browser/);
    expect(boot.text()).toMatch(/JavaScript modules/);
  });

  it('a modern browser passes and keeps the splash', () => {
    const { boot, win } = load();
    expect(win.__tkBoot.unsupported).toEqual([]);
    expect(boot.children).toHaveLength(0);
  });
});

describe('load guard', () => {
  it('the game script failing to download shows "Couldn\'t load Kagemura" with Retry', () => {
    const { boot, fire } = load();
    fire('error', { target: { tagName: 'SCRIPT' } });
    expect(boot.text()).toMatch(/Couldn't load Kagemura/);
    expect(boot.find('BUTTON')?.textContent).toBe('Retry');
  });

  it('a parse error in the game module before it started shows the same screen; other origins are ignored', () => {
    const a = load();
    a.fire('error', { target: a.win, message: 'SyntaxError: Unexpected token', filename: 'chrome-extension://x/inject.js' });
    expect(a.boot.children).toHaveLength(0);
    a.fire('error', { target: a.win, message: 'SyntaxError: Unexpected token', filename: 'https://game.test/assets/index-abc.js' });
    expect(a.boot.text()).toMatch(/Couldn't load Kagemura/);
    // Once the game is running, its own errors are its business.
    const b = load();
    b.win.__tkStarted = true;
    b.fire('error', { target: b.win, message: 'boom', filename: 'https://game.test/assets/index-abc.js' });
    expect(b.boot.children).toHaveLength(0);
  });

  it('after 25 s without the first frame it says so, and the game can still take over', () => {
    const { boot, win } = load();
    vi.advanceTimersByTime(24_000);
    expect(boot.children).toHaveLength(0);
    vi.advanceTimersByTime(2_000);
    expect(boot.text()).toMatch(/taking a long time/);
    win.__tkBoot.done();
    expect(boot.style.cssText).toBe(''); // the splash is the game's again (it fades it out)
  });

  it('progress restarts the clock; the slow card sits under the splash and goes when progress resumes', () => {
    const { boot, win } = load();
    const api = win.__tkBoot as unknown as { progress(t?: string): void; done(): void };
    const status = new FakeEl('P', { className: 'boot-status' });
    boot.appendChild(status);
    // A slow phone on a slow network: a step every 20 s never trips the 25 s card.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(20_000);
      api.progress(`Painting the village… ${i * 20}%`);
    }
    expect(boot.text()).not.toMatch(/taking a long time/);
    // Nothing for 25 s: the card is added, and the splash (with its status line) stays.
    vi.advanceTimersByTime(26_000);
    expect(boot.text()).toMatch(/taking a long time/);
    expect(boot.children).toContain(status);
    // Progress resumes: the card goes, the clock starts over.
    api.progress('Lighting the lanterns…');
    expect(boot.text()).not.toMatch(/taking a long time/);
    expect(boot.children).toContain(status);
    vi.advanceTimersByTime(26_000);
    expect(boot.text()).toMatch(/taking a long time/);
    api.done();
    expect(boot.text()).not.toMatch(/taking a long time/);
  });

  it('done() stands the guard down', () => {
    const { boot, win, fire } = load();
    win.__tkBoot.done();
    vi.advanceTimersByTime(60_000);
    fire('error', { target: { tagName: 'SCRIPT' } });
    expect(boot.children).toHaveLength(0);
  });

  it('Retry re-downloads past the HTTP cache; a second Retry also drops the offline copy (online only)', async () => {
    const session = new Map<string, string>();
    const first = load({ session });
    first.win.__tkBoot.retry();
    await vi.runAllTimersAsync();
    expect(first.fetched.map((f) => f.cache)).toEqual(['reload', 'reload']);
    expect(first.fetched.map((f) => f.url)).toEqual(['https://game.test/', 'https://game.test/assets/index-abc.js']);
    expect(first.unregistered).toBe(0);
    expect(first.reloads).toBe(1);

    const second = load({ session });
    second.win.__tkBoot.retry();
    await vi.runAllTimersAsync();
    expect(second.unregistered).toBe(1);
    expect(second.deleted).toEqual(['tk-b1']); // other apps' caches stay
    expect(second.reloads).toBe(1);

    const offline = load({ session, online: false });
    offline.win.__tkBoot.retry();
    await vi.runAllTimersAsync();
    expect(offline.unregistered).toBe(0); // offline: the offline copy is all the player has
    expect(offline.reloads).toBe(1);
  });

  it('a successful start clears the retry count', async () => {
    const session = new Map<string, string>();
    const a = load({ session });
    a.win.__tkBoot.retry();
    await vi.runAllTimersAsync();
    expect(session.get('tk.bootRetry')).toBe('1');
    load({ session }).win.__tkBoot.done();
    expect(session.has('tk.bootRetry')).toBe(false);
  });
});

describe('ES5 only (it must run on browsers too old for the game)', () => {
  it('has no arrow functions, let/const, classes, template literals or trailing commas in calls', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
    expect(code).not.toMatch(/=>/);
    expect(code).not.toMatch(/\b(let|const|class)\s/);
    expect(code).not.toMatch(/`/);
    expect(code).not.toMatch(/,\s*\)/);
  });
});
