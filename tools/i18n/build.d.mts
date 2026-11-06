export function buildLanguageAssets(): { available: Record<string, { ready: boolean; path?: string }>; report: Record<string, unknown> };
export function languageBootScript(): string;
export function measureLanguageBuild(): Record<string, unknown>;
