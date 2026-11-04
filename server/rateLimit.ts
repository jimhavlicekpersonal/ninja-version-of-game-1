/**
 * Rate limits (roadmap step 13). Fixed one-window counters per rule and key
 * (a player's token, or the caller's IP address). This memory limiter counts
 * per server instance; with several instances behind a load balancer each
 * enforces its own share, which still caps abuse. Step 16 moves the counters
 * to Redis behind the same RateLimiter port.
 */

export interface RateRule {
  /** At most `limit` requests per `windowMs`. */
  limit: number;
  windowMs: number;
}

/** Every limit the HTTP adapter applies. Tests and hosts can override any of them. */
export interface RateLimits {
  /** Every request from one IP address. Generous: phone carriers put many players behind one address. */
  ip: RateRule;
  /** Every request with one player token. */
  player: RateRule;
  /** New players from one IP address. */
  register: RateRule;
  /** Opponent searches (each makes a ticket). */
  match: RateRule;
  /** Battle reports (each is re-simulated: the expensive call). */
  battle: RateRule;
  /** Reports and blocks by one player. */
  moderation: RateRule;
  /** Web account-deletion requests from one IP address. */
  deletionRequest: RateRule;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const DEFAULT_RATE_LIMITS: RateLimits = {
  ip: { limit: 600, windowMs: MIN },
  player: { limit: 240, windowMs: MIN },
  register: { limit: 30, windowMs: HOUR },
  match: { limit: 30, windowMs: MIN },
  battle: { limit: 20, windowMs: MIN },
  moderation: { limit: 30, windowMs: HOUR },
  deletionRequest: { limit: 5, windowMs: HOUR },
};

export interface RateDecision {
  ok: boolean;
  /** When the caller may try again (0 when ok). */
  retryAfterMs: number;
}

/** The port: a Redis adapter can replace the memory one without touching the routes. */
export interface RateLimiter {
  hit(rule: keyof RateLimits, key: string, now: number): Promise<RateDecision>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { end: number; count: number }>();
  private lastSweep = 0;

  constructor(private readonly limits: RateLimits = DEFAULT_RATE_LIMITS) {}

  async hit(rule: keyof RateLimits, key: string, now: number): Promise<RateDecision> {
    const r = this.limits[rule];
    this.sweep(now);
    const id = `${rule}:${key}`;
    let w = this.windows.get(id);
    if (!w || now >= w.end) {
      w = { end: now + r.windowMs, count: 0 };
      this.windows.set(id, w);
    }
    if (w.count >= r.limit) return { ok: false, retryAfterMs: w.end - now };
    w.count++;
    return { ok: true, retryAfterMs: 0 };
  }

  /** Forget finished windows now and then, so memory follows active callers only. */
  private sweep(now: number): void {
    if (now - this.lastSweep < MIN) return;
    this.lastSweep = now;
    for (const [id, w] of this.windows) if (now >= w.end) this.windows.delete(id);
  }

  /** Counters held (for tests). */
  get size(): number {
    return this.windows.size;
  }
}

/** Largest request bodies, in bytes. Everything else gets `default`. */
export const BODY_LIMITS = {
  default: 16 * 1024,
  /** A Keep 15 base with walls (up to 400 buildings). The largest generated base is ~14 KB. */
  base: 128 * 1024,
  /** A battle report with the maximum 2,000 deployments is ~105 KB. */
  battle: 256 * 1024,
} as const;
