import type { SaveFile } from '../../gameplay/sim/save';
import { KV_STORE, transact } from './idb';

/**
 * Refused a save because another tab or window saved this village after this one
 * loaded it. A tab left open must never write its old village over newer progress.
 */
export class SaveConflictError extends Error {
  constructor() {
    super('This village is open in another tab or window.');
    this.name = 'SaveConflictError';
  }
}

/** A stored save carries a revision: each write says which revision it was based on. */
type Stored = { rev?: number } | null | undefined;

/** The next revision, or a conflict when the stored save is not the one this copy last read or wrote. */
function nextRevision(stored: Stored, rev: number): number {
  if (stored && (stored.rev ?? 0) !== rev) throw new SaveConflictError();
  return rev + 1;
}

export interface SaveBackup {
  key: string;
  raw: unknown;
}

/** Where the village is saved. IndexedDB in the browser; memory in tests. */
export interface SaveStore {
  load(): Promise<unknown | null>;
  /** Rejects with `SaveConflictError` when another tab or window has saved since. */
  save(file: SaveFile): Promise<void>;
  clear(): Promise<void>;
  /** Keep a copy of a save that could not be loaded, so it is never silently lost. */
  backupDamaged(raw: unknown): Promise<void>;
  /** Saves kept by `backupDamaged`, newest first. */
  listBackups(): Promise<SaveBackup[]>;
  deleteBackup(key: string): Promise<void>;
  /** False when saving is not possible (e.g. some private-browsing modes). */
  readonly persistent: boolean;
  /**
   * Beast Mode SAV-03: earlier saves of this village, newest first (`GENERATIONS` of them, the first save of each
   * start and then at most one every `GENERATION_EVERY_MS`), for an automatic fallback when the latest cannot be read.
   */
  previous?(): Promise<unknown[]>;
}

/** SAV-03: rolling copies kept beside the save. */
export const GENERATIONS = 2;
/** SAV-03: a new generation at most this often (and on each start's first save). */
export const GENERATION_EVERY_MS = 10 * 60_000;
const generationKey = (key: string, n: number) => `${key}-prev-${n}`;

const SAVE_KEY = 'village';
const backupPrefix = (key: string) => `${key}-damaged-`;

/**
 * Backups kept per save (device F15): a village stuck in a load-repair loop wrote a new copy on
 * every start, without limit, on phones with little storage (and Android Auto Backup stops above
 * 25 MB). The newest are kept; recovery offers the furthest-along one among them.
 */
export const MAX_BACKUPS = 5;

/** Backup keys to delete so only the newest `max` stay (keys end in the time they were made). */
export function backupsToDrop(keys: readonly string[], max = MAX_BACKUPS): string[] {
  const stamp = (k: string) => Number(k.slice(k.lastIndexOf('-') + 1)) || 0;
  const newestFirst = [...keys].sort((a, b) => stamp(b) - stamp(a));
  return newestFirst.slice(Math.max(0, max));
}

/** What a browser's storage is to its tabs: pass one to two stores to act out two tabs in a test. */
export interface MemorySlot {
  data: string | null;
  /** SAV-03: earlier copies, newest first (like the browser's storage, shared by every store on the slot). */
  generations?: string[];
}

export class MemorySaveStore implements SaveStore {
  readonly persistent = false;
  private rev = 0;
  private lastRoll = -Infinity;
  constructor(
    private readonly slot: MemorySlot = { data: null },
    private readonly now: () => number = () => Date.now(),
  ) {}
  /** SAV-03: earlier copies, newest first (as JSON, like the slot). */
  get generations(): string[] {
    return (this.slot.generations ??= []);
  }
  async previous(): Promise<unknown[]> {
    return this.generations.map((g) => JSON.parse(g) as unknown);
  }
  async load(): Promise<unknown | null> {
    const raw = this.slot.data ? (JSON.parse(this.slot.data) as { rev?: number }) : null;
    this.rev = raw?.rev ?? 0;
    return raw;
  }
  async save(file: SaveFile): Promise<void> {
    const next = nextRevision(this.slot.data ? JSON.parse(this.slot.data) : null, this.rev);
    if (this.slot.data && this.now() - this.lastRoll >= GENERATION_EVERY_MS) {
      this.generations.unshift(this.slot.data);
      this.generations.splice(GENERATIONS);
      this.lastRoll = this.now();
    }
    this.slot.data = JSON.stringify({ ...file, rev: next });
    this.rev = next;
  }
  async clear(): Promise<void> {
    this.slot.data = null;
  }
  readonly backups: unknown[] = [];
  async backupDamaged(raw: unknown): Promise<void> {
    this.backups.push(raw);
    if (this.backups.length > MAX_BACKUPS) this.backups.splice(0, this.backups.length - MAX_BACKUPS);
  }
  async listBackups(): Promise<SaveBackup[]> {
    return this.backups.map((raw, i) => ({ key: `memory-${i}`, raw })).reverse();
  }
  async deleteBackup(key: string): Promise<void> {
    this.backups.splice(Number(key.replace('memory-', '')), 1);
  }
}

/** The testing sandbox keeps its own village under this key, so testing tools never touch the real save. */
export const SANDBOX_SAVE_KEY = 'village-sandbox';

export class IdbSaveStore implements SaveStore {
  readonly persistent = true;
  private rev = 0;
  private lastRoll = -Infinity;
  async previous(): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let n = 1; n <= GENERATIONS; n++) {
      const v = await transact<unknown>(this.db, KV_STORE, 'readonly', (s) => s.get(generationKey(this.key, n)));
      if (v) out.push(v);
    }
    return out;
  }
  constructor(
    private readonly db: IDBDatabase,
    private readonly key: string = SAVE_KEY,
  ) {}
  async load(): Promise<unknown | null> {
    const v = await transact<unknown>(this.db, KV_STORE, 'readonly', (s) => s.get(this.key));
    this.rev = (v as Stored)?.rev ?? 0;
    return v ?? null;
  }
  /** The check and the write share one transaction, so two tabs can't slip between them. */
  save(file: SaveFile): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(KV_STORE, 'readwrite');
      const store = tx.objectStore(KV_STORE);
      let next = 0;
      let rolled = 0;
      let conflict: SaveConflictError | null = null;
      const read = store.get(this.key);
      read.onsuccess = () => {
        try {
          next = nextRevision(read.result as Stored, this.rev);
          // Beast Mode SAV-03: in the same transaction, the save being replaced becomes generation 1 (the older
          // ones shift down), on each start's first save and then at most every GENERATION_EVERY_MS.
          const t = Date.now();
          if (read.result && t - this.lastRoll >= GENERATION_EVERY_MS) {
            rolled = t;
            for (let n = GENERATIONS; n > 1; n--) {
              const from = generationKey(this.key, n - 1);
              const to = generationKey(this.key, n);
              const older = store.get(from);
              older.onsuccess = () => {
                if (older.result) store.put(older.result, to);
              };
            }
            store.put(read.result, generationKey(this.key, 1));
          }
          store.put({ ...file, rev: next }, this.key);
        } catch (e) {
          conflict = e as SaveConflictError;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        this.rev = next;
        if (rolled) this.lastRoll = rolled;
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(conflict ?? tx.error ?? new Error('Transaction aborted'));
    });
  }
  async clear(): Promise<void> {
    await transact(this.db, KV_STORE, 'readwrite', (s) => s.delete(this.key));
  }
  async backupDamaged(raw: unknown): Promise<void> {
    await transact(this.db, KV_STORE, 'readwrite', (s) => s.put(raw, `${backupPrefix(this.key)}${Date.now()}`));
    // Only the newest MAX_BACKUPS stay (device F15). A failed clean-up keeps them all, never the save.
    try {
      const prefix = backupPrefix(this.key);
      const keys = (await transact<IDBValidKey[]>(this.db, KV_STORE, 'readonly', (s) => s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`)))) ?? [];
      for (const key of backupsToDrop(keys.map(String))) await transact(this.db, KV_STORE, 'readwrite', (s) => s.delete(key));
    } catch (e) {
      console.warn('Could not prune old backups', e);
    }
  }
  async listBackups(): Promise<SaveBackup[]> {
    const prefix = backupPrefix(this.key);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const keys = (await transact<IDBValidKey[]>(this.db, KV_STORE, 'readonly', (s) => s.getAllKeys(range))) ?? [];
    const out: SaveBackup[] = [];
    for (const key of [...keys].reverse()) {
      out.push({ key: String(key), raw: await transact<unknown>(this.db, KV_STORE, 'readonly', (s) => s.get(key)) });
    }
    return out;
  }
  async deleteBackup(key: string): Promise<void> {
    await transact(this.db, KV_STORE, 'readwrite', (s) => s.delete(key));
  }
}
