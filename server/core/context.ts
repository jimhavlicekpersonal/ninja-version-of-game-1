/** What the server core needs from its environment (its other ports). */
import type { GameData } from '../../src/gameplay/sim/types';
import type { Repo } from '../repo';
import type { IdentityVerifier } from '../identity/verify';
import type { Metrics } from '../observability';
import type { Leaderboard, MatchLocks } from '../shared';
import type { AppleVerifier } from '../payments/apple';
import type { GoogleVerifier } from '../payments/google';
import type { Pusher } from '../push/push';
import type { Resimulator } from '../resim';

export interface ServerContext {
  repo: Repo;
  data: GameData;
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
  /** Store receipt checkers (roadmap Phase 4); null for a store this server is not set up for. */
  payments: { apple: AppleVerifier | null; google: GoogleVerifier | null };
  /** Re-simulates reported battles: a worker-thread pool in production (roadmap step 57), inline otherwise. */
  resim: Resimulator;
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
  ) {
    super(message);
  }
}

export const HOUR = 3_600_000;
export const MIN = 60_000;
