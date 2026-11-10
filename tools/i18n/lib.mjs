/**
 * Translation tooling for locales/ (see locales/CLAUDE.md). Pure functions; the
 * CLI is i18n.mjs and the checks also run in tests/locales/locales.test.ts.
 *
 * Layout:
 *   locales/languages.json      the 50 languages
 *   locales/en/<ns>.json        English source: { key: text }
 *   locales/<code>/<ns>.json    worksheet: { key: { en, text, old? } }
 * "data" is generated from src/gameplay/data by extract(); other namespaces
 * (for example "ui") are written by hand or by the text layer.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOCALES = join(ROOT, 'locales');
const DATA = join(ROOT, 'src', 'gameplay', 'data');

// ------------------------------------------------------------------ languages

export function languages() {
  return JSON.parse(readFileSync(join(LOCALES, 'languages.json'), 'utf8'));
}

/** Target languages in translation order (wave, then list order). */
export function targets() {
  const { source, languages: all } = languages();
  return all.filter((l) => l.code !== source).map((l, i) => ({ ...l, i })).sort((a, b) => a.wave - b.wave || a.i - b.i);
}

// ------------------------------------------------------------------ extract

/** Fields whose string value is player-facing text. */
const TEXT_KEYS = new Set(['name', 'description', 'text', 'label', 'title', 'summary', 'bio', 'leader']);
/** Whole string lists that are player-facing (generated names, bot chat). */
const LISTS = [/^names\.(placeFirst|placeSecond|playerFirst|playerSecond)$/, /^social\.chatLines\.\w+$/, /^social\.groveNames\.\w+$/];
/** Never translated: comments, art descriptions, moderation lists, codes. */
const SKIP = new Set(['$comment', 'look', 'visualStages', 'profanity', 'currency', 'productId']);

function segment(item, index) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    if (typeof item.id === 'string') return item.id;
    if (typeof item.tier === 'number') return `tier${item.tier}`;
  }
  return String(index);
}

function walk(value, path, out) {
  if (Array.isArray(value)) {
    const p = path.join('.');
    if (LISTS.some((re) => re.test(p))) {
      value.forEach((s, i) => typeof s === 'string' && out.push([`${p}.${i}`, s]));
      return;
    }
    value.forEach((item, i) => walk(item, [...path, segment(item, i)], out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SKIP.has(k)) continue;
      if (typeof v === 'string') {
        if ((TEXT_KEYS.has(k) || path.join('.') === 'economy.resourceNames') && /\p{L}/u.test(v)) out.push([[...path, k].join('.'), v]);
      } else walk(v, [...path, k], out);
    }
  }
}

/** English source strings from the game data, keyed by stable ids. */
export function extractData() {
  const out = [];
  for (const file of readdirSync(DATA).filter((f) => f.endsWith('.json')).sort()) {
    walk(JSON.parse(readFileSync(join(DATA, file), 'utf8')), [file.replace(/\.json$/, '')], out);
  }
  const map = {};
  for (const [k, v] of out) {
    if (k in map && map[k] !== v) throw new Error(`Duplicate key with different text: ${k}`);
    map[k] = v;
  }
  return map;
}

// ------------------------------------------------------------------ files

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function namespaces() {
  return readdirSync(join(LOCALES, 'en')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

export function source(ns) {
  return read(join(LOCALES, 'en', `${ns}.json`));
}

export function worksheetPath(code, ns) {
  return join(LOCALES, code, `${ns}.json`);
}

export function worksheet(code, ns) {
  const p = worksheetPath(code, ns);
  return existsSync(p) ? read(p) : {};
}

/** One entry per line, so diffs and AI edits stay small. */
export function formatSource(map) {
  const lines = Object.entries(map).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

export function formatWorksheet(map) {
  const lines = Object.entries(map).map(([k, e]) => {
    const parts = [`"en": ${JSON.stringify(e.en)}`, `"text": ${JSON.stringify(e.text)}`];
    if (e.old) parts.push(`"old": ${JSON.stringify(e.old)}`);
    return `  ${JSON.stringify(k)}: { ${parts.join(', ')} }`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

export function writeSource(ns, map) {
  mkdirSync(join(LOCALES, 'en'), { recursive: true });
  writeFileSync(join(LOCALES, 'en', `${ns}.json`), formatSource(map));
}

// ------------------------------------------------------------------ sync

/**
 * Bring a worksheet up to date with English: new keys get an empty text,
 * removed keys go, and a translation whose English changed is moved to `old`
 * (shown to the translator as a hint) and the entry goes back on the to-do list.
 */
export function syncWorksheet(src, ws) {
  const out = {};
  let added = 0;
  let changed = 0;
  for (const [k, en] of Object.entries(src)) {
    const e = ws[k];
    if (!e) {
      out[k] = { en, text: '' };
      added++;
    } else if (e.en !== en) {
      out[k] = { en, text: '', ...(e.text || e.old ? { old: e.text || e.old } : {}) };
      changed++;
    } else {
      out[k] = { en, text: e.text ?? '', ...(e.old && !e.text ? { old: e.old } : {}) };
    }
  }
  const removed = Object.keys(ws).filter((k) => !(k in src)).length;
  return { worksheet: out, added, changed, removed };
}

// ------------------------------------------------------------------ checks

const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/g;
// As a set: ICU plural branches repeat placeholders, and a language may add branches (few, many) the English lacks.
const placeholders = (s) => [...new Set([...s.matchAll(/\{([A-Za-z0-9_]+)(?:\}|\s*,\s*(?:plural|select)\s*,)/g)].map(m => `{${m[1]}}`))].sort().join(' ');

const SCRIPT = {
  Latn: /\p{Script=Latin}/u,
  Cyrl: /\p{Script=Cyrillic}/u,
  Grek: /\p{Script=Greek}/u,
  Arab: /\p{Script=Arabic}/u,
  Hebr: /\p{Script=Hebrew}/u,
  Hans: /\p{Script=Han}/u,
  Hant: /\p{Script=Han}/u,
  Jpan: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  Kore: /[\p{Script=Hangul}\p{Script=Han}]/u,
  Deva: /\p{Script=Devanagari}/u,
  Beng: /\p{Script=Bengali}/u,
  Guru: /\p{Script=Gurmukhi}/u,
  Gujr: /\p{Script=Gujarati}/u,
  Orya: /\p{Script=Oriya}/u,
  Taml: /\p{Script=Tamil}/u,
  Telu: /\p{Script=Telugu}/u,
  Knda: /\p{Script=Kannada}/u,
  Mlym: /\p{Script=Malayalam}/u,
  Thai: /\p{Script=Thai}/u,
  Ethi: /\p{Script=Ethiopic}/u,
};

// Unicode has one Han script for Simplified, Traditional and Japanese, so the script share cannot tell
// them apart. These common characters are never Simplified Chinese (Traditional forms, then Japanese
// shinjitai forms); the second list is common Simplified-only characters that do not belong in zh-Hant.
const NOT_SIMPLIFIED = /[們這個為會來時說對發點開戰鬥歸據門問題現實際與從長幾無過還進選擇運動電話國語學習買賣讀寫聽見觀覺關係網絡經驗圖書館體號碼頁麼東車馬鳥魚龍風飛雲氣變處當將應該給讓認識記錄設計劃級線結術藝園區隊員幣糧倉庫壘劍獎勵寶榮譽聯萬億裡錢銀鐵銅鍛煉練戦気剣図楽帰黒円売読単対発権歩済効険検験駅様拡広変恵悪営労弾隠鉄両囲亜仏価桜蔵総]/u;
const NOT_TRADITIONAL = /[们这个为会来时说对发点开战归据门问题现实际与从长无过还进选择运动电话国语学习买卖读写听见观觉关网络经验图书]/u;
export function wrongHanForms(text, script) {
  const re = script === 'Hans' ? NOT_SIMPLIFIED : script === 'Hant' ? NOT_TRADITIONAL : null;
  return re ? [...new Set([...text].filter(ch => re.test(ch)))] : [];
}

const DENSE = new Set(['Hans', 'Hant', 'Jpan', 'Kore']);
/** Share of letters (outside placeholders) written in the expected script. */
export function scriptShare(texts, script) {
  const re = SCRIPT[script];
  let total = 0;
  let hit = 0;
  for (const t of texts) {
    // ICU syntax (`{n, plural, one {…} other {…}}`) is Latin in every language: count only the words a player reads.
    let words = t.replace(/\{\s*[A-Za-z0-9_]+\s*,\s*(?:plural|select)\s*,/g, '').replace(/(?:=\d+|\b[A-Za-z_]+)\s*\{/g, '{').replace(PLACEHOLDER, '');
    // A Han, kana or Hangul character is about a word, so in those scripts a Latin brand or code word
    // (Kagemura, App Store, IndexedDB) counts as one letter, not as one per letter.
    if (DENSE.has(script)) words = words.replace(/\p{Script=Latin}+/gu, 'L');
    for (const ch of words) {
      if (!/\p{L}/u.test(ch)) continue;
      total++;
      if (re.test(ch)) hit++;
    }
  }
  return total ? hit / total : 1;
}

/** Validate one parsed worksheet without touching the filesystem. */
export function checkWorksheet(lang, ns, src, ws) {
  const errors = [];
  const warnings = [];
  const translated = [];
  const total = Object.keys(src).length;
  let done = 0;
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) {
    return { total, done, errors: [`${ns}: worksheet must be an object`], warnings, translated };
  }
  for (const k of Object.keys(ws)) if (!Object.hasOwn(src, k)) errors.push(`${ns}: ${k} is not in English (run npm run i18n:sync)`);
  for (const [k, en] of Object.entries(src)) {
    if (!Object.hasOwn(ws, k)) {
      errors.push(`${ns}: ${k} missing (run npm run i18n:sync)`);
      continue;
    }
    const e = ws[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      errors.push(`${ns}: ${k} must be an entry object`);
      continue;
    }
    if (e.en !== en) errors.push(`${ns}: ${k} has stale English (run npm run i18n:sync)`);
    const t = e.text;
    if (typeof t !== 'string') {
      errors.push(`${ns}: ${k} text is not a string`);
      continue;
    }
    if (!t) continue;
    done++;
    translated.push(t);
    if (placeholders(t) !== placeholders(en)) errors.push(`${ns}: ${k} placeholders ${placeholders(t) || 'none'} must be ${placeholders(en) || 'none'}`);
    let depth = 0;
    for (const ch of t) { if (ch === '{') depth++; else if (ch === '}' && --depth < 0) break; }
    if (depth !== 0) errors.push(`${ns}: ${k} has unbalanced message braces`);
    if (ns === 'pages') {
      const rich = value => (value.match(/\{t\d+\}/g) ?? []).sort().join(' ');
      if (rich(t) !== rich(en)) errors.push(`${ns}: ${k} must preserve every rich-text token exactly once`);
    }
    if ((/^\s/.test(t) && !/^\s/.test(en)) || (/\s$/.test(t) && !/\s$/.test(en))) errors.push(`${ns}: ${k} has leading or trailing spaces absent in English`);
    if (t.includes('\n') && !en.includes('\n')) errors.push(`${ns}: ${k} has a line break the English does not`);
    if (/[<>]/.test(t) && !/[<>]/.test(en)) errors.push(`${ns}: ${k} contains < or >`);
    if (t !== t.normalize('NFC')) errors.push(`${ns}: ${k} is not NFC-normalized`);
    // ZWJ/ZWNJ are spelling characters in Indic/Arabic scripts. Refuse the
    // other invisible controls, including CGJ, fillers and stray selectors.
    const visible = t.replace(/[\u200C\u200D]/g, '').replace(/(\p{Extended_Pictographic}|[0-9#*])[\uFE0E\uFE0F]/gu, '$1');
    if (/[\p{Default_Ignorable_Code_Point}\p{Cc}]/u.test(visible.replace(/\n/g, ''))) errors.push(`${ns}: ${k} contains invisible direction or control characters`);
    // Romanian ș ț are comma-below letters; the look-alike cedilla forms break search and sorting.
    if (lang.code === 'ro' && /[\u015E\u015F\u0162\u0163]/u.test(t)) errors.push(`${ns}: ${k} uses the cedilla ş ţ; Romanian writes the comma-below ș ț (U+0219, U+021B)`);
    // Catalan l·l uses the middle dot U+00B7; the compatibility letters ŀ Ŀ are not used in modern text.
    if (lang.code === 'ca' && /[\u013F\u0140]/u.test(t)) errors.push(`${ns}: ${k} uses ŀ; Catalan writes l·l with the middle dot U+00B7`);
    // Dutch IJ is the two letters i + j; the compatibility ligatures ĳ Ĳ break search, sorting and the Latin-1 fonts.
    if (lang.code === 'nl' && /[\u0132\u0133]/u.test(t)) errors.push(`${ns}: ${k} uses the ligature ĳ; Dutch writes IJ as the two letters i + j`);
    const wrongHan = wrongHanForms(t, lang.script);
    if (wrongHan.length && lang.script === 'Hans') errors.push(`${ns}: ${k} uses ${wrongHan.join(' ')}, which are not Simplified Chinese characters`);
    else if (wrongHan.length) warnings.push(`${ns}: ${k} uses ${wrongHan.join(' ')}, which are Simplified-only characters`);
    if (t === en && /\p{L}/u.test(en)) warnings.push(`${ns}: ${k} is identical to English`);
    if (SCRIPT[lang.script] && t !== en && scriptShare([t], lang.script) < 0.7) warnings.push(`${ns}: ${k} mostly uses a different script`);
    if (t.length > en.length * 2.5 + 8) warnings.push(`${ns}: ${k} is ${(t.length / en.length).toFixed(1)}x the English length`);
  }
  return { total, done, errors, warnings, translated };
}

/** Problems in a language; errors fail the CLI and tests, warnings need review. */
export function checkLanguage(lang) {
  const errors = [];
  const warnings = [];
  const translated = [];
  let total = 0;
  let done = 0;
  if (!SCRIPT[lang.script]) errors.push(`unknown script ${lang.script}`);
  for (const ns of namespaces()) {
    const src = source(ns);
    let ws;
    try {
      ws = worksheet(lang.code, ns);
    } catch (e) {
      total += Object.keys(src).length;
      errors.push(`${ns}: cannot read worksheet: ${e.message}`);
      continue;
    }
    if (!existsSync(worksheetPath(lang.code, ns))) {
      total += Object.keys(src).length;
      errors.push(`${ns}: no worksheet (run npm run i18n:sync)`);
      continue;
    }
    const result = checkWorksheet(lang, ns, src, ws);
    total += result.total;
    done += result.done;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    translated.push(...result.translated);
  }
  if (translated.length >= 20 && SCRIPT[lang.script]) {
    const share = scriptShare(translated, lang.script);
    if (share < 0.7) errors.push(`only ${Math.round(share * 100)}% of letters are in the ${lang.script} script; is this the right language?`);
  }
  return { code: lang.code, total, done, errors, warnings };
}
