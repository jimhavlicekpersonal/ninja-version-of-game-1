import type { SaveFile } from '../sim/save';
import { KV_STORE, transact } from './idb';

/** Where the village is saved. IndexedDB in the browser; memory in tests. */
export interface SaveStore {
  load(): Promise<unknown | null>;
  save(file: SaveFile): Promise<void>;
  clear(): Promise<void>;
  /** Keep a copy of a save that could not be loaded, so it is never silently lost. */
  backupDamaged(raw: unknown): Promise<void>;
  /** False when saving is not possible (e.g. some private-browsing modes). */
  readonly persistent: boolean;
}

const SAVE_KEY = 'village';

export class MemorySaveStore implements SaveStore {
  readonly persistent = false;
  private data: string | null = null;
  async load(): Promise<unknown | null> {
    return this.data ? JSON.parse(this.data) : null;
  }
  async save(file: SaveFile): Promise<void> {
    this.data = JSON.stringify(file);
  }
  async clear(): Promise<void> {
    this.data = null;
  }
  readonly backups: unknown[] = [];
  async backupDamaged(raw: unknown): Promise<void> {
    this.backups.push(raw);
  }
}

export class IdbSaveStore implements SaveStore {
  readonly persistent = true;
  constructor(private readonly db: IDBDatabase) {}
  async load(): Promise<unknown | null> {
    const v = await transact<unknown>(this.db, KV_STORE, 'readonly', (s) => s.get(SAVE_KEY));
    return v ?? null;
  }
  async save(file: SaveFile): Promise<void> {
    await transact(this.db, KV_STORE, 'readwrite', (s) => s.put(file, SAVE_KEY));
  }
  async clear(): Promise<void> {
    await transact(this.db, KV_STORE, 'readwrite', (s) => s.delete(SAVE_KEY));
  }
  async backupDamaged(raw: unknown): Promise<void> {
    await transact(this.db, KV_STORE, 'readwrite', (s) => s.put(raw, `${SAVE_KEY}-damaged-${Date.now()}`));
  }
}
