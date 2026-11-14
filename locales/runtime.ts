/** Shared, dependency-free message formatting. Simulation data is never localized here.
 * Server callers always pass a locale; only presentation code uses deviceLocale.
 */
import ui from './en/ui.json';
import data from './en/data.json';
import messages from './en/messages.json';
import boot from './en/boot.json';
import parameterKinds from './message-parameters.json';
import legacyPatterns from './legacy-patterns.json';

export type Catalog = Record<string, string>;
export type MessageParams = Record<string, string | number>;
export interface MessageRef { key: string; params?: MessageParams }
export const ENGLISH: Catalog = { ...ui, ...messages, ...boot, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [`data.${k}`, v])) };
const installed = new Map<string, Catalog>([['en', ENGLISH]]);
let device = 'en';
export const deviceLocale = (): string => device;
export function setDeviceLocale(code: string): void { device = code; }
export function installCatalog(code: string, pack: Catalog): void { installed.set(code, pack); }
export const catalogFor = (code: string): Catalog => installed.get(code) ?? {};

const numbers = new Map<string, Intl.NumberFormat>();
export function numberText(n: number, code = device, integer = false): string {
  const cacheKey = `${code}:${integer}`;
  let f = numbers.get(cacheKey);
  if (!f) {
    try { f = new Intl.NumberFormat(code, { maximumFractionDigits: integer ? 0 : 20, numberingSystem: 'latn' }); }
    catch { f = new Intl.NumberFormat('en-US', { maximumFractionDigits: integer ? 0 : 20 }); }
    numbers.set(cacheKey, f);
  }
  return f.format(integer ? Math.floor(n) : n);
}
const plurals = new Map<string, Intl.PluralRules>();
function plural(n: number, code: string): string {
  let rules = plurals.get(code);
  if (!rules) {
    try { rules = new Intl.PluralRules(code); } catch { rules = new Intl.PluralRules('en'); }
    plurals.set(code, rules);
  }
  return rules.select(n);
}
function endOfGroup(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    if (s[i] === '}' && --depth === 0) return i;
  }
  return -1;
}
/** Parameters are inserted literally, never parsed as messages or HTML. */
export function format(msg: string, params: Record<string, unknown> = {}, code = device): string {
  let out = '';
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] !== '{') { out += msg[i]; continue; }
    const end = endOfGroup(msg, i);
    if (end < 0) { out += msg.slice(i); break; }
    const body = msg.slice(i + 1, end);
    const spec = /^\s*([A-Za-z0-9_]+)\s*,\s*(plural|select)\s*,([\s\S]*)$/.exec(body);
    if (spec) {
      const value = params[spec[1]];
      const branches = new Map<string, string>();
      const rest = spec[3];
      for (let j = 0; j < rest.length; j++) {
        const sel = /^\s*(=\d+|[A-Za-z_]+)\s*\{/.exec(rest.slice(j));
        if (!sel) continue;
        const open = j + sel[0].length - 1;
        const close = endOfGroup(rest, open);
        if (close < 0) break;
        branches.set(sel[1], rest.slice(open + 1, close));
        j = close;
      }
      const n = Number(value ?? 0);
      const branch = spec[2] === 'plural' ? branches.get(`=${n}`) ?? branches.get(plural(n, code)) : branches.get(String(value));
      out += format((branch ?? branches.get('other') ?? '').replace(/#/g, () => numberText(n, code)), params, code);
    } else {
      const value = params[body.trim()];
      out += value === undefined ? `{${body}}` : typeof value === 'number' ? numberText(value, code) : String(value);
    }
    i = end;
  }
  return out;
}

const bySource = new Map<string, string>();
for (const [key, value] of Object.entries(ENGLISH)) if (!bySource.has(value)) bySource.set(value, key);
// An entity-name word and a resource label can have identical English but
// different grammar. Explicit label keys win only at label display boundaries.
const labels = new Map(Object.entries(messages).filter(([k]) => k.startsWith('label.')).map(([k, v]) => [v, k]));
export function labelText(value: string, code = device, pack = catalogFor(code)): string {
  const key = labels.get(value) ?? bySource.get(value) ?? ['economy.resourceNames', 'buildings', 'troops', 'battle.heroes'].map(prefix => `data.${prefix}.${value}${prefix === 'economy.resourceNames' ? '' : '.name'}`).find(key => key in ENGLISH);
  return key ? pack[key] ?? ENGLISH[key] : value;
}
const kinds = parameterKinds as Record<string, Record<string, 'detail' | 'label' | 'number' | 'cost' | 'utc' | 'utcBare' | 'fragment'>>;
/**
 * A list in the language's own way (Intl.ListFormat). Thai CLDR joins the last item straight onto และ/หรือ, which is
 * right for a Thai word but runs a number or a Latin word into it (และ2,400): Thai puts a space around those.
 */
export function listFormat(values: readonly string[], code = device, type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  const text = new Intl.ListFormat(code, { style: 'long', type }).format(values);
  return code === 'th' ? text.replace(/(และ|หรือ)(?=[^\s\p{Script=Thai}])/gu, '$1 ') : text;
}
function costText(value: string, code: string, pack: Catalog): string {
  const parts = value.split(' and ').map(part => /^([\d,]+(?:\.\d+)?) (Coins|Provisions|Shadow Ink|Jade)$/.exec(part));
  if (!parts.every(Boolean)) return value;
  return listFormat(parts.map(m => `${numberText(Number(m![1].replace(/,/g, '')), code)} ${labelText(m![2], code, pack)}`), code);
}
function utcText(value: string, code: string, includeZone: boolean): string {
  const at = Date.parse(value.replace(/:$/, '') + (value.endsWith('GMT') ? '' : ' GMT'));
  if (!Number.isFinite(at)) return value;
  const hasTime = /\d:\d/.test(value);
  return new Intl.DateTimeFormat(code, {dateStyle:'medium', ...(hasTime ? {timeStyle:'short' as const} : {}), timeZone:'UTC'}).format(at) + (includeZone ? ' UTC' : '');
}
export function translate(key: string, params: Record<string, unknown> = {}, code = device, pack = catalogFor(code), depth = 0): string {
  const msg = pack[key] ?? ENGLISH[key];
  if (msg === undefined) return key;
  const safe = { ...params };
  if (code !== 'en' && depth < 4) for (const [name, kind] of Object.entries(kinds[key] ?? {})) {
    if (typeof safe[name] !== 'string') continue;
    if (kind === 'number') {
      const value = safe[name] as string;
      if (/^-?[\d,]+(?:\.\d+)?$/.test(value)) safe[name] = Number(value.replace(/,/g, ''));
    } else if (kind === 'cost') safe[name] = costText(safe[name] as string, code, pack);
    else if (kind === 'fragment') safe[name] = sourceText(safe[name] as string, code, pack, false, depth + 1);
    else if (kind === 'utc' || kind === 'utcBare') safe[name] = utcText(safe[name] as string, code, kind === 'utc');
    else safe[name] = kind === 'label' ? labelText(safe[name] as string, code, pack) : sourceText(safe[name] as string, code, pack, true, depth + 1);
  }
  return format(msg, safe, code);
}

type Suffix = { count?: string; previous?: string; greaterThanOne: boolean };
type SourcePattern = { key: string; re: RegExp; names: string[]; weight: number; suffixes: Record<string, Suffix> };
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns: SourcePattern[] = [];
for (const descriptor of legacyPatterns) {
  const { key, source: text } = descriptor;
  const suffixes = ('suffixes' in descriptor ? descriptor.suffixes : {}) as Record<string, Suffix>;
  const matches = [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)];
  if (!matches.length) continue;
  let at = 0, regex = '^', weight = 0;
  const names: string[] = [];
  for (const m of matches) {
    const fixed = text.slice(at, m.index);
    regex += escape(fixed) + (suffixes[m[1]] ? '(s?)' : '([\\s\\S]*?)'); weight += fixed.length; names.push(m[1]);
    at = m.index! + m[0].length;
  }
  const tail = text.slice(at);
  regex += escape(tail) + '$'; weight += tail.length;
  // Never interpret an arbitrary player's content as a message with no words.
  if (!/\p{L}/u.test(text.replace(/\{[A-Za-z0-9_]+\}/g, ''))) continue;
  patterns.push({ key, names, re: new RegExp(regex, 'u'), weight, suffixes });
}
patterns.sort((a, b) => b.weight - a.weight);
/** Canonical English from owned simulation/server history -> typed message.
 * Call only for owned system/error/bot text, never for user-authored chat/names.
 */
export function messageRef(text: string): MessageRef | undefined {
  const exact = bySource.get(text);
  if (exact && !/\{[A-Za-z0-9_]+\}/.test(ENGLISH[exact])) return { key: exact };
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (m) {
      const params: MessageParams = Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]]));
      for (const [name, rule] of Object.entries(p.suffixes)) {
        if (!rule.previous || !rule.count) continue;
        const count = Number(params[rule.count]);
        const expected = (rule.greaterThanOne ? count > 1 : count !== 1) ? 's' : '';
        if (expected === '' && params[name] === 's') { params[rule.previous] += 's'; params[name] = ''; }
        else if (expected === 's' && params[name] === '' && String(params[rule.previous]).endsWith('s')) { params[rule.previous] = String(params[rule.previous]).slice(0, -1); params[name] = 's'; }
      }
      return { key: p.key, params };
    }
  }
  return undefined;
}
/**
 * Server messages with codes (2026-11-14): `{ key, params }` parts whose text is `srv.<key>`, joined by
 * `srv.join` (a translator can drop the space). The server renders the same parts in English.
 */
export function partsText(parts: readonly MessageRef[], code = device, pack = catalogFor(code), depth = 0): string {
  let out: string | undefined;
  for (const part of parts) {
    const text = translate(`srv.${part.key}`, part.params ?? {}, code, pack, depth);
    out = out === undefined ? text : translate('srv.join', { first: out, second: text }, code, pack, depth);
  }
  return out ?? '';
}
/** A code this build knows (`srv.<key>` in its English catalog). */
export const knownMessage = (key: unknown): key is string => typeof key === 'string' && key !== 'join' && Object.hasOwn(ENGLISH, `srv.${key}`);
/** Plain parameters only: strings and finite numbers (anything else from the wire is dropped). */
function cleanParams(params: unknown): MessageParams | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined;
  const out: MessageParams = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (/^[A-Za-z0-9_]{1,32}$/.test(k) && (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) out[k] = typeof v === 'string' ? v.slice(0, 2000) : v;
  }
  return out;
}
/** Parts from the wire, or undefined when any part's code is unknown to this build (then the English is matched as before). */
export function messageParts(value: unknown): MessageRef[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 8) return undefined;
  const out: MessageRef[] = [];
  for (const p of value) {
    if (!p || typeof p !== 'object' || !knownMessage((p as MessageRef).key)) return undefined;
    const params = cleanParams((p as MessageRef).params);
    out.push(params && Object.keys(params).length ? { key: (p as MessageRef).key, params } : { key: (p as MessageRef).key });
  }
  return out;
}
const remembered = new Map<string, MessageRef[]>();
const REMEMBERED_MAX = 200;
/**
 * The server's English for a message it also sent as codes. Error texts travel through the game as plain
 * strings (results, toasts), so the network layer remembers which codes each English text came with and
 * `sourceText` prefers them; texts without codes (older servers) are pattern-matched as before.
 */
export function rememberServerMessage(text: string, parts: unknown): void {
  const clean = messageParts(parts);
  if (!text || !clean) return;
  remembered.delete(text);
  remembered.set(text, clean);
  if (remembered.size > REMEMBERED_MAX) remembered.delete(remembered.keys().next().value!);
}
/** The codes remembered for this English text, if any. */
export const rememberedParts = (text: string): MessageRef[] | undefined => remembered.get(text);
/** Historical canonical wording is a compatibility input, not saved in the
 * reader's language. Unknown provider diagnostics get a localized fallback.
 */
export function sourceText(text: string, code = device, pack = catalogFor(code), errorFallback = false, depth = 0): string {
  if (code === 'en') return text;
  const parts = remembered.get(text);
  if (parts) return partsText(parts, code, pack, depth);
  const ref = messageRef(text);
  if (ref) return translate(ref.key, ref.params, code, pack, depth);
  return errorFallback ? (pack['common.unknownError'] ?? ENGLISH['common.unknownError']) : text;
}
