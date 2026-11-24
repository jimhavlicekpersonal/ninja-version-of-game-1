/** Beast Mode OPS-05: rollback rules. */
export function webRollbackProblem(live: { save?: number; rules?: number } | null, target: { save?: number; rules?: number } | null): string | null;
export function serverRollbackProblem(liveRules: number[] | undefined, targetRules: number[]): string | null;
export function rulesAtCommit(commit: string): number[];
/** What to compare with when the live site or server cannot be read (web: refused unless allowed; server: the workflow commit's rules). */
export function unreadableLive(kind: 'web' | 'server', allowUnverified: boolean, headRules?: number[]): { liveRules?: number[]; problem: string | null };
