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

export interface ServerContext {
  repo: Repo;
  /** Today's balance data (the live rules engine's). Battles use the engine of their ticket (`rules`). */
  data: GameData;
  /** Battle-rule versions this server can check (roadmap step 73). */
  rules: RulesRegistry;
  /** Where battles are re-simulated: worker threads in production (step 57), in place otherwise. */
  resim: import('../resim/resim').Resimulator;
  /** The signed balance bundle in force (step 76; `data` already has its numbers), or null. */
  balance: import('../../src/backend/net/balanceBundle').BalanceBundle | null;
  /** Experiment arms (report section 5 step 5): offer-timing variants of `balance`, picked by each game itself. */
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
  ) {
    super(message);
  }
}

export const HOUR = 3_600_000;
export const MIN = 60_000;
