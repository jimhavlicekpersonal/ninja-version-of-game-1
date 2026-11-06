export const LANGUAGE_ALIASES: Record<string, string>;
export function matchLanguage(device: readonly string[], shipped: readonly string[], aliases?: Record<string, string>): string;
