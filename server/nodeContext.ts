/** The server core's environment on Node: real clock, crypto ids and tokens, SHA-256 token hashes. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { GameData } from '../src/gameplay/sim/types';
import type { ServerContext } from './core';
import type { Repo } from './repo';
import { noIdentity, type IdentityVerifier } from './identity/verify';
import { noMetrics, type Metrics } from './observability';
import { RepoLeaderboard, TicketLocks, type Leaderboard, type MatchLocks } from './shared';
import type { AppleVerifier } from './payments/apple';
import type { GoogleVerifier } from './payments/google';
import { noPush, type Pusher } from './push/push';
import { liveEngine, RulesRegistry } from './rules/registry';
import { InlineResimulator, type Resimulator } from './resim/resim';

/**
 * Optional shared stores (Redis, roadmap step 16; without them the database
 * does the job) and observability hooks (step 17; without them, nothing).
 */
export interface SharedStores {
  board?: Leaderboard;
  locks?: MatchLocks;
  metrics?: Metrics;
  identity?: IdentityVerifier;
  payments?: { apple?: AppleVerifier | null; google?: GoogleVerifier | null; testCreditCapUsd?: number };
  push?: Pusher;
  log?: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void;
  /** Battle-rule versions (step 73); defaults to today's rules only. */
  rules?: RulesRegistry;
  /** Re-simulation (step 57): a worker pool in production; in place by default. */
  resim?: Resimulator;
  /**
   * The HTTP adapter's rate limiter (Redis when shared), so limits the core
   * applies itself (battle commands per minute, server/core/village.ts) hold
   * across instances too. Without it the core counts in this process.
   */
  limiter?: import('./rateLimit').RateLimiter;
  /** The signed balance bundle served at /v1/balance (step 76); `data` must already carry its numbers. */
  balance?: import('../src/backend/net/balanceBundle').BalanceBundle | null;
  /** Experiment arms served next to it (report section 5 step 5; `checkCohort`). */
  balanceCohorts?: import('../src/backend/net/balanceBundle').BalanceBundle[];
  /** SUPPORT_CONTACT and the Sign in with Apple key (re-audit: appeals, token revocation). */
  account?: import('./identity/appleTokens').AccountSettings;
}

export function nodeContext(repo: Repo, data: GameData, now: () => number = () => Date.now(), random: () => number = Math.random, shared: SharedStores = {}): ServerContext {
  const ctx: ServerContext = {
    repo,
    data,
    rules: shared.rules ?? new RulesRegistry(liveEngine(data)),
    resim: shared.resim ?? new InlineResimulator(),
    balance: shared.balance ?? null,
    balanceCohorts: shared.balanceCohorts ?? [],
    board: shared.board ?? new RepoLeaderboard(repo),
    locks: shared.locks ?? new TicketLocks(),
    metrics: shared.metrics ?? noMetrics,
    identity: shared.identity ?? noIdentity,
    account: shared.account ?? {},
    payments: { apple: shared.payments?.apple ?? null, google: shared.payments?.google ?? null, ...(shared.payments?.testCreditCapUsd !== undefined ? { testCreditCapUsd: shared.payments.testCreditCapUsd } : {}) },
    push: shared.push ?? noPush,
    log: shared.log ?? (() => undefined),
    now,
    uuid: () => randomUUID(),
    newToken: () => randomBytes(24).toString('base64url'),
    hash: async (token) => createHash('sha256').update(token).digest('hex'),
    random,
    newSeed: () => randomBytes(4).readUInt32LE(0),
  };
  // Not part of ServerContext (core/context.ts): read by server/core/village.ts `limiterOf`.
  return shared.limiter ? Object.assign(ctx, { limiter: shared.limiter }) : ctx;
}
