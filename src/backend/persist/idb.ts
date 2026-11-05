/** A very small promise wrapper around IndexedDB. */

const DB_NAME = 'toadstool-kingdoms';
const DB_VERSION = 1;
export const KV_STORE = 'kv';
export const EVENTS_STORE = 'events';

/**
 * How long `indexedDB.open` may take (client re-audit item 9). Some iOS versions never answer an
 * open after the IndexedDB server died; the game then starts on the memory store with a banner
 * instead of a splash that never ends.
 */
export const IDB_OPEN_TIMEOUT_MS = 5000;

/** The browser dropped our connection (iOS kills its IndexedDB server in the background). */
export function isConnectionLost(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  const message = String((e as { message?: string } | null)?.message ?? '');
  return name === 'InvalidStateError' || name === 'UnknownError' || /connection.*(lost|clos)/i.test(message);
}

function openRaw(timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    let settled = false;
    const finish = (err: Error | null, db?: IDBDatabase) => {
      if (settled) {
        db?.close(); // answered after the deadline: nobody uses it
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(db!);
    };
    const timer = setTimeout(() => finish(new Error('IndexedDB did not answer')), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      finish(e as Error);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
      if (!db.objectStoreNames.contains(EVENTS_STORE)) db.createObjectStore(EVENTS_STORE, { autoIncrement: true });
    };
    req.onsuccess = () => finish(null, req.result);
    req.onerror = () => finish(req.error ?? new Error('Could not open IndexedDB'));
    req.onblocked = () => finish(new Error('IndexedDB is blocked by another tab'));
  });
}

/**
 * The game's database handle. It stands in for an `IDBDatabase` (the save and event stores only
 * call `transaction`) and reopens the connection once it is lost: on `close` (the browser ended
 * it), on `versionchange` (another tab upgrades), or when a transaction fails with
 * `InvalidStateError`/`UnknownError`. A write that failed that way is retried once by `transact`;
 * the save store's own write is retried by the game (`main.ts`, `reconnected`).
 */
class ReconnectingDb {
  private reopening: Promise<boolean> | null = null;
  constructor(
    private current: IDBDatabase,
    private readonly timeoutMs: number,
  ) {
    this.watch(current);
  }

  get name(): string {
    return this.current.name;
  }
  get objectStoreNames(): DOMStringList {
    return this.current.objectStoreNames;
  }

  transaction(store: string | string[], mode?: IDBTransactionMode): IDBTransaction {
    let tx: IDBTransaction;
    try {
      tx = this.current.transaction(store, mode);
    } catch (e) {
      if (isConnectionLost(e)) void this.reopen();
      throw e;
    }
    const check = () => {
      if (tx.error && isConnectionLost(tx.error)) void this.reopen();
    };
    tx.addEventListener('error', check);
    tx.addEventListener('abort', check);
    return tx;
  }

  close(): void {
    this.current.close();
  }

  /** Reopen (once at a time). Resolves true when a new connection is in place. */
  reopen(): Promise<boolean> {
    if (!this.reopening) {
      try {
        this.current.close();
      } catch {
        /* already closed */
      }
      this.reopening = openRaw(this.timeoutMs).then(
        (db) => {
          this.current = db;
          this.watch(db);
          this.reopening = null;
          return true;
        },
        (e) => {
          console.warn('IndexedDB could not be reopened', e);
          this.reopening = null;
          return false;
        },
      );
    }
    return this.reopening;
  }

  /** Waits for a reopen in progress (true if the handle works afterwards). */
  async settled(): Promise<boolean> {
    return this.reopening ? this.reopening : true;
  }

  private watch(db: IDBDatabase): void {
    db.onclose = () => {
      if (db === this.current) void this.reopen();
    };
    db.onversionchange = () => {
      db.close();
      if (db === this.current) void this.reopen();
    };
  }
}

/** Open the game's database: a reconnecting handle, or a rejection after `timeoutMs`. */
export async function openGameDb(timeoutMs = IDB_OPEN_TIMEOUT_MS): Promise<IDBDatabase> {
  const db = await openRaw(timeoutMs);
  return new ReconnectingDb(db, timeoutMs) as unknown as IDBDatabase;
}

/**
 * After a write failed because the connection was lost: wait for (or start) the reopen. Resolves
 * true when the handle works again, so the write can be tried once more.
 */
export async function reconnected(db: IDBDatabase, error: unknown): Promise<boolean> {
  if (!(db instanceof ReconnectingDb) || !isConnectionLost(error)) return false;
  const pending = await db.settled();
  // A failure noticed before the handle started reopening: reopen now.
  return pending ? true : db.reopen();
}

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactOnce<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result: T | undefined;
    const req = fn(tx.objectStore(store));
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/** Run `fn` inside a transaction and resolve when the transaction commits (once more after a lost connection). */
export async function transact<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  try {
    return await transactOnce(db, store, mode, fn);
  } catch (e) {
    if (!(await reconnected(db, e))) throw e;
    return transactOnce(db, store, mode, fn);
  }
}
