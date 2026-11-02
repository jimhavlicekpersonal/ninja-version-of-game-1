import type { Clock } from '../../gameplay/sim/clock';
import { EVENTS_STORE, request, transact } from '../persist/idb';

/** Analytics events. Phase 1 logs session_start and upgrade_start; the rest arrive in later phases. */
export type AnalyticsEventName =
  | 'session_start'
  | 'upgrade_start'
  | 'upgrade_cancel'
  | 'research_start'
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
  | 'session_reminder'
  // Shadow Clans: opponent searches (AI vs human availability), world map and tournaments.
  | 'opponent_search'
  | 'world_battle'
  | 'tournament_end'
  | 'defense_seen';

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

// ---------------------------------------------------------------- health view

/** Targets for the health view (competition.json `health`). */
export interface HealthTargets {
  tutorialCompletion: number;
  day1: number;
  day7: number;
  day30: number;
  battlesPerDay: [number, number];
  searchSuccess: number;
}

export interface HealthReport {
  tutorialDone: boolean;
  /** This device came back on day 1 / 7 / 30 after its first session (null = not that old yet). */
  returned: { day1: boolean | null; day7: boolean | null; day30: boolean | null };
  activeDays: number;
  battlesPerActiveDay: number;
  searches: number;
  /** Searches that found at least one opponent (target 99%+). */
  searchSuccess: number | null;
  /** Of searches made online with PvP on, the share that found a real player. */
  humanAvailability: number | null;
  humanBattles: number;
  /** After a first real-player battle, did the player start another? */
  pvpRepeat: boolean | null;
  /** Times the player came back to raids on their village, and how many of those were followed by another visit within two days. */
  defensesSeen: number;
  returnedAfterDefense: number;
  targets: HealthTargets;
}

const DAY_MS = 86_400_000;

/**
 * The game-health numbers that can be read on one device from its own
 * analytics events. The full dashboard (retention across players, matchmaking
 * liquidity per band) needs the server: see /v1/metrics.
 */
export function healthReport(events: AnalyticsEvent[], now: number, targets: HealthTargets): HealthReport {
  const ev = [...events].sort((a, b) => a.at - b.at);
  const sessions = ev.filter((e) => e.name === 'session_start').map((e) => e.at);
  const t0 = sessions[0] ?? now;
  // Day d after the first session: true if there was a session that day, null while it is not over yet.
  const cameBack = (d: number): boolean | null => {
    const from = t0 + d * DAY_MS;
    const to = from + DAY_MS;
    if (sessions.some((t) => t >= from && t < to)) return true;
    return now < to ? null : false;
  };
  const days = new Set(ev.map((e) => Math.floor(e.at / DAY_MS)));
  const battles = ev.filter((e) => e.name === 'raid_end' || e.name === 'world_battle').length;
  const searches = ev.filter((e) => e.name === 'opponent_search');
  const online = searches.filter((e) => e.props.searched);
  const human = ev.filter((e) => e.name === 'raid_end' && e.props.human);
  const defenses = ev.filter((e) => e.name === 'defense_seen');
  return {
    tutorialDone: ev.some((e) => e.name === 'tutorial_step' && e.props.done),
    returned: { day1: cameBack(1), day7: cameBack(7), day30: cameBack(30) },
    activeDays: days.size,
    battlesPerActiveDay: days.size ? battles / days.size : 0,
    searches: searches.length,
    searchSuccess: searches.length ? searches.filter((e) => e.props.ok).length / searches.length : null,
    humanAvailability: online.length ? online.filter((e) => Number(e.props.humans) > 0).length / online.length : null,
    humanBattles: human.length,
    pvpRepeat: human.length ? human.length > 1 : null,
    defensesSeen: defenses.length,
    returnedAfterDefense: defenses.filter((d) => sessions.some((t) => t > d.at + 60_000 && t <= d.at + 2 * DAY_MS)).length,
    targets,
  };
}

