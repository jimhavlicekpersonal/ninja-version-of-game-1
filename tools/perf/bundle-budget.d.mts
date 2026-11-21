/** Beast Mode STB-10: bundle budget. */
export const CRITICAL_BUDGET: number;
export const INDEX_BUDGET: number;
export function criticalFiles(html: string): string[];
export function measure(html: string, read: (file: string) => Uint8Array): { index: number; files: { file: string; gzip: number }[]; total: number };
