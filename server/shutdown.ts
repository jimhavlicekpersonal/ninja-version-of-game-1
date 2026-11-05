/**
 * Graceful shutdown (state-of-the-game report, section 5 step 2, backend A9).
 * A host stops an instance with SIGTERM on every deploy and scale-down; the
 * server used to die mid-request, so every release reset connections, lost
 * re-simulations in flight and set off a retry storm from the games' outboxes.
 *
 * On the first signal: /readyz answers 503 (the load balancer stops sending
 * new requests), after `drainMs` the HTTP server stops accepting and waits for
 * the requests in flight, then the workers, Redis and the database pool close.
 * If that takes longer than `deadlineMs` the process exits anyway (exit 1).
 */

export interface ShutdownStep {
  name: string;
  run: () => Promise<unknown>;
}

export interface ShutdownOptions {
  /** How long /readyz says "draining" before the server stops accepting (the balancer's check interval). */
  drainMs: number;
  /** The whole shutdown must end within this (below the host's kill timeout, often 30 s). */
  deadlineMs: number;
  /** Marks the instance not ready. */
  setDraining: () => void;
  /** In order: stop the HTTP server first, the stores it uses after. */
  steps: ShutdownStep[];
  log: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void;
  exit: (code: number) => void;
  wait?: (ms: number) => Promise<void>;
}

export const SHUTDOWN_DRAIN_MS = 5_000;
export const SHUTDOWN_DEADLINE_MS = 25_000;

/** Returns the signal handler (safe to call more than once: later signals are ignored). */
export function gracefulShutdown(o: ShutdownOptions): (signal: string) => Promise<void> {
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let started = false;
  return async (signal: string) => {
    if (started) return;
    started = true;
    o.log('info', 'shutting down', { signal, drainMs: o.drainMs });
    const deadline = setTimeout(() => {
      o.log('error', 'shutdown took too long: exiting', { deadlineMs: o.deadlineMs });
      o.exit(1);
    }, o.deadlineMs);
    deadline.unref?.();
    o.setDraining();
    await wait(o.drainMs);
    let failed = false;
    for (const step of o.steps) {
      try {
        await step.run();
      } catch (e) {
        failed = true;
        o.log('warn', `shutdown step failed: ${step.name}`, { error: (e as Error).message });
      }
    }
    clearTimeout(deadline);
    o.log('info', 'shut down', { signal });
    o.exit(failed ? 1 : 0);
  };
}
