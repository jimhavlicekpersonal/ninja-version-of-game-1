/**
 * Replaying a command batch on a server-held village, as a pure function of the stored file, the
 * commands and the clock (backend batch 2026-11-13, audit A3). `applyCommands` (village.ts) runs it in
 * place for ordinary batches, and in a re-simulation worker thread (server/resim/worker.ts) when the batch
 * carries battle commands (`trialEnd`, `bountyEnd`, `rematchEnd`, …): each of those runs a whole battle
 * inside `applyCommand`, up to ~0.45 s of CPU at late Keeps, which used to block the API's event loop
 * while the village row was locked. The result is then written under the row lock only if the village
 * did not change meanwhile.
 *
 * No I/O, no clock, no randomness: the same input gives the same output on any thread.
 */
import { deserialize, serialize, type SaveFile } from '../../src/gameplay/sim/save';
import { economyHash, economyOf, type Economy } from '../../src/gameplay/sim/serverEconomy';
import type { GameData, Resources } from '../../src/gameplay/sim/types';
import { applyCommand, type Command } from '../../src/gameplay/sim/village';

export interface ReplayStep {
  /** The device's (or village's) number for the command. */
  seq: number;
  /** The time the game said it happened. */
  clientAt: number;
  command: Command;
  /** A refusal decided before the replay (not allowed, too large, locked, too many battles); null: replay it. */
  error: string | null;
}

export interface VillageReplayJob {
  /** The stored village file (a save). */
  file: unknown;
  /** The village's `at` (its last change). */
  at: number;
  now: number;
  /** Commands are dated no earlier than this (MAX_BACKDATE_MS before now). */
  earliest: number;
  /** Times later than now + this count as now. */
  skewMs: number;
  steps: ReplayStep[];
}

export interface ReplayLedgerLine {
  at: number;
  resource: string;
  delta: number;
  balance: number;
  reason: string;
  ref: string;
}

export interface VillageReplayOutcome {
  /** Per step: the time it counted at and its result. */
  outcomes: { seq: number; when: number; ok: boolean; error: string | null }[];
  /** How many steps applied. */
  applied: number;
  /** The village after the batch (only when something applied). */
  file: SaveFile | null;
  /** The village's time after the batch. */
  at: number;
  stateHash: string;
  economy: Economy;
  ledger: ReplayLedgerLine[];
  /** CPU time of the replay. */
  ms: number;
}

/** Ledger lines for every resource that changed (without the player id: the caller adds it). */
export function resourceDiff(before: Resources, after: Resources, at: number, reason: string, ref: string): ReplayLedgerLine[] {
  const out: ReplayLedgerLine[] = [];
  for (const k of Object.keys({ ...before, ...after }) as (keyof Resources)[]) {
    const delta = Math.round((after[k] ?? 0) - (before[k] ?? 0));
    if (delta) out.push({ at, resource: k, delta, balance: Math.round(after[k] ?? 0), reason, ref });
  }
  return out;
}

export function replayVillage(job: VillageReplayJob, data: GameData): VillageReplayOutcome {
  const t0 = performance.now();
  let state = deserialize(job.file, data);
  let at = job.at;
  let applied = 0;
  const ledger: ReplayLedgerLine[] = [];
  const outcomes: VillageReplayOutcome['outcomes'] = [];
  for (const s of job.steps) {
    const when = Math.max(at, job.earliest, s.clientAt > job.now + job.skewMs ? job.now : s.clientAt);
    let error = s.error;
    if (!error) {
      let r: ReturnType<typeof applyCommand>;
      try {
        r = applyCommand(state, s.command, when, data);
      } catch {
        r = { ok: false, code: 'INVALID_BATTLE', message: 'That command could not be read.' };
      }
      if (r.ok) {
        ledger.push(...resourceDiff(state.resources, r.state.resources, when, `command:${s.command.type}`, String(s.seq)));
        state = r.state;
        applied++;
        at = when;
      } else error = r.code;
    }
    outcomes.push({ seq: s.seq, when, ok: !error, error });
  }
  return { outcomes, applied, file: applied ? serialize(state, at) : null, at, stateHash: economyHash(state), economy: economyOf(state), ledger, ms: performance.now() - t0 };
}
