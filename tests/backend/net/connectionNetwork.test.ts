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
