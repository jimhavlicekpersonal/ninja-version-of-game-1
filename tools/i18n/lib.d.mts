export interface Language {
  code: string;
  name: string;
  native: string;
  script: string;
  dir: 'ltr' | 'rtl';
  wave: number;
  appStore: boolean;
  alsoFor?: string[];
  note?: string;
}
export interface Entry {
  en: string;
  text: string;
  old?: string;
}
export const ROOT: string;
export const LOCALES: string;
export function languages(): { source: string; languages: Language[] };
export function targets(): (Language & { i: number })[];
export function extractData(): Record<string, string>;
export function namespaces(): string[];
export function source(ns: string): Record<string, string>;
export function worksheetPath(code: string, ns: string): string;
export function worksheet(code: string, ns: string): Record<string, Entry>;
export function formatSource(map: Record<string, string>): string;
export function formatWorksheet(map: Record<string, Entry>): string;
export function writeSource(ns: string, map: Record<string, string>): void;
export function syncWorksheet(src: Record<string, string>, ws: Record<string, Entry>): { worksheet: Record<string, Entry>; added: number; changed: number; removed: number };
export function scriptShare(texts: string[], script: string): number;
/** Characters in `text` that do not belong in Simplified (Hans) or Traditional (Hant) Chinese. */
export function wrongHanForms(text: string, script: string): string[];
export function checkWorksheet(lang: Language, ns: string, src: Record<string, string>, ws: unknown): { total: number; done: number; errors: string[]; warnings: string[]; translated: string[] };
export function checkLanguage(lang: Language): { code: string; total: number; done: number; errors: string[]; warnings: string[] };
