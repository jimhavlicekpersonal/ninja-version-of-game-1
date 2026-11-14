/**
 * Periodic jobs that must run on one instance at a time (report section 5
 * step 2, backend A21): each run first claims the job's lease in the database
 * (`Repo.claimJob`, migration 0026). Two instances used to run every job
 * twice, so each Gang War reminder was pushed twice and Google's voided
 * purchases were polled once per instance.
 */
import type { Repo } from './repo';

/** The lease for a job that runs every `everyMs`: a little shorter, so the same holder renews it every run. */
export function leaseFor(everyMs: number): number {
  return Math.max(Math.floor(everyMs * 0.8), everyMs - 60_000);
}

/**
 * Backend A21: a job checks its lease before each unit of work it commits (a war's reminder, a batch of
 * deletions). `stillHeld` renews the lease for this holder, and answers false once another instance has
 * taken it (this run outlived its lease: a long pause, a slow database), so the run stops instead of
 * overlapping the new holder's.
 */
export type StillHeld = () => Promise<boolean>;

/** Thrown inside a job when its lease was lost; `runLeased` stops the run quietly. */
export class LeaseLost extends Error {}

/** Run `run` if this instance holds (or can take) the job's lease. Resolves whether it ran (to the end). */
export async function runLeased(repo: Repo, holder: string, now: number, name: string, everyMs: number, run: (stillHeld: StillHeld) => Promise<unknown>, clock: () => number = Date.now): Promise<boolean> {
  if (!(await repo.claimJob(name, holder, now, leaseFor(everyMs)))) return false;
  const stillHeld: StillHeld = () => repo.claimJob(name, holder, clock(), leaseFor(everyMs));
  try {
    await run(stillHeld);
  } catch (e) {
    if (e instanceof LeaseLost) return false;
    throw e;
  }
  return true;
}

/** For jobs: throw LeaseLost unless the lease is still this instance's. */
export async function requireLease(stillHeld: StillHeld | undefined): Promise<void> {
  if (stillHeld && !(await stillHeld())) throw new LeaseLost('job lease taken by another instance');
}
