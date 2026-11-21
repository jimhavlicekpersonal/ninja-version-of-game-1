export function buildLanguageAssets(options?: { serverOnly?: boolean }): { available: Record<string, { ready: boolean; path?: string }>; report: Record<string, unknown> };
export function languageBootScript(): string;
/** Beast Mode STB-08: the strings inlined in the page head (English) and in each language's boot file. */
export const BOOT_INLINE_KEYS: string[];
export function measureLanguageBuild(): Record<string, unknown>;
