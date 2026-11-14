/**
 * 2026-11-14 client follow-ups, the game's side of backend A15/A16:
 * - sign-in nonces: `Connection.signInNonce` asks the server once per Apple/Google sign-in (never for
 *   Game Center, never from a server without `signin-nonce`), and `platformSignIn` hands the nonce to
 *   the provider (Apple native: its SHA-256 hex) and returns the raw value beside the token;
 * - token rotation through the real HTTP adapter: store and confirm, the new token is used at once,
 *   a lost confirmation keeps the old token in use and switches on the next 401;
 * - signing out this device: refused with 409 while it holds the last key (nothing changes), else
 *   online play switches off here and the token is forgotten.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Connection, ROTATE_EVERY_MS, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { HttpServerAdapter } from '../../../src/backend/net/httpAdapter';
import { ServerError } from '../../../src/backend/net/ports';
import { Routes } from '../../../src/backend/net/protocol';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { world } from '../server/harness';
import { setup } from '../server/httpHarness';

function memoryKv(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

function village(w: ReturnType<typeof world>): GameLink & { state: VillageState } {
  const state = createNewVillage(w.now(), w.data);
  const g = {
    data: w.data,
    state,
    now: () => w.now(),
    dispatch(cmd: Command) {
      const r = applyCommand(g.state, cmd, g.now(), w.data);
      if (r.ok) g.state = r.state;
      return r;
    },
  };
  g.dispatch({ type: 'setProfile', under18: false, ageBand: 'adult' });
  return g;
}

/** fetch into the Fastify app (no network), optionally dropping answers to simulate a lost reply. */
function injectFetch(s: ReturnType<typeof setup>, opts: { dropAnswer?: (path: string, auth: string | undefined) => boolean } = {}): typeof fetch {
  return (async (input: string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = (init.headers ?? {}) as Record<string, string>;
    const r = await s.app.inject({ method: (init.method ?? 'GET') as 'GET', url: url.pathname + url.search, headers, payload: init.body as string | undefined });
    if (opts.dropAnswer?.(url.pathname, headers.authorization)) throw new TypeError('connection reset');
    return { status: r.statusCode, ok: r.statusCode >= 200 && r.statusCode < 300, text: async () => r.body } as Response;
  }) as typeof fetch;
}

const tokenStore = (initial: string | null = null) => {
  let t = initial;
  return { get: () => t, set: (v: string | null) => (t = v) };
};

describe('A16: rotating this device token (HTTP adapter)', () => {
  it('switches to the new token only after it answered, and the old one stops working', async () => {
    const s = setup();
    const reg = await s.register('Rota');
    const tokens = tokenStore(reg.token);
    const port = new HttpServerAdapter('http://game.test', { tokens, fetch: injectFetch(s), retries: 0, retryDelayMs: 0 });
    expect(await port.rotateToken()).toBe(true);
    expect(tokens.get()).not.toBe(reg.token);
    expect((await port.me()).id).toBe(reg.playerId);
    expect((await s.call('GET', Routes.me, reg.token)).status).toBe(401);
  });

  it('a lost confirmation keeps the old token; if the server did swap, the next 401 switches to the new one', async () => {
    const s = setup();
    const reg = await s.register('Lost');
    const tokens = tokenStore(reg.token);
    let drop = true;
    const fetchFn = injectFetch(s, { dropAnswer: (path, auth) => drop && path === Routes.me && auth !== `Bearer ${reg.token}` });
    const port = new HttpServerAdapter('http://game.test', { tokens, fetch: fetchFn, retries: 0, retryDelayMs: 0 });
    // The server saw the new token's first use (and swapped) but its answer never arrived.
    expect(await port.rotateToken()).toBe(false);
    expect(tokens.get()).toBe(reg.token);
    drop = false;
    // The old token is refused now; the adapter switches to the new one and sends the request again.
    expect((await port.me()).id).toBe(reg.playerId);
    expect(tokens.get()).not.toBe(reg.token);
  });

  it('a rotation nobody confirmed lapses and the old token keeps working', async () => {
    const s = setup();
    const reg = await s.register('Lapse');
    const tokens = tokenStore(reg.token);
    // The confirmation never reaches the server at all.
    const base = injectFetch(s);
    let block = true;
    const fetchFn = (async (input: string, init: RequestInit = {}) => {
      const auth = ((init.headers ?? {}) as Record<string, string>).authorization;
      if (block && new URL(String(input)).pathname === Routes.me && auth !== `Bearer ${reg.token}`) throw new TypeError('offline');
      return base(input, init);
    }) as typeof fetch;
    const port = new HttpServerAdapter('http://game.test', { tokens, fetch: fetchFn, retries: 0, retryDelayMs: 0 });
    expect(await port.rotateToken()).toBe(false);
    block = false;
    s.advance(11 * 60_000);
    expect((await port.me()).id).toBe(reg.playerId);
    expect(tokens.get()).toBe(reg.token);
  });
});

describe('A16: Connection rotates every 30 days and signs this device out', () => {
  let now = Date.UTC(2026, 10, 14);
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts the clock on the first sync and rotates once it has run 30 days', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const rotate = vi.spyOn(port, 'rotateToken');
    const kv = memoryKv();
    const conn = new Connection({ game, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined });
    await conn.sync();
    expect(conn.status).toBe('online');
    expect(rotate).not.toHaveBeenCalled();
    now += ROTATE_EVERY_MS - 1000;
    await conn.sync();
    expect(rotate).not.toHaveBeenCalled();
    const before = port.credentials;
    now += 2000;
    await conn.sync();
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(port.credentials).not.toBe(before);
    expect(Number(kv.get('tk.net.rotatedAt:https://test.server'))).toBe(now);
    await conn.sync();
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it('refuses to sign out the only key (409, nothing changes); with a linked sign-in it signs out and goes offline', async () => {
    const identity = { providers: ['gamecenter' as const], verify: async (_p: string, c: unknown) => ({ provider: 'gamecenter' as const, subject: String((c as { id: string }).id) }) };
    const w = world({ shared: { identity } as never });
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const kv = memoryKv();
    const conn = new Connection({ game, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined });
    await conn.sync();
    expect(conn.canSignOutDevice).toBe(true);
    const err = await conn.signOutDevice().then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).status).toBe(409);
    expect(conn.status).toBe('online');
    expect(port.hasIdentity()).toBe(true);

    // With a linked sign-in the account can come back: this device may go.
    await conn.link('gamecenter', { id: 'gc-1' });
    const id = conn.player!.id;
    await conn.signOutDevice();
    expect(conn.status).toBe('off');
    expect(port.hasIdentity()).toBe(false);
    expect(kv.get('tk.net.rotatedAt:https://test.server')).toBeNull();
    // The account is still there for a linked sign-in.
    expect((await new InProcessServerAdapter(w.core).signIn('gamecenter', { id: 'gc-1' })).playerId).toBe(id);
  });
});

describe('A15: sign-in nonces on the game side', () => {
  it('asks for a nonce only for Apple/Google and only from a server that offers them', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const ask = vi.spyOn(port, 'authNonce');
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    expect(await conn.signInNonce('gamecenter')).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
    const n = await conn.signInNonce('apple');
    expect(typeof n).toBe('string');
    expect(ask).toHaveBeenCalledTimes(1);
    // A nonce fetched ahead is used first (the provider's popup opens straight from the tap).
    conn.prefetchSignInNonce();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const ahead = await conn.signInNonce('google');
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ahead).toBeTruthy();
    expect(ahead).not.toBe(n);
    // An older server without the feature: no nonce, the sign-in goes as before.
    conn.server!.features = conn.server!.features.filter((f) => f !== 'signin-nonce');
    expect(await conn.signInNonce('apple')).toBeUndefined();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('the hashed nonce a native Apple request carries is what the server accepts', async () => {
    const { sha256Hex } = await import('../../../src/backend/platform/auth');
    expect(await sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});
