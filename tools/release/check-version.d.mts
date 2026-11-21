/** Beast Mode OPS-01: the version-bump guard. */
export interface Versions { version: string; save: number; rules: number; protocol: number; migrations: number }
export function currentVersions(root?: string): Versions;
export function semverGreater(a: string, b: string): boolean;
export function versionProblems(now: Versions, last: Versions): string[];
