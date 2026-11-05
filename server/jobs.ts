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

/** Run `run` if this instance holds (or can take) the job's lease. Resolves whether it ran. */
export async function runLeased(repo: Repo, holder: string, now: number, name: string, everyMs: number, run: () => Promise<unknown>): Promise<boolean> {
  if (!(await repo.claimJob(name, holder, now, leaseFor(everyMs)))) return false;
  await run();
  return true;
}
