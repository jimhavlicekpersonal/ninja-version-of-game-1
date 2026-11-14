/**
 * Shared play statistics (state-of-the-game report, section 5 step 5, growth 1).
 *
 * Without numbers nothing in a launch can be judged: retention by day (D1/D7/D30), where the
 * tutorial loses players, how many reach a first raid or a first purchase. The game keeps its
 * own event log on the device (`analytics/events.ts`); this is the small part of it a player
 * may choose to share. Rules, enforced on both sides by `cleanStatsEvent`:
 * - Off until an adult player says yes (never asked, never sent for under-18 or unknown age).
 * - Pseudonymous: a random statistics id (`install`), not the player id, the name or the device;
 *   turning sharing off deletes what this id sent and the next yes starts a new id.
 * - Only the events and fields listed in `STATS_EVENTS`: numbers, booleans and short ids. No
 *   names, chat, village, transaction ids or free text. The server stores no IP address with it.
 * Pure: browser and Node.
 */

/** Most events one batch may carry; the game sends smaller batches more often. */
export const STATS_MAX_BATCH = 200;

type Kind = 'number' | 'boolean' | 'id';

/** The shareable events and, for each, the fields that may go with it. */
export const STATS_EVENTS: Readonly<Record<string, Readonly<Record<string, Kind>>>> = {
  session_start: { isNew: 'boolean', platform: 'id' },
  tutorial_step: { step: 'number', done: 'boolean' },
  raid_end: { kind: 'id', stars: 'number', destruction: 'number' },
  offer_shown: { offerId: 'id', trigger: 'id' },
  purchase: { productId: 'id', usd: 'number', kind: 'id' },
  skip_used: { what: 'id', moonstones: 'number' },
  upgrade_start: { building: 'id', toLevel: 'number' },
  research_start: { troop: 'id', toLevel: 'number' },
  session_reminder: { minutes: 'number' },
};

export interface StatsEvent {
  name: string;
  /** Milliseconds since 1970, as the game's clock saw it. */
  at: number;
  props: Record<string, number | boolean | string>;
}

export interface StatsBatch {
  /** The random statistics id (a UUID), not the player id. */
  install: string;
  /** Game build, e.g. "0.1.0+android". */
  build: string;
  /** The balance-bundle experiment arm this game plays ("experiment:arm"), if any. */
  arm?: string;
  /**
   * The device's offset from UTC in minutes (rounded to 15; growth batch 2026-11-14), so days can be
   * counted on the player's own calendar. Absent: days count in UTC.
   */
  tz?: number;
  events: StatsEvent[];
}

/** A UTC offset as shared: whole minutes rounded to 15, −12 h to +14 h; anything else is dropped. */
export function cleanTz(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const q = Math.round(v / 15) * 15;
  return q >= -720 && q <= 840 ? q + 0 : undefined;
}

const ID = /^[a-z0-9_:.-]{1,40}$/i;
export const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The event as it may be shared, or null if it may not be shared at all. */
export function cleanStatsEvent(e: { name?: unknown; at?: unknown; props?: unknown }): StatsEvent | null {
  const allowed = typeof e?.name === 'string' ? STATS_EVENTS[e.name] : undefined;
  if (!allowed || typeof e.at !== 'number' || !Number.isFinite(e.at)) return null;
  const props: StatsEvent['props'] = {};
  const src = (e.props && typeof e.props === 'object' ? e.props : {}) as Record<string, unknown>;
  for (const [k, kind] of Object.entries(allowed)) {
    const v = src[k];
    if (kind === 'number' && typeof v === 'number' && Number.isFinite(v)) props[k] = Math.round(v * 100) / 100;
    else if (kind === 'boolean' && typeof v === 'boolean') props[k] = v;
    else if (kind === 'id' && typeof v === 'string' && ID.test(v)) props[k] = v;
  }
  return { name: e.name as string, at: Math.round(e.at), props };
}

/** A whole batch checked, or why it is refused. */
export function cleanStatsBatch(b: unknown): StatsBatch | { error: string } {
  const x = (b ?? {}) as Record<string, unknown>;
  if (typeof x.install !== 'string' || !INSTALL_ID.test(x.install)) return { error: 'bad statistics id' };
  if (!Array.isArray(x.events) || x.events.length === 0 || x.events.length > STATS_MAX_BATCH) return { error: 'no events, or too many' };
  const build = typeof x.build === 'string' ? x.build.slice(0, 40) : '';
  const arm = typeof x.arm === 'string' && ID.test(x.arm) ? x.arm : undefined;
  const events = x.events.map((e) => cleanStatsEvent(e as never)).filter((e): e is StatsEvent => e !== null);
  const tz = cleanTz(x.tz);
  return { install: x.install.toLowerCase(), build, ...(arm ? { arm } : {}), ...(tz !== undefined ? { tz } : {}), events };
}

/**
 * A stable 0..99 bucket for an id in an experiment (FNV-1a 32 of "experiment:id"): the same id
 * lands in the same arm on every device and on the server, and arms of different experiments
 * are independent. Used by balance-bundle cohorts (`balanceBundle.ts`).
 */
export function cohortBucket(experiment: string, id: string): number {
  let h = 0x811c9dc5;
  const s = `${experiment}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}
