/**
 * Client re-audit item 13: the connection follows the device's network and the app coming back.
 * It said "Online" for up to a minute after the network went away and "Connecting…" for 15 s
 * after it came back, because only the 60 s sync and the retry timer moved it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import { world } from '../server/harness';

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
}

function game(w: ReturnType<typeof world>): GameLink {
  const g = {
    data: w.data,
    state: createNewVillage(w.now(), w.data),
    now: () => w.now(),
    dispatch(cmd: Command) {
      const r = applyCommand(g.state, cmd, g.now(), w.data);
      if (r.ok) g.state = r.state;
      return r;
    },
  };
  return g;
}

/** A browser window and document that only carry events. */
function browserEvents() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  return { win, doc };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => vi.unstubAllGlobals());

describe('connection and the device network', () => {
  it('goes offline at once on `offline`, and reconnects at once on `online` (no retry wait)', async () => {
    const { win } = browserEvents();
    const w = world();
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    conn.start();
    await conn.sync();
    expect(conn.status).toBe('online');

    win.dispatchEvent(new Event('offline'));
    expect(conn.status).toBe('offline');

    win.dispatchEvent(new Event('online'));
    await settle();
    expect(conn.status).toBe('online');
    conn.stop();
  });

  it('syncs when the app comes back to the front (at most every 5 s)', async () => {
    const { doc } = browserEvents();
    const w = world();
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    conn.start();
    await conn.sync();
    const spy = vi.spyOn(conn, 'sync');
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(spy).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden';
    conn.stop();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(spy).toHaveBeenCalledTimes(1); // stopped: no more listeners
  });
});

describe('Beast Mode SAV-07: backoff, breaker and background pause', () => {
  it('with the server down, hello is asked far less than once a minute over 10 minutes', async () => {
    vi.useFakeTimers();
    try {
      browserEvents();
      const w = world();
      const port = new InProcessServerAdapter(w.core);
      let hellos = 0;
      port.hello = async () => {
        hellos++;
        throw new Error('network down');
      };
      const conn = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
      conn.start();
      for (let s = 0; s < 600; s++) await vi.advanceTimersByTimeAsync(1000);
      expect(hellos).toBeLessThan(8);
      conn.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a hidden page makes no request on the timers', async () => {
    vi.useFakeTimers();
    try {
      const { doc } = browserEvents();
      const w = world();
      const port = new InProcessServerAdapter(w.core);
      const conn = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
      conn.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(conn.status).toBe('online');
      doc.visibilityState = 'hidden';
      let calls = 0;
      for (const name of ['hello', 'me', 'uploadBase', 'defenses', 'sendCommands'] as const) {
        const real = (port as unknown as Record<string, (...a: unknown[]) => unknown>)[name].bind(port);
        (port as unknown as Record<string, (...a: unknown[]) => unknown>)[name] = (...a: unknown[]) => {
          calls++;
          return real(...a);
        };
      }
      for (let s = 0; s < 300; s++) await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(0);
      conn.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unchanged base is uploaded once', async () => {
    browserEvents();
    const w = world();
    const port = new InProcessServerAdapter(w.core);
    let uploads = 0;
    const real = port.uploadBase.bind(port);
    port.uploadBase = async (req) => {
      uploads++;
      return real(req);
    };
    const conn = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const after = uploads;
    await conn.uploadBase();
    await conn.uploadBase();
    expect(uploads).toBe(after);
  });
});

describe('Beast Mode SAV-13: device clock offset', () => {
  it('a server 10 minutes ahead sets clockOffsetMs ≈ 600000 and the warning; a small offset does not warn', async () => {
    const w = world();
    const conn = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => new InProcessServerAdapter(w.core), log: () => undefined });
    conn.noteServerTime(1_000_000 + 600_000 + 50, 1_000_000, 1_000_100);
    expect(Math.abs(conn.clockOffsetMs - 600_000)).toBeLessThan(1000);
    expect(conn.clockWarning).toBe(10);
    const near = new Connection({ game: game(w), builtInUrl: 'test.server', kv: memoryKv(), makePort: () => new InProcessServerAdapter(w.core), log: () => undefined });
    near.noteServerTime(1_000_000 + 60_000, 1_000_000, 1_000_000);
    expect(near.clockWarning).toBeNull();
  });
});
