/**
 * State the API instances share beyond Postgres (roadmap step 16): the honor
 * leaderboard and match locks, plus rate-limit counters. Each is a port with
 * a default that needs nothing else (the database, or this process's memory)
 * and a Redis adapter for several instances:
 *
 * - Leaderboard: a Redis sorted set instead of counting rows on every call.
 *   Postgres stays the truth; the set is rebuilt from it when missing.
 * - Match locks: SET NX with an expiry, so two attackers can never be handed
 *   the same defender at once, and matchmaking no longer scans tickets.
 * - Rate limits: one counter per window shared by every instance.
 *
 * A Redis outage degrades instead of failing requests (re-audit): rate limits
 * fail open, the leaderboard answers from the database (and rebuilds its set
 * once Redis is back), and match locks fall back to open tickets. Each of
 * them reports the failure through `onError` (a metric and a throttled log
 * line: `redisErrorReporter`).
 */
import type { Repo } from './repo';
import type { RateDecision, RateLimiter, RateLimits } from './rateLimit';
import { DEFAULT_RATE_LIMITS, MemoryRateLimiter } from './rateLimit';
import type { RedisCommander, RespValue } from './redis';
import type { Metrics } from './observability';

/** Called when a Redis-backed store could not reach Redis and degraded. */
export type RedisErrorHandler = (use: 'rateLimit' | 'leaderboard' | 'locks', e: Error) => void;

/** Players per ZADD when the Redis leaderboard is rebuilt from the database (quality Q20). */
const BOARD_REBUILD_CHUNK = 500;

/** Counts every Redis failure (`tk_redis_errors_total`) and logs at most one line per `everyMs`. */
export function redisErrorReporter(metrics: Metrics, log: (msg: string, fields: Record<string, unknown>) => void, everyMs = 10_000): RedisErrorHandler {
  let last = 0;
  let missed = 0;
  return (use, e) => {
    metrics.count('tk_redis_errors_total', { use });
    const t = Date.now();
    if (t - last < everyMs) {
      missed++;
      return;
    }
    log('Redis unavailable: degraded to the database / no shared limits', { use, error: e.message, since: missed });
    last = t;
    missed = 0;
  };
}

// ------------------------------------------------------------------ leaderboard

export interface Leaderboard {
  /** Note a ranked player's honor (players with a base). */
  set(playerId: string, trophies: number, createdAt: number): Promise<void>;
  remove(playerId: string): Promise<void>;
  /** Best first; equal honor: the older account first. */
  top(limit: number): Promise<{ id: string; trophies: number }[]>;
  /** 1 + the number of ranked players with more honor. */
  rankOf(trophies: number): Promise<number>;
}

/** The default: read straight from the database (fine for one instance and modest numbers of players). */
export class RepoLeaderboard implements Leaderboard {
  constructor(private readonly repo: Repo) {}
  async set(): Promise<void> {}
  async remove(): Promise<void> {}
  async top(limit: number): Promise<{ id: string; trophies: number }[]> {
    return (await this.repo.topPlayers(limit)).map((p) => ({ id: p.id, trophies: p.trophies }));
  }
  rankOf(trophies: number): Promise<number> {
    return this.repo.rankOf(trophies);
  }
}

/**
 * Score = honor + a fraction that is larger for older accounts, so equal
 * honor ranks the older account first, exactly as the database orders it. The
 * fraction stays below 1, so honor always decides first.
 */
export function boardScore(trophies: number, createdAt: number): number {
  return trophies + (1 - Math.min(Math.max(createdAt, 0), 3.99e12) / 4e12);
}

export class RedisLeaderboard implements Leaderboard {
  /** A write was lost while Redis was down: rebuild the set from the database once it answers again. */
  private stale = false;
  private rebuilding: Promise<unknown> | null = null;

  /**
   * `fallback`: the database to answer from while Redis is down (and to
   * rebuild from afterwards). Without it, Redis errors reach the caller.
   */
  constructor(
    private readonly redis: RedisCommander,
    readonly key = 'tk:leaderboard',
    private readonly fallback?: { repo: Repo; onError?: RedisErrorHandler },
  ) {}

  private failed(e: unknown): void {
    if (!this.fallback) throw e;
    this.fallback.onError?.('leaderboard', e as Error);
  }

  /** The set may have missed changes (Redis was down at start): rebuild it from the database once Redis answers. */
  markStale(): void {
    this.stale = true;
  }

  /** After an outage: replace the set with the database's ranking (built aside, then renamed: atomic). */
  private heal(): void {
    if (!this.stale || this.rebuilding || !this.fallback || this.redis.available === false) return;
    const repo = this.fallback.repo;
    this.rebuilding = (async () => {
      const tmp = `${this.key}:rebuild`;
      await this.redis.command('DEL', tmp);
      const all = await repo.rankedPlayers();
      for (let i = 0; i < all.length; i += BOARD_REBUILD_CHUNK) {
        const args: (string | number)[] = [];
        for (const p of all.slice(i, i + BOARD_REBUILD_CHUNK)) args.push(boardScore(p.trophies, p.createdAt), p.id);
        await this.redis.command('ZADD', tmp, ...args);
      }
      if (all.length) await this.redis.command('RENAME', tmp, this.key);
      else await this.redis.command('DEL', this.key);
      this.stale = false;
    })()
      .catch((e) => this.fallback?.onError?.('leaderboard', e as Error))
      .finally(() => (this.rebuilding = null));
  }

  async set(playerId: string, trophies: number, createdAt: number): Promise<void> {
    try {
      await this.redis.command('ZADD', this.key, boardScore(trophies, createdAt), playerId);
      this.heal();
    } catch (e) {
      this.failed(e);
      this.stale = true;
    }
  }

  async remove(playerId: string): Promise<void> {
    try {
      await this.redis.command('ZREM', this.key, playerId);
      this.heal();
    } catch (e) {
      this.failed(e);
      this.stale = true;
    }
  }

  async top(limit: number): Promise<{ id: string; trophies: number }[]> {
    try {
      const r = (await this.redis.command('ZREVRANGE', this.key, 0, Math.max(0, limit - 1), 'WITHSCORES')) as string[];
      const out: { id: string; trophies: number }[] = [];
      for (let i = 0; i + 1 < r.length; i += 2) out.push({ id: r[i], trophies: Math.floor(Number(r[i + 1])) });
      this.heal();
      return out;
    } catch (e) {
      this.failed(e);
      return new RepoLeaderboard(this.fallback!.repo).top(limit);
    }
  }

  async rankOf(trophies: number): Promise<number> {
    try {
      // Everyone with more honor scores at least trophies + 1.
      return 1 + Number(await this.redis.command('ZCOUNT', this.key, Math.floor(trophies) + 1, '+inf'));
    } catch (e) {
      this.failed(e);
      return new RepoLeaderboard(this.fallback!.repo).rankOf(trophies);
    }
  }

  /** Fill the set from the database when it is missing (a new or flushed Redis). Returns how many players were added. */
  async rebuildIfMissing(repo: Repo): Promise<number> {
    if (Number(await this.redis.command('EXISTS', this.key)) > 0) return 0;
    const all = await repo.rankedPlayers();
    for (let i = 0; i < all.length; i += BOARD_REBUILD_CHUNK) {
      const args: (string | number)[] = [];
      for (const p of all.slice(i, i + BOARD_REBUILD_CHUNK)) args.push(boardScore(p.trophies, p.createdAt), p.id);
      await this.redis.command('ZADD', this.key, ...args);
    }
    return all.length;
  }
}

// ------------------------------------------------------------------ match locks

export interface MatchLocks {
  /**
   * True when this store holds the locks. False: the database's open tickets
   * are the locks, and matchmaking's query skips defenders with one.
   */
  readonly external: boolean;
  /** Which of these defenders someone is attacking right now. */
  lockedAmong(defenderIds: string[]): Promise<Set<string>>;
  /** Reserve a defender for an attacker; false if someone else holds it. */
  acquire(defenderId: string, attackerId: string, ttlMs: number): Promise<boolean>;
  /** Free it once the attack is reported (only the holder's lock). */
  release(defenderId: string, attackerId: string): Promise<void>;
}

/** The default: open tickets in the database are the locks (see Repo.findOpponents). */
export class TicketLocks implements MatchLocks {
  readonly external = false;
  async lockedAmong(): Promise<Set<string>> {
    return new Set();
  }
  async acquire(): Promise<boolean> {
    return true;
  }
  async release(): Promise<void> {}
}

/** Delete a key only if it still holds our value (a lock that expired and was taken by someone else stays theirs). */
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

export class RedisLocks implements MatchLocks {
  /**
   * `onError`: degrade while Redis is down instead of failing the match: the
   * database's open tickets are the locks again (`external` reads false while
   * the client fails fast), and a lock that cannot be taken is granted (a rare
   * double match during an outage, never a failed request).
   */
  constructor(
    private readonly redis: RedisCommander,
    private readonly prefix = 'tk:lock:',
    private readonly onError?: RedisErrorHandler,
  ) {}

  get external(): boolean {
    return !this.onError || this.redis.available !== false;
  }

  private failed(e: unknown): void {
    if (!this.onError) throw e;
    this.onError('locks', e as Error);
  }

  async lockedAmong(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    try {
      const r = (await this.redis.command('MGET', ...ids.map((id) => this.prefix + id))) as (string | null)[];
      return new Set(ids.filter((_, i) => r[i] !== null));
    } catch (e) {
      this.failed(e);
      return new Set();
    }
  }

  async acquire(defenderId: string, attackerId: string, ttlMs: number): Promise<boolean> {
    try {
      return (await this.redis.command('SET', this.prefix + defenderId, attackerId, 'NX', 'PX', Math.max(1, Math.floor(ttlMs)))) === 'OK';
    } catch (e) {
      this.failed(e);
      return true;
    }
  }

  async release(defenderId: string, attackerId: string): Promise<void> {
    try {
      await this.redis.command('EVAL', RELEASE, 1, this.prefix + defenderId, attackerId);
    } catch (e) {
      this.failed(e); // the lock runs out by itself
    }
  }
}

// ------------------------------------------------------------------ rate limits

/** INCR the window's counter; the first hit sets its expiry. Returns [count, ms left]. */
const HIT = `local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return {n, redis.call('PTTL', KEYS[1])}`;
/** Give back one hit while the window lasts (never below zero, never creating a key). */
const REFUND = `local n = tonumber(redis.call('GET', KEYS[1]) or '0') if n > 0 then redis.call('DECR', KEYS[1]) end return 0`;

/**
 * Rate limits counted in Redis, so every instance shares one budget per
 * caller. While Redis is down it fails open (the request goes through,
 * `onError` counts it): a limiter outage must not take the game offline, and
 * the database, body limits and per-route caps in the core still hold.
 */
export class RedisRateLimiter implements RateLimiter {
  /**
   * While Redis does not answer, limits are counted here, per instance (report section 5 step 2,
   * backend A8: they used to fail fully open, so a Redis outage switched off every limit on every
   * instance, registration and battle reports included). Per instance is looser than shared, but
   * nothing goes unlimited.
   */
  private readonly fallback: RateLimiter;

  constructor(
    private readonly redis: RedisCommander,
    private readonly limits: RateLimits = DEFAULT_RATE_LIMITS,
    private readonly prefix = 'tk:rate:',
    private readonly onError?: RedisErrorHandler,
    fallback?: RateLimiter,
  ) {
    this.fallback = fallback ?? new MemoryRateLimiter(limits);
  }

  async hit(rule: keyof RateLimits, key: string, now: number = Date.now()): Promise<RateDecision> {
    const r = this.limits[rule];
    try {
      const [count, ttl] = (await this.redis.command('EVAL', HIT, 1, `${this.prefix}${rule}:${key}`, r.windowMs)) as RespValue[] as number[];
      if (count > r.limit) return { ok: false, retryAfterMs: ttl > 0 ? ttl : r.windowMs };
      return { ok: true, retryAfterMs: 0 };
    } catch (e) {
      this.onError?.('rateLimit', e as Error);
      return this.fallback.hit(rule, key, now);
    }
  }

  async refund(rule: keyof RateLimits, key: string, now: number = Date.now()): Promise<void> {
    try {
      await this.redis.command('EVAL', REFUND, 1, `${this.prefix}${rule}:${key}`);
    } catch (e) {
      this.onError?.('rateLimit', e as Error);
      await this.fallback.refund?.(rule, key, now);
    }
  }
}
