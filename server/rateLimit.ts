/**
 * Rate limits (roadmap step 13). Fixed one-window counters per rule and key
 * (a player's token, or the caller's IP address). This memory limiter counts
 * per server instance; with several instances behind a load balancer each
 * enforces its own share, which still caps abuse. Step 16 moves the counters
 * to Redis behind the same RateLimiter port (REDIS_URL); without Redis every
 * limit below is per instance, so N instances allow up to N times as much.
 *
 * Per-IP limits are deliberately loose (re-audit): carrier-grade NAT puts
 * thousands of phones behind one IPv4 address in much of South and Southeast
 * Asia, Africa and Latin America, so the per-token limits do the real work and
 * the IP limits only stop floods. IPv6 callers are counted per /64 (`ipKey`),
 * the block one subscriber gets.
 */
import { BlockList, isIP, isIPv6 } from 'node:net';

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
  /** Village command batches (server-owned economy), per player. */
  commands: RateRule;
  /** Name and friend-code lookups and friend requests per player (step 59: no scraping the player list). */
  lookup: RateRule;
  /** The same, per day. */
  lookupDay: RateRule;
  /** Battle commands (trialEnd, abandonBattle) in village batches, per player: each runs a battle on the request thread. */
  battleCommands: RateRule;
  /** Purchase intents, releases, receipts and history, per player (its own budget: never blocked by reports or Gang invites). */
  purchase: RateRule;
  /** Village imports per IP address (ledger audit A2: throwaway accounts each bringing a forged village). */
  villageImport: RateRule;
  /** Shared play-statistics batches per IP address (no token: report section 5 step 5). */
  stats: RateRule;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Battle commands one player may send per minute (`battleCommands`; server/core/village.ts). */
export const BATTLE_COMMANDS_PER_MINUTE = 6;

export const DEFAULT_RATE_LIMITS: RateLimits = {
  // One IPv4 address can be a whole mobile carrier's NAT pool: ~50 req/s only stops floods.
  ip: { limit: 3000, windowMs: MIN },
  player: { limit: 240, windowMs: MIN },
  // New players (and sign-ins) per IPv4 address or IPv6 /64: a busy CGNAT address registers many real players an hour.
  register: { limit: 300, windowMs: HOUR },
  match: { limit: 30, windowMs: MIN },
  battle: { limit: 20, windowMs: MIN },
  moderation: { limit: 30, windowMs: HOUR },
  deletionRequest: { limit: 5, windowMs: HOUR },
  commands: { limit: 30, windowMs: MIN },
  lookup: { limit: 30, windowMs: MIN },
  lookupDay: { limit: 300, windowMs: 24 * HOUR },
  battleCommands: { limit: BATTLE_COMMANDS_PER_MINUTE, windowMs: MIN },
  // A shop session with retries, restores and a few Ask to Buy releases stays far below this.
  purchase: { limit: 120, windowMs: HOUR },
  // A player moves a village once in its life; a whole carrier NAT pool still fits.
  villageImport: { limit: 60, windowMs: HOUR },
  // A sharing game sends a batch every few minutes while played; a carrier NAT pool holds thousands of them.
  stats: { limit: 3000, windowMs: HOUR },
};

/**
 * The key per-IP rules count under: an IPv4 address as it is (also when it
 * arrives IPv4-mapped, ::ffff:a.b.c.d), an IPv6 address by its /64, so one
 * subscriber cannot rotate through its 2^64 addresses to dodge a limit.
 */
export function ipKey(ip: string): string {
  if (unmapped(ip) !== ip) return unmapped(ip);
  if (!isIPv6(ip)) return ip;
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`;
}

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

/** An IPv4-mapped IPv6 address (::ffff:a.b.c.d) as plain IPv4; anything else as it is. */
const unmapped = (ip: string) => /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? ip;

/**
 * Parse addresses and CIDR ranges ("203.0.113.7, 10.0.0.0/8, 2001:db8::/32").
 * Throws on anything else, so a typo stops the server instead of opening it.
 */
export function parseCidrs(list: string[]): { address: string; prefix: number; family: 'ipv4' | 'ipv6' }[] {
  return list.map((item) => {
    const [addr, bits, extra] = item.trim().split('/');
    const v = isIP(unmapped(addr ?? ''));
    const max = v === 4 ? 32 : 128;
    const prefix = bits === undefined ? max : Number(bits);
    if (!v || extra !== undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > max || (bits !== undefined && !/^\d+$/.test(bits))) throw new Error(`"${item}" is not an IP address or CIDR range.`);
    return { address: unmapped(addr), prefix, family: v === 4 ? 'ipv4' : 'ipv6' };
  });
}

/** A matcher for addresses and CIDR ranges (ADMIN_ALLOW_IPS). */
export function ipAllowList(list: string[]): (ip: string) => boolean {
  const blocks = new BlockList();
  for (const c of parseCidrs(list)) blocks.addSubnet(c.address, c.prefix, c.family);
  return (ip) => {
    const a = unmapped(ip);
    const v = isIP(a);
    return v !== 0 && blocks.check(a, v === 4 ? 'ipv4' : 'ipv6');
  };
}

/** Largest request bodies, in bytes. Everything else gets `default`. */
export const BODY_LIMITS = {
  default: 16 * 1024,
  /** A Keep 15 base with walls (up to 400 buildings). The largest generated base is ~14 KB. */
  base: 128 * 1024,
  /** A battle report with the maximum 2,000 deployments is ~105 KB. */
  battle: 256 * 1024,
} as const;
