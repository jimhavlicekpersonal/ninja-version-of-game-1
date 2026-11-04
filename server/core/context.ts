/** What the server core needs from its environment (its other ports). */
import type { GameData } from '../../src/gameplay/sim/types';
import type { Repo } from '../repo';

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
