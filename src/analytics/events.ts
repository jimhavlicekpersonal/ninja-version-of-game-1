import type { Clock } from '../sim/clock';
import { EVENTS_STORE, request, transact } from '../persist/idb';

/** Analytics events. Phase 1 logs session_start and upgrade_start; the rest arrive in later phases. */
export type AnalyticsEventName =
  | 'session_start'
  | 'upgrade_start'
  | 'upgrade_cancel'
  | 'collect'
  | 'skip_used'
  | 'raid_end'
  | 'offer_shown'
  | 'purchase'
  | 'save_export'
  | 'save_import'
  | 'moonstone_spend'
  | 'reward'
  | 'donation'
  | 'grove_raid_end'
  | 'tutorial_step'
  | 'session_reminder';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  at: number;
  session: string;
  props: Record<string, unknown>;
}

export interface EventStore {
  add(e: AnalyticsEvent): Promise<void>;
  /** Most recent first. */
  recent(limit: number): Promise<AnalyticsEvent[]>;
  clear(): Promise<void>;
}

export class MemoryEventStore implements EventStore {
  readonly events: AnalyticsEvent[] = [];
  async add(e: AnalyticsEvent): Promise<void> {
    this.events.push(e);
  }
  async recent(limit: number): Promise<AnalyticsEvent[]> {
    return this.events.slice(-limit).reverse();
  }
  async clear(): Promise<void> {
    this.events.length = 0;
  }
}

export class IdbEventStore implements EventStore {
  constructor(
    private readonly db: IDBDatabase,
    private readonly maxEvents = 5000,
  ) {}
  async add(e: AnalyticsEvent): Promise<void> {
    await transact(this.db, EVENTS_STORE, 'readwrite', (s) => s.add(e));
  }
  async recent(limit: number): Promise<AnalyticsEvent[]> {
    const tx = this.db.transaction(EVENTS_STORE, 'readonly');
    const store = tx.objectStore(EVENTS_STORE);
    const out: AnalyticsEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const cur = store.openCursor(null, 'prev');
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || out.length >= limit) return resolve();
        out.push(c.value as AnalyticsEvent);
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  }
  async clear(): Promise<void> {
    await transact(this.db, EVENTS_STORE, 'readwrite', (s) => s.clear());
  }
  /** Drop the oldest events beyond maxEvents. */
  async prune(): Promise<void> {
    const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(EVENTS_STORE);
    const count = await request(store.count());
    let extra = count - this.maxEvents;
    if (extra <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || extra <= 0) return resolve();
        c.delete();
        extra--;
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
  }
}

function makeSessionId(): string {
  // crypto.randomUUID only exists on HTTPS/localhost; the LAN dev server is plain HTTP.
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export class Analytics {
  readonly session: string;
  constructor(
    private readonly store: EventStore,
    private readonly clock: Clock,
    session?: string,
  ) {
    this.session = session ?? makeSessionId();
  }
  log(name: AnalyticsEventName, props: Record<string, unknown> = {}): void {
    const e: AnalyticsEvent = { name, at: this.clock.now(), session: this.session, props };
    this.store.add(e).catch((err) => console.warn('analytics write failed', err));
  }
  recent(limit = 100): Promise<AnalyticsEvent[]> {
    return this.store.recent(limit);
  }
}
