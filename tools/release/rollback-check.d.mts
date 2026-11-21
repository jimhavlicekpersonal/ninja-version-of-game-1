/** Beast Mode OPS-05: rollback rules. */
export function webRollbackProblem(live: { save?: number; rules?: number } | null, target: { save?: number; rules?: number } | null): string | null;
export function serverRollbackProblem(liveRules: number[] | undefined, targetRules: number[]): string | null;
export function rulesAtCommit(commit: string): number[];
