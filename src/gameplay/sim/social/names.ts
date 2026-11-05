/**
 * Player and Alliance names in any of the world's scripts: 日本語, 한국어, العربية,
 * हिन्दी, አማርኛ, ไทย, Ελληνικά, Русский… The same rules run on the phone (instant
 * feedback) and on the server (the authority).
 *
 * Based on Unicode's own guidance for user names (UTS #39 "moderately
 * restrictive" mixing, UAX #31 joiner rules, RFC 8266 nicknames):
 * - Text is NFC-normalised; full-width ASCII becomes plain ASCII; runs of space collapse.
 * - Kept: letters, combining marks (at most 5 per character, so no "zalgo"),
 *   digits, emoji, spaces and a few name punctuation marks.
 * - Removed: control, direction-override and invisible characters (they let a name
 *   pose as another or scramble the text around it), symbols, and look-alike
 *   letters such as 𝐌𝐚𝐭𝐡 𝐛𝐨𝐥𝐝. Zero-width joiners stay only where a script
 *   needs them (Persian, Indic scripts, emoji sequences).
 * - Scripts may not mix in ways that fake another name: one script, or Latin plus
 *   one other script (not Cyrillic or Greek, whose letters copy Latin ones), or the
 *   Japanese, Korean and Chinese combinations.
 * - Length is display width: a CJK character or emoji counts 2, everything else 1,
 *   so a full-width name fits the same space as a Latin one.
 */

import { splitGraphemes } from 'unicode-segmenter/grapheme';

/** Display width limits (a Latin letter is 1, a CJK character 2). */
export const NAME_MIN_WIDTH = 2;
export const NAME_MAX_WIDTH = 24;
const MAX_MARKS = 5;

export type NameError = 'empty' | 'short' | 'mixed_scripts';

export interface NameCheck {
  /** The cleaned name (what would be saved). */
  name: string;
  error?: NameError;
}

export const NAME_ERROR_TEXT: Record<NameError, string> = {
  empty: 'Use at least one letter or number.',
  short: 'That name is too short.',
  mixed_scripts: 'Use one alphabet in a name (Latin can mix with one other, except Cyrillic or Greek).',
};

/** Scripts people write names in today (UAX #31 recommended and limited-use scripts). */
const SCRIPTS = [
  'Latin', 'Cyrillic', 'Greek', 'Armenian', 'Georgian', 'Hebrew', 'Arabic', 'Syriac', 'Thaana', 'Nko', 'Adlam',
  'Tifinagh', 'Ethiopic', 'Vai', 'Bamum', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil',
  'Telugu', 'Kannada', 'Malayalam', 'Sinhala', 'Ol_Chiki', 'Meetei_Mayek', 'Thai', 'Lao', 'Tibetan', 'Myanmar',
  'Khmer', 'Mongolian', 'Javanese', 'Balinese', 'Sundanese', 'Tai_Viet', 'Han', 'Hiragana', 'Katakana', 'Bopomofo',
  'Hangul', 'Yi', 'Lisu', 'Canadian_Aboriginal', 'Cherokee', 'Osage',
  'Hanifi_Rohingya', 'Chakma', 'Lepcha', 'Limbu', 'Tai_Tham', 'Tai_Le', 'New_Tai_Lue', 'Buginese',
  'Batak', 'Cham', 'Kayah_Li', 'Saurashtra', 'Syloti_Nagri', 'Tagalog', 'Hanunoo', 'Buhid', 'Tagbanwa',
  'Rejang', 'Mro', 'Bassa_Vah', 'Mende_Kikakui', 'Warang_Citi', 'Pahawh_Hmong', 'Pau_Cin_Hau',
  'Miao', 'Newa', 'Masaram_Gondi', 'Gunjala_Gondi', 'Makasar', 'Wancho', 'Dives_Akuru', 'Tangsa', 'Toto',
].flatMap((s) => {
  try {
    return [[s, new RegExp(`\\p{Script=${s}}`, 'u')] as const];
  } catch {
    // Older Unicode engines may not know newer scripts. They must still boot.
    return [];
  }
});

/** Letters whose script is "Common" but that belong in names: the kana long-vowel mark and Arabic tatweel. */
const COMMON_LETTERS = new Map([
  ['ー', 'Katakana'],
  ['ｰ', 'Katakana'],
  ['ـ', 'Arabic'],
]);

/** Scripts whose spelling needs ZWJ / ZWNJ between letters. */
const JOINER_SCRIPTS = new Set(['Arabic', 'Syriac', 'Nko', 'Adlam', 'Mongolian', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala', 'Myanmar', 'Khmer', 'Javanese', 'Balinese', 'Tibetan']);

const PUNCTUATION = new Set(["-", "_", ".", "'", '’', '·', '・', '׳', '״', '‧']);
const ZWJ = '‍';
const ZWNJ = '‌';

const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const DIGIT = /\p{Nd}/u;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const EMOJI_PART = /[️⃣\u{1F3FB}-\u{1F3FF}]/u;
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Bopomofo}\p{Script=Hangul}\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}゠-ヿㇰ-ㇿ　-〿]/u;

function scriptOf(ch: string): string | null {
  const common = COMMON_LETTERS.get(ch);
  if (common) return common;
  for (const [name, re] of SCRIPTS) if (re.test(ch)) return name;
  return null;
}

const isEmojiish = (ch: string | undefined) => !!ch && (EMOJI.test(ch) || EMOJI_PART.test(ch));

/** Is `ch` (at position i of chars) a character a name may keep? */
function keep(chars: string[], i: number): boolean {
  const ch = chars[i];
  // Some invisible fillers are letters or marks, so test before those categories.
  // Joiners are handled below; emoji presentation selectors need an emoji base.
  if (ch === '\uFE0E' || ch === '\uFE0F') return isEmojiish(chars[i - 1]) || /[0-9#*]/.test(chars[i - 1] ?? '');
  if (IGNORABLE.test(ch) && ch !== ZWJ && ch !== ZWNJ) return false;
  if (ch === ' ') return true;
  if (PUNCTUATION.has(ch)) return true;
  if (LETTER.test(ch)) return scriptOf(ch) !== null;
  if (MARK.test(ch)) return true;
  if (DIGIT.test(ch)) return /[0-9]/.test(ch) || scriptOf(ch) !== null;
  if (EMOJI.test(ch) || EMOJI_PART.test(ch)) return true;
  if (ch === ZWJ || ch === ZWNJ) {
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (!prev || !next || prev === ZWJ || prev === ZWNJ) return false;
    if (ch === ZWJ && isEmojiish(prev) && EMOJI.test(next)) return true;
    const ps = scriptOf(prev) ?? (MARK.test(prev) ? scriptOf(chars[i - 2] ?? '') : null);
    const ns = scriptOf(next);
    return !!ps && ps === ns && JOINER_SCRIPTS.has(ps);
  }
  return false;
}

// Use one pinned UAX #29 implementation on every phone and server. Intl.Segmenter
// is missing on older phones and its Unicode version varies between runtimes.
const graphemes = splitGraphemes;

/** Width of a name as the game measures it (CJK and emoji 2, others 1 per character). */
export function nameWidth(s: string): number {
  let width = 0;
  for (const g of graphemes(s)) width += WIDE.test(g) && !/[｡-ﾟ]/.test(g) ? 2 : 1;
  return width;
}

/** Clean a name without judging it: safe characters only, normalised, cut to the width limit. */
export function sanitizeName(raw: unknown): string {
  let s = String(raw ?? '').normalize('NFC');
  s = s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[\s\p{Zs}]+/gu, ' ');
  const chars = Array.from(s);
  s = chars.filter((_, i) => keep(chars, i)).join('');
  // A joiner can end up next to a removed character: check again on the result.
  const again = Array.from(s);
  s = again.filter((c, i) => (c !== ZWJ && c !== ZWNJ) || keep(again, i)).join('');
  s = s.replace(/ {2,}/g, ' ').trim();
  let width = 0;
  let out = '';
  for (let g of graphemes(s)) {
    // Orphan marks can attach to surrounding UI or pad a one-letter name.
    if (!/[\p{L}\p{Nd}\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u.test(g)) {
      g = Array.from(g).filter((c) => !MARK.test(c) && !EMOJI_PART.test(c)).join('');
    }
    // A conjunct can contain many letters, each with its own marks. Count per
    // base character, including marks inside precomposed letters, not per cluster.
    let marks = 0;
    g = Array.from(g.normalize('NFD')).filter((c) => {
      if (MARK.test(c)) return ++marks <= MAX_MARKS;
      if (LETTER.test(c) || DIGIT.test(c) || EMOJI.test(c)) marks = 0;
      return true;
    }).join('').normalize('NFC');
    const w = nameWidth(g);
    if (width + w > NAME_MAX_WIDTH) break;
    width += w;
    out += g;
  }
  // Truncation may remove the letter after a spelling joiner.
  const finalChars = Array.from(out.trim().normalize('NFC'));
  return finalChars.filter((c, i) => (c !== ZWJ && c !== ZWNJ) || keep(finalChars, i)).join('');
}

/** The scripts a name's letters and non-ASCII digits use. */
export function nameScripts(s: string): Set<string> {
  const out = new Set<string>();
  for (const ch of s) {
    if ((LETTER.test(ch) || (DIGIT.test(ch) && !/[0-9]/.test(ch)) || MARK.test(ch)) && scriptOf(ch)) out.add(scriptOf(ch)!);
  }
  return out;
}

const CJK_SETS = [
  new Set(['Latin', 'Han', 'Hiragana', 'Katakana']),
  new Set(['Latin', 'Han', 'Bopomofo']),
  new Set(['Latin', 'Han', 'Hangul']),
];
const LATIN_LOOKALIKES = new Set(['Cyrillic', 'Greek', 'Cherokee', 'Osage']);

/** UTS #39 moderately restrictive: may these scripts share one name? */
export function scriptsMayMix(scripts: Set<string>): boolean {
  if (scripts.size <= 1) return true;
  if (CJK_SETS.some((allowed) => [...scripts].every((s) => allowed.has(s)))) return true;
  if (scripts.size === 2 && scripts.has('Latin')) return ![...scripts].some((s) => LATIN_LOOKALIKES.has(s));
  return false;
}

/** Clean a name and say whether it may be used. */
export function checkName(raw: unknown): NameCheck {
  const name = sanitizeName(raw);
  if (!/[\p{L}\p{Nd}]/u.test(name)) return { name, error: 'empty' };
  if (nameWidth(name) < NAME_MIN_WIDTH) return { name, error: 'short' };
  if (!scriptsMayMix(nameScripts(name))) return { name, error: 'mixed_scripts' };
  return { name };
}

/**
 * Wrap a name for use inside a sentence, so a right-to-left name cannot reorder
 * the words or punctuation around it (Unicode first-strong isolate).
 */
export function isolateName(name: string): string {
  return `⁨${name}⁩`;
}
