/** The in-memory adapter (tests and local dev): its stores composed into one `Repo`. */
import type { Repo } from '../ports';
import { composeStores } from '../compose';
import { MemoryBase, clone } from './base';
import { MemoryPlayers } from './players';
import { MemoryPurchases } from './purchases';
import { MemoryOps } from './ops';
import { MemoryBattles } from './battles';
import { MemoryVillages } from './villages';
import { MemoryAlliances } from './alliances';
import { MemoryFriends } from './friends';
import { MemoryGangs } from './gangs';

// The store classes' methods are copied onto MemoryRepo by composeStores (which refuses a name defined twice);
// these merges give MemoryRepo their types, and `implements Repo` checks the result.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MemoryRepo extends MemoryPlayers, MemoryPurchases, MemoryOps, MemoryBattles, MemoryVillages, MemoryAlliances, MemoryFriends, MemoryGangs {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MemoryRepo extends MemoryBase implements Repo {
  /** Transactions run one at a time (memory has no row locks). */
  private txChain: Promise<unknown> = Promise.resolve();

  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    const run = () => this.withRollback(fn);
    const result = this.txChain.then(run, run);
    this.txChain = result.catch(() => undefined);
    return result;
  }

  /**
   * Run `fn` with a handle on this repo; if it throws, every field goes back to
   * how it was (like a rollback, or a savepoint when nested).
   */
  private async withRollback<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, unknown>();
    for (const [k, v] of Object.entries(this)) if (k !== 'txChain' && typeof v !== 'function') snapshot.set(k, structuredClone(v));
    // Everything goes to this repo; a transaction inside the transaction is nested (no queueing).
    const tx: Repo = new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'transaction') return <U>(f: (r: Repo) => Promise<U>) => target.withRollback(f);
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    try {
      return await fn(tx);
    } catch (e) {
      for (const [k, v] of snapshot) (this as unknown as Record<string, unknown>)[k] = v;
      throw e;
    }
  }

  async getIdempotent(scope: string, key: string): Promise<{ status: number; body: unknown; fingerprint: string | null } | null> {
    const r = this.idempotencyRows.get(`${scope}\u0000${key}`);
    return r ? { status: r.status, body: clone(r.body), fingerprint: r.fingerprint } : null;
  }
  async putIdempotent(scope: string, key: string, status: number, body: unknown, at: number, fingerprint: string | null = null): Promise<void> {
    const k = `${scope}\u0000${key}`;
    if (!this.idempotencyRows.has(k)) this.idempotencyRows.set(k, { status, body: clone(body), createdAt: at, fingerprint });
  }
  async dropIdempotentScopes(scopes: string[]): Promise<number> {
    const set = new Set(scopes);
    let n = 0;
    for (const k of [...this.idempotencyRows.keys()]) if (set.has(k.split('\u0000')[0])) n += Number(this.idempotencyRows.delete(k));
    return n;
  }

  async ping(): Promise<void> {}
  async lockPurchases(): Promise<void> {
    /* memory transactions already run one at a time */
  }
  async lockPlayer(): Promise<void> {
    /* memory transactions already run one at a time */
  }
  async claimJob(name: string, holder: string, now: number, leaseMs: number): Promise<boolean> {
    const l = this.jobLeases.get(name);
    if (l && l.until > now && l.holder !== holder) return false;
    this.jobLeases.set(name, { holder, until: now + leaseMs });
    return true;
  }}

composeStores(MemoryRepo, [MemoryPlayers, MemoryPurchases, MemoryOps, MemoryBattles, MemoryVillages, MemoryAlliances, MemoryFriends, MemoryGangs]);
