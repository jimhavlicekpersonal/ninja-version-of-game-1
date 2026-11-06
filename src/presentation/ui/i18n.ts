/**
 * The text layer (state-of-the-game report, section 5 step 9; compliance L01–L04, art F15, F16).
 *
 * - Messages are keyed (`locales/en/ui.json` is the English source; `npm run i18n:sync` puts every key in each
 *   language's worksheet `locales/<code>/ui.json`, which a translation session fills). A missing translation
 *   falls back to English, a missing key to the key itself (tests keep English complete).
 * - Messages are ICU-lite: `{name}` placeholders and `{n, plural, one {…} few {…} other {…}}` with the
 *   language's own plural rules (`Intl.PluralRules`); `#` inside a branch is the number, formatted.
 * - Numbers use the language's grouping with Western digits everywhere (`locales/languages.json`: Arabic
 *   and Persian players read the game's numbers in Western digits).
 * - The language is a device preference, never part of the save (owner decision,
 *   `docs/prompts/DOWNLOAD_AND_LANGUAGE.md` section 6): the stored choice, else the first device language
 *   the game ships (RFC 4647 lookup with the usual aliases), else English. `<html lang dir>` follow it.
 * - Fonts are never downloaded: the two display fonts are Latin subsets and every other script uses the
 *   phone's own fonts (styles.css `--font-*` stacks per script, `:lang()`).
 */
import en from '../../../locales/en/ui.json';
import languagesFile from '../../../locales/languages.json';

type Lang = { code: string; name: string; native: string; script: string; dir: 'ltr' | 'rtl'; alsoFor?: string[] };
const LANGS = (languagesFile as { languages: Lang[] }).languages;
const EN = en as Record<string, string>;
const PREF_KEY = 'tk.lang';

/** Device language tags that name a shipped language under another code. */
const ALIASES: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi', tl: 'fil', no: 'nb', nn: 'nb', 'zh-cn': 'zh-Hans', 'zh-sg': 'zh-Hans', 'zh-tw': 'zh-Hant', 'zh-hk': 'zh-Hant', 'zh-mo': 'zh-Hant', zh: 'zh-Hans' };
for (const l of LANGS) for (const a of l.alsoFor ?? []) ALIASES[a.toLowerCase()] = l.code;

let current: Lang = LANGS.find((l) => l.code === 'en')!;
let pack: Record<string, string> = {};

/**
 * The shipped language for a list of device tags (most preferred first), RFC 4647 lookup: each tag is
 * shortened from the end until something matches; the first tag that matches wins ([gsw-CH, de-CH, en] → de).
 */
export function pickLanguage(device: readonly string[], shipped: readonly string[] = LANGS.map((l) => l.code)): string {
  const byLower = new Map(shipped.map((c) => [c.toLowerCase(), c]));
  for (const raw of device) {
    if (!raw) continue;
    let tag = raw.replace(/_/g, '-').toLowerCase();
    // Chinese: the script decides (Hant for Taiwan, Hong Kong and Macao, else Hans).
    if (tag.startsWith('zh')) {
      if (/-hant\b|-(tw|hk|mo)\b/.test(tag) && byLower.has('zh-hant')) return byLower.get('zh-hant')!;
      if (byLower.has('zh-hans')) return byLower.get('zh-hans')!;
    }
    while (tag) {
      const hit = byLower.get(tag) ?? (ALIASES[tag] ? byLower.get(ALIASES[tag].toLowerCase()) : undefined);
      if (hit) return hit;
      const cut = tag.lastIndexOf('-');
      tag = cut > 0 ? tag.slice(0, cut) : '';
    }
  }
  return 'en';
}

/** The player's stored choice ('auto' or none: follow the device). */
export function languagePreference(): string | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v && v !== 'auto' ? v : null;
  } catch {
    return null;
  }
}

export function setLanguagePreference(code: string | null): void {
  try {
    if (code) localStorage.setItem(PREF_KEY, code);
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* storage blocked: the device language is used */
  }
}

/** Worksheets of every language (lazy: the web build fetches only the one in use). */
const worksheets = import.meta.glob<Record<string, { en: string; text: string }>>('../../../locales/*/ui.json', { import: 'default' });

/** How much of a language's interface is translated (0..1). */
export async function languageCoverage(code: string): Promise<number> {
  if (code === 'en') return 1;
  const load = worksheets[`../../../locales/${code}/ui.json`];
  if (!load) return 0;
  const ws = await load();
  const keys = Object.keys(EN);
  return keys.length ? keys.filter((k) => ws[k]?.text).length / keys.length : 0;
}

/** Choose the language (stored choice, else the device's), load its texts and set `<html lang dir>`. Never throws. */
export async function initLanguage(device: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Promise<string> {
  const code = languagePreference() ?? pickLanguage(device);
  // Until a language's interface is mostly translated, the game stays in English (right-to-left layout and
  // other numbers would only make English harder to read). Translation sessions lift this one language at a time.
  await useLanguage((await languageCoverage(code)) >= READY_COVERAGE ? code : 'en');
  return current.code;
}

/** Share of the interface a language needs translated before the game uses it. */
export const READY_COVERAGE = 0.8;

export async function useLanguage(code: string): Promise<void> {
  current = LANGS.find((l) => l.code === code) ?? LANGS.find((l) => l.code === 'en')!;
  pack = {};
  if (current.code !== 'en') {
    try {
      const load = worksheets[`../../../locales/${current.code}/ui.json`];
      const ws = load ? await load() : {};
      for (const [k, v] of Object.entries(ws)) if (v?.text) pack[k] = v.text;
    } catch {
      pack = {};
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current.code;
    document.documentElement.dir = current.dir;
    // styles.css picks fonts per script (never downloaded) and mirrors the edges for right-to-left.
    document.documentElement.dataset.script = current.script;
  }
}

export function language(): { code: string; native: string; dir: 'ltr' | 'rtl'; script: string } {
  return { code: current.code, native: current.native, dir: current.dir, script: current.script };
}

export function languages(): readonly Lang[] {
  return LANGS;
}

export function isRtl(): boolean {
  return current.dir === 'rtl';
}

let numberFormat: Intl.NumberFormat | null = null;
let numberFormatFor = '';
/** 5448274 → "5,448,274" (en), "5.448.274" (de), "54,48,274" (hi): the language's grouping, Western digits. */
export function fmtNumber(n: number): string {
  if (numberFormatFor !== current.code || !numberFormat) {
    try {
      numberFormat = new Intl.NumberFormat(current.code, { maximumFractionDigits: 0, numberingSystem: 'latn' } as Intl.NumberFormatOptions);
    } catch {
      numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    }
    numberFormatFor = current.code;
  }
  return numberFormat.format(Math.floor(n));
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralCategory(n: number): string {
  let r = pluralRules.get(current.code);
  if (!r) {
    try {
      r = new Intl.PluralRules(current.code);
    } catch {
      r = new Intl.PluralRules('en');
    }
    pluralRules.set(current.code, r);
  }
  return r.select(n);
}

/** Find the end of a `{…}` group starting at `open` (nested braces counted). */
function groupEnd(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return s.length - 1;
}

/** Format an ICU-lite message with `params`. Exported for tests. */
export function formatMessage(msg: string, params: Record<string, string | number> = {}): string {
  let out = '';
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] !== '{') {
      out += msg[i];
      continue;
    }
    const end = groupEnd(msg, i);
    const body = msg.slice(i + 1, end);
    const m = /^\s*([A-Za-z0-9_]+)\s*,\s*plural\s*,(.*)$/s.exec(body);
    if (m) {
      const n = Number(params[m[1]] ?? 0);
      const branches = new Map<string, string>();
      const rest = m[2];
      for (let j = 0; j < rest.length; j++) {
        const sel = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(rest.slice(j));
        if (!sel) continue;
        const open = j + sel[0].length - 1;
        const close = groupEnd(rest, open);
        branches.set(sel[1], rest.slice(open + 1, close));
        j = close;
      }
      const branch = branches.get(`=${n}`) ?? branches.get(pluralCategory(n)) ?? branches.get('other') ?? '';
      out += formatMessage(branch.replace(/#/g, fmtNumber(n)), params);
    } else {
      const v = params[body.trim()];
      out += v === undefined ? `{${body}}` : typeof v === 'number' ? fmtNumber(v) : v;
    }
    i = end;
  }
  return out;
}

/** The message for `key` in the player's language (English when not translated yet). */
export function t(key: string, params?: Record<string, string | number>): string {
  const msg = pack[key] ?? EN[key];
  if (msg === undefined) return key;
  return params ? formatMessage(msg, params) : msg;
}

/**
 * Infiltration Point labels (art F16): letters are the points' ids; players of languages written in other
 * scripts see numbers (1–8) instead of foreign letters.
 */
export function pointLabel(letter: string): string {
  if (current.script === 'Latn') return letter;
  const i = 'ABCDEFGH'.indexOf(letter);
  return i >= 0 ? String(i + 1) : letter;
}
