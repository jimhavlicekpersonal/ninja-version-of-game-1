/** What the server core needs from its environment (its other ports). */
import type { GameData } from '../../src/gameplay/sim/types';
import type { Repo } from '../repo';
import type { IdentityVerifier } from '../identity/verify';
import type { Metrics } from '../observability';
import type { Leaderboard, MatchLocks } from '../shared';
import type { AppleVerifier } from '../payments/apple';
import type { GoogleVerifier } from '../payments/google';
import type { Pusher } from '../push/push';
import type { RulesRegistry } from '../rules/registry';

/**
 * Server policy knobs (backend batch 2026-11-13). Each has a conservative default (`DEFAULT_POLICY`); the
 * environment can change it (main.ts). Owner decisions sit here rather than in code.
 */
export interface ServerPolicy {
  /** SIGNIN_NONCE_REQUIRED=1: refuse Apple/Google sign-ins without a server nonce (A15). Off: older games still sign in. */
  signInNonceRequired: boolean;
  /** SESSION_IDLE_DAYS: another device's token unused this long is signed out (A16; sliding: every use renews it). */
  sessionIdleDays: number;
  /**
   * DORMANT_ACCOUNT_DAYS: anonymous accounts not seen this long (no purchase, no linked sign-in, not staff,
   * no server-held village above Keep `dormantMaxKeep`) are deleted (A23). 0 turns it off.
   */
  dormantAccountDays: number;
  /** DORMANT_MAX_KEEP: a server-held village above this Keep keeps its account (progress the device may not have). */
  dormantMaxKeep: number;
  /** SANDBOX_CREDIT_DAILY_CAP_USD: Sandbox/test purchases credited per UTC day on the whole server, on production (A24). */
  sandboxDailyCapUsd: number | null;
  /**
   * USD_RATES: US dollars per unit of a currency ({"EUR":1.08,…}), for counting a store-reported local price
   * against the under-18 cap and in revenue reports (GLOBAL-007). A currency without a rate counts at the
   * catalog USD price, as before.
   */
  usdRates: Record<string, number>;
}

export const DEFAULT_POLICY: ServerPolicy = {
  signInNonceRequired: false,
  sessionIdleDays: 400,
  dormantAccountDays: 730,
  dormantMaxKeep: 3,
  sandboxDailyCapUsd: null,
  usdRates: { USD: 1 },
};

export interface ServerContext {
  repo: Repo;
  /** Policy knobs (`DEFAULT_POLICY` unless the environment says otherwise). */
  policy: ServerPolicy;
  /** Today's balance data (the live rules engine's). Battles use the engine of their ticket (`rules`). */
  data: GameData;
  /** Battle-rule versions this server can check (roadmap step 73). */
  rules: RulesRegistry;
  /** Where battles are re-simulated: worker threads in production (step 57), in place otherwise. */
  resim: import('../resim/resim').Resimulator;
  /** The signed balance bundle in force (step 76; `data` already has its numbers), or null. */
  balance: import('../../src/backend/net/balanceBundle').BalanceBundle | null;
  /** Experiment arms (report section 5 step 5): offer-timing variants of `balance`, picked by each game itself. */
  /** Chat and chosen names need the current community rules accepted (report section 5 step 7); false only in tools. */
  requireRules?: boolean;
  balanceCohorts?: import('../../src/backend/net/balanceBundle').BalanceBundle[];
  now(): number;
  /** Unique ids. */
  uuid(): string;
  /** Unguessable secret for new players. */
  newToken(): string;
  /** One-way hash for stored tokens. */
  hash(token: string): Promise<string>;
  /** 0..1, for picking among equally good opponents. */
  random(): number;
  /** A fresh 32-bit battle seed for a ticket (the client never picks it). */
  newSeed(): number;
  /** The honor leaderboard index (the database, or a Redis sorted set). */
  board: Leaderboard;
  /** Who is attacking whom right now (open tickets, or Redis locks). */
  locks: MatchLocks;
  /** Counters and timings (re-simulation, battles, desyncs); a no-op unless the server exposes /metrics. */
  metrics: Metrics;
  /** Checks sign-ins from Apple, Google, Game Center and Play Games (account linking). */
  identity: IdentityVerifier;
  /** Support contact for appeals and Sign in with Apple token revocation (re-audit); absent: none configured. */
  account?: import('../identity/appleTokens').AccountSettings;
  /** Store receipt checkers (roadmap Phase 4); null for a store this server is not set up for. */
  /**
   * `testCreditCapUsd`: on production, the most Sandbox/test purchases (which cost nothing)
   * a player is credited in all (re-audit); absent = no cap (staging, tests).
   */
  payments: { apple: AppleVerifier | null; google: GoogleVerifier | null; testCreditCapUsd?: number };
  /** Server-sent push (roadmap step 40); a no-op without APNs/FCM keys. */
  push: Pusher;
  /** A structured log line (the request's logger in the HTTP adapter). */
  log(level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>): void;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: import('../../src/backend/net/protocol').ErrorCode,
    message: string,
    /** Free names close to a refused one (`name_taken`). */
    readonly suggestions?: string[],
    /** The message as codes (`core/errors.ts` `fail`); absent only on staff-facing errors. */
    readonly parts?: import('../../src/backend/net/protocol').MessageRef[],
  ) {
    super(message);
  }
}

export const HOUR = 3_600_000;
export const MIN = 60_000;
