/**
 * IndexedDB start-up and lost connections (client re-audit item 9): an open that never answers
 * gives up after 5 s (the game then runs on memory with a banner), and a connection the browser
 * closed (iOS kills its IndexedDB server in the background) is reopened and the write retried.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDB_OPEN_TIMEOUT_MS, isConnectionLost, openGameDb, reconnected, transact } from '../../../src/backend/persist/idb';

const lost = () => Object.assign(new Error('The database connection is closing.'), { name: 'InvalidStateError' });

/** A minimal key-value database: one object store, transactions that complete on the next tick. */
class FakeDb {
  closed = false;
  broken = false;
  onclose: (() => void) | null = null;
  onversionchange: (() => void) | null = null;
  objectStoreNames = { contains: () => true } as unknown as DOMStringList;
  name = 'toadstool-kingdoms';
  constructor(readonly data: Map<string, unknown>) {}
  transaction() {
    if (this.closed || this.broken) throw lost();
    const listeners: Record<string, (() => void)[]> = {};
    const tx = {
      error: null as Error | null,
      oncomplete: null as null | (() => void),
      onerror: null as null | (() => void),
      onabort: null as null | (() => void),
      addEventListener: (t: string, f: () => void) => void (listeners[t] ??= []).push(f),
      objectStore: () => ({
        put: (v: unknown, k: string) => {
          const req = { result: k, onsuccess: null as null | (() => void) };
          setTimeout(() => {
            this.data.set(k, v);
            req.onsuccess?.();
            tx.oncomplete?.();
          }, 0);
          return req;
        },
        get: (k: string) => {
          const req = { result: this.data.get(k), onsuccess: null as null | (() => void) };
          setTimeout(() => {
            req.onsuccess?.();
            tx.oncomplete?.();
          }, 0);
          return req;
        },
      }),
    };
    return tx;
  }
  close() {
    this.closed = true;
  }
}

function fakeIndexedDb(opts: { answer: boolean }) {
  const data = new Map<string, unknown>();
  const opened: FakeDb[] = [];
  const factory = {
    open: () => {
      const req = { result: null as unknown, onsuccess: null as null | (() => void), onerror: null, onblocked: null, onupgradeneeded: null };
      if (opts.answer)
        setTimeout(() => {
          const db = new FakeDb(data);
          opened.push(db);
          req.result = db;
          req.onsuccess?.();
        }, 0);
      return req;
    },
  };
  vi.stubGlobal('indexedDB', factory);
  return { data, opened };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('opening IndexedDB', () => {
  it('gives up after 5 s when the browser never answers', async () => {
    vi.useFakeTimers();
    fakeIndexedDb({ answer: false });
    const p = openGameDb();
    const outcome = p.then(() => 'opened', (e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(IDB_OPEN_TIMEOUT_MS - 1);
    let settled = false;
    void outcome.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await outcome).toBe('IndexedDB did not answer');
  });

  it('opens normally when it answers', async () => {
    fakeIndexedDb({ answer: true });
    const db = await openGameDb();
    await transact(db, 'kv', 'readwrite', (s) => s.put('v1', 'k'));
    expect(await transact(db, 'kv', 'readonly', (s) => s.get('k'))).toBe('v1');
  });
});

describe('a lost connection', () => {
  it('is recognised by name (InvalidStateError, UnknownError) or message', () => {
    expect(isConnectionLost(lost())).toBe(true);
    expect(isConnectionLost(Object.assign(new Error('x'), { name: 'UnknownError' }))).toBe(true);
    expect(isConnectionLost(new Error('Connection to Indexed Database server lost. Refresh the page to try again'))).toBe(true);
    expect(isConnectionLost(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))).toBe(false);
  });

  it('closed by the browser: the handle reopens and the write goes through', async () => {
    const { data, opened } = fakeIndexedDb({ answer: true });
    const db = await openGameDb();
    opened[0].closed = true;
    opened[0].onclose?.(); // iOS ended the connection
    await transact(db, 'kv', 'readwrite', (s) => s.put('after', 'k'));
    expect(data.get('k')).toBe('after');
    expect(opened).toHaveLength(2);
  });

  it('noticed only when a write fails: the write is retried once on a new connection', async () => {
    const { data, opened } = fakeIndexedDb({ answer: true });
    const db = await openGameDb();
    opened[0].broken = true; // no close event (Safari): the next transaction throws
    await transact(db, 'kv', 'readwrite', (s) => s.put('retried', 'k'));
    expect(data.get('k')).toBe('retried');
    expect(opened).toHaveLength(2);
  });

  it('`reconnected` lets the save store retry its own write (main.ts)', async () => {
    const { opened } = fakeIndexedDb({ answer: true });
    const db = await openGameDb();
    opened[0].broken = true;
    let error: unknown;
    try {
      db.transaction('kv', 'readwrite');
    } catch (e) {
      error = e;
    }
    expect(await reconnected(db, error)).toBe(true);
    expect(() => db.transaction('kv', 'readwrite')).not.toThrow();
    // Other failures are not connection problems: nothing to retry.
    expect(await reconnected(db, Object.assign(new Error('full'), { name: 'QuotaExceededError' }))).toBe(false);
  });
});
