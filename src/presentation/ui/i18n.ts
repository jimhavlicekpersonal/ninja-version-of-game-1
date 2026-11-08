/** Device language and compact catalogs. All native catalogs are packaged;
 * browsers fetch only the selected catalog. See docs/localization/README.md. */
import { matchLanguage } from '../../../locales/matcher.mjs';
import languagesFile from '../../../locales/languages.json';
import availabilityFile from '../../../locales/availability.json';
import { ENGLISH, catalogFor, deviceLocale, format, installCatalog, labelText as sharedLabel, numberText, setDeviceLocale, sourceText as sharedSource, translate } from '../../../locales/runtime';
import type { Catalog, MessageRef } from '../../../locales/runtime';
import { PRESET_CHAT } from '../../backend/net/protocol';
export type { MessageRef } from '../../../locales/runtime';
type Lang = { code: string; name: string; native: string; script: string; dir: 'ltr' | 'rtl'; alsoFor?: string[]; generatedNames?: 'noun-first' };
type Availability = { coverage: number; ready: boolean; hash?: string; path?: string; keys?: number };
const LANGS = (languagesFile as { languages: Lang[] }).languages;
const AVAILABLE = availabilityFile as Record<string, Availability>;
const ALIASES: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi', tl: 'fil', no: 'nb', nn: 'nb', 'zh-cn': 'zh-Hans', 'zh-sg': 'zh-Hans', 'zh-tw': 'zh-Hant', 'zh-hk': 'zh-Hant', 'zh-mo': 'zh-Hant', zh: 'zh-Hans' };
for (const l of LANGS) for (const a of l.alsoFor ?? []) ALIASES[a.toLowerCase()] = l.code;
export function pickLanguage(device: readonly string[], shipped: readonly string[] = LANGS.map(l => l.code)): string { return matchLanguage(device, shipped, ALIASES); }

export function languagePreference(): string | null {
  try { const v = localStorage.getItem('tk.lang'); return v && v !== 'auto' ? v : null; } catch { return null; }
}
export function setLanguagePreference(code: string | null): void {
  try { if (code) localStorage.setItem('tk.lang', code); else localStorage.removeItem('tk.lang'); } catch { /* blocked storage */ }
}
export const READY_COVERAGE = 1;
export async function languageCoverage(code: string): Promise<number> { return AVAILABLE[code]?.coverage ?? 0; }
function validPack(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pack = value as Record<string, unknown>;
  return Object.keys(pack).length === Object.keys(ENGLISH).length && Object.keys(ENGLISH).every(key => typeof pack[key] === 'string' && pack[key] !== '');
}
async function load(code: string): Promise<void> {
  if (code === 'en' || Object.keys(catalogFor(code)).length >= (AVAILABLE[code]?.keys ?? Infinity) || !AVAILABLE[code]?.ready) return;
  // Tests of formatting in unshipped locales need no filesystem/network loader.
  if (typeof document === 'undefined') return;
  const meta = AVAILABLE[code];
  const cacheKey = `tk.lang.pack:${code}:${meta.hash ?? ''}`;
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
    if (validPack(cached) && Object.keys(cached).length === meta.keys) { installCatalog(code, cached); return; }
  } catch { /* quota/private mode or an invalid cache: use packaged/network asset */ }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const bootstrap = window.__kgLocale;
    const value: unknown = bootstrap?.code === code && bootstrap.pack ? await bootstrap.pack : await (async () => {
      const url = new URL(meta.path ?? `lang/${code}.json`, document.baseURI);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`language HTTP ${response.status}`);
      return response.json();
    })();
    if (!validPack(value) || Object.keys(value).length !== meta.keys) throw new Error('invalid language catalog');
    installCatalog(code, value);
    try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch { /* SW/native assets remain available */ }
  } finally { clearTimeout(timer); }
}
export async function useLanguage(code: string): Promise<void> {
  const chosen = LANGS.find(l => l.code === code) ?? LANGS[0];
  await load(chosen.code);
  setDeviceLocale(chosen.code);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = chosen.code;
    document.documentElement.dir = chosen.dir;
    document.documentElement.dataset.script = chosen.script;
  }
}
export async function initLanguage(device: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Promise<string> {
  const choice = languagePreference() ?? automaticLanguage(device);
  const code = AVAILABLE[choice]?.ready ? choice : 'en';
  // A small boot-only catalog is inline even if the complete pack cannot load.
  if (typeof window !== 'undefined' && window.__kgLocale?.code === code && window.__kgLocale.boot) installCatalog(code, window.__kgLocale.boot);
  try {
    await useLanguage(code);
  } catch {
    setDeviceLocale(code);
    throw new Error(t('boot.languageError'));
  }
  return deviceLocale();
}
export function automaticLanguage(device: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): string {
  return pickLanguage(device, LANGS.filter(l => AVAILABLE[l.code]?.ready).map(l => l.code));
}
export function language(): Lang { return LANGS.find(l => l.code === deviceLocale()) ?? LANGS[0]; }
export function languages(): readonly Lang[] { return LANGS; }
export function isRtl(): boolean { return language().dir === 'rtl'; }
export function t(key: string, params?: Record<string, unknown>): string { return translate(key, params); }
export function labelText(value: string): string { return sharedLabel(value); }
export function messageText(value: string, error = false): string { return sharedSource(value, deviceLocale(), catalogFor(deviceLocale()), error); }
/** Authored chat remains literal. Only server-marked presets and owned lines localize. */
export function chatText(m: { text: string; kind: string; presetId?: number }, computerAuthored = false): string {
  if (m.presetId !== undefined && Number.isInteger(m.presetId) && PRESET_CHAT[m.presetId]) return labelText(PRESET_CHAT[m.presetId]);
  return m.kind !== 'chat' || computerAuthored ? messageText(m.text) : m.text;
}
export function renderMessage(ref: MessageRef | undefined, fallback: string): string { return ref ? translate(ref.key, ref.params) : messageText(fallback); }
export function formatMessage(msg: string, params?: Record<string, unknown>): string { return format(msg, params); }
export function fmtNumber(n: number): string { return numberText(n, deviceLocale(), true); }
export function pointLabel(letter: string): string { const i = 'ABCDEFGH'.indexOf(letter); return language().script !== 'Latn' && i >= 0 ? String(i + 1) : letter; }
export function dateText(at: number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(deviceLocale(), options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(at);
}
export function listText(values: readonly string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(deviceLocale(), { style: 'long', type }).format(values);
}
/** Only call for an explicitly computer-generated identity. */
export function generatedName(value: string, kind: 'place' | 'grove' = 'place'): string {
  if (kind === 'place' && value.includes(' · ')) { const [head, ...tail] = value.split(' · '); return `${labelText(head)} · ${generatedName(tail.join(' · '))}`; }
  const first = Object.entries(ENGLISH).filter(([k]) => k.startsWith(kind === 'place' ? 'data.names.placeFirst.' : 'data.social.groveNames.first.'));
  const second = Object.entries(ENGLISH).filter(([k]) => k.startsWith(kind === 'place' ? 'data.names.placeSecond.' : 'data.social.groveNames.second.'));
  for (const [a, x] of first) for (const [b, y] of second) if (value === `${x} ${y}`) return LANGS.find(l => l.code === deviceLocale())?.generatedNames === 'noun-first' ? `${t(b)} ${t(a)}` : `${t(a)} ${t(b)}`;
  return messageText(value);
}
/** Only canonical game data may be passed here, never player-owned objects.
 * Lazy view proxies localize declared data keys on read; no data/save is mutated. */
const views = new WeakMap<object, Map<string, object>>();
export function displayData<T extends object>(source: T, prefix = ''): T {
  let paths = views.get(source);
  if (!paths) { paths = new Map(); views.set(source, paths); }
  const existing = paths.get(prefix); if (existing) return existing as T;
  const view = new Proxy(source, { get(target, prop, receiver) {
    const value: unknown = Reflect.get(target, prop, receiver);
    if (typeof prop !== 'string') return value;
    let segment = prop;
    if (Array.isArray(target) && /^\d+$/.test(prop) && value && typeof value === 'object') {
      const item = value as { id?: unknown; tier?: unknown };
      if (typeof item.id === 'string') segment = item.id;
      else if (typeof item.tier === 'number') segment = `tier${item.tier}`;
    }
    const path = prefix ? `${prefix}.${segment}` : segment;
    if (typeof value === 'string' && ENGLISH[`data.${path}`] === value) return t(`data.${path}`);
    return value && typeof value === 'object' ? displayData(value, path) : value;
  } });
  paths.set(prefix, view); return view;
}

declare global {
  interface Window { __kgLocale?: { code: string; boot?: Catalog; pack?: Promise<unknown> }; }
}
