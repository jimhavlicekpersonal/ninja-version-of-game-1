/** The server core's environment on Node: real clock, crypto ids and tokens, SHA-256 token hashes. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { GameData } from '../src/gameplay/sim/types';
import type { ServerContext } from './core';
import type { Repo } from './repo';
import { RepoLeaderboard, TicketLocks, type Leaderboard, type MatchLocks } from './shared';

/** Optional shared stores (Redis, roadmap step 16); without them the database does the job. */
export interface SharedStores {
  board?: Leaderboard;
  locks?: MatchLocks;
}

export function nodeContext(repo: Repo, data: GameData, now: () => number = () => Date.now(), random: () => number = Math.random, shared: SharedStores = {}): ServerContext {
  return {
    repo,
    data,
    board: shared.board ?? new RepoLeaderboard(repo),
    locks: shared.locks ?? new TicketLocks(),
    now,
    uuid: () => randomUUID(),
    newToken: () => randomBytes(24).toString('base64url'),
    hash: async (token) => createHash('sha256').update(token).digest('hex'),
    random,
    newSeed: () => randomBytes(4).readUInt32LE(0),
  };
}
