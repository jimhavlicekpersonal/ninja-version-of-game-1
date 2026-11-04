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
 */
import type { Repo } from './repo';
import type { RateDecision, RateLimiter, RateLimits } from './rateLimit';
import { DEFAULT_RATE_LIMITS } from './rateLimit';
import type { RedisCommander, RespValue } from './redis';

// ------------------------------------------------------------------ leaderboard

export interface Leaderboard {
  /** Note a ranked player's honor (players with a base). */
  set(playerId: string, trophies: number, createdAt: number): Promise<void>;
  remove(playerId: string): Promise<void>;
  /** Best first; equal honor: the older account first. */
  top(limit: number): Promise<{ id: string; trophies: number }[]>;
  /** 1 + the number of ranked players with more honor. */
  rankOf(trophies: number): Promise<number>;
  /** Load every ranked player again from the database (after a season reset). */
  rebuild(repo: Repo): Promise<void>;
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
  async rebuild(): Promise<void> {}
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
  constructor(
    private readonly redis: RedisCommander,
    readonly key = 'tk:leaderboard',
  ) {}

  async set(playerId: string, trophies: number, createdAt: number): Promise<void> {
    await this.redis.command('ZADD', this.key, boardScore(trophies, createdAt), playerId);
  }

  async remove(playerId: string): Promise<void> {
    await this.redis.command('ZREM', this.key, playerId);
  }

  async top(limit: number): Promise<{ id: string; trophies: number }[]> {
    const r = (await this.redis.command('ZREVRANGE', this.key, 0, Math.max(0, limit - 1), 'WITHSCORES')) as string[];
    const out: { id: string; trophies: number }[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) out.push({ id: r[i], trophies: Math.floor(Number(r[i + 1])) });
    return out;
  }

  async rankOf(trophies: number): Promise<number> {
    // Everyone with more honor scores at least trophies + 1.
    return 1 + Number(await this.redis.command('ZCOUNT', this.key, Math.floor(trophies) + 1, '+inf'));
  }

  /** Fill the set from the database when it is missing (a new or flushed Redis). Returns how many players were added. */
  async rebuild(repo: Repo): Promise<void> {
    await this.redis.command('DEL', this.key);
    await this.rebuildIfMissing(repo);
  }

  async rebuildIfMissing(repo: Repo): Promise<number> {
    if (Number(await this.redis.command('EXISTS', this.key)) > 0) return 0;
    const all = await repo.rankedPlayers();
    for (let i = 0; i < all.length; i += 500) {
      const args: (string | number)[] = [];
      for (const p of all.slice(i, i + 500)) args.push(boardScore(p.trophies, p.createdAt), p.id);
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
  readonly external = true;
  constructor(
    private readonly redis: RedisCommander,
    private readonly prefix = 'tk:lock:',
  ) {}

  async lockedAmong(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const r = (await this.redis.command('MGET', ...ids.map((id) => this.prefix + id))) as (string | null)[];
    return new Set(ids.filter((_, i) => r[i] !== null));
  }

  async acquire(defenderId: string, attackerId: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.command('SET', this.prefix + defenderId, attackerId, 'NX', 'PX', Math.max(1, Math.floor(ttlMs)))) === 'OK';
  }

  async release(defenderId: string, attackerId: string): Promise<void> {
    await this.redis.command('EVAL', RELEASE, 1, this.prefix + defenderId, attackerId);
  }
}

// ------------------------------------------------------------------ rate limits

/** INCR the window's counter; the first hit sets its expiry. Returns [count, ms left]. */
const HIT = `local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return {n, redis.call('PTTL', KEYS[1])}`;

/** Rate limits counted in Redis, so every instance shares one budget per caller. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: RedisCommander,
    private readonly limits: RateLimits = DEFAULT_RATE_LIMITS,
    private readonly prefix = 'tk:rate:',
  ) {}

  async hit(rule: keyof RateLimits, key: string): Promise<RateDecision> {
    const r = this.limits[rule];
    const [count, ttl] = (await this.redis.command('EVAL', HIT, 1, `${this.prefix}${rule}:${key}`, r.windowMs)) as RespValue[] as number[];
    if (count > r.limit) return { ok: false, retryAfterMs: ttl > 0 ? ttl : r.windowMs };
    return { ok: true, retryAfterMs: 0 };
  }
}
