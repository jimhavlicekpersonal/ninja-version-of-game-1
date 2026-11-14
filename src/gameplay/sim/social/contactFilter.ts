/**
 * Contacts written around the filter (compliance C25, UK Online Safety Act): the stronger checks the server
 * added in the backend batch 2026-11-13 (`server/core/contactFilter.ts`), folded into the shared filter on
 * 2026-11-14 so the device and the server refuse the same names and replace the same chat messages. It reads
 * a folded copy of the text: compatibility forms (full-width letters), no invisible characters, Cyrillic and
 * Greek look-alikes, accents dropped, "dot"/"(.)" for the dot, "(at)" for @, "hxxp" for http; then looks for
 * links, short links (t.me, wa.me, bit.ly), addresses, more messaging and payment apps and phone numbers
 * spelled out in words. The folded text is only for checking: what players read is never rewritten letter
 * by letter. `grove.ts` (`hasContact`, `filterText`) calls it; the server's module re-exports it.
 */
/**
 * Messaging apps players use to move someone off the game, also when written around a filter ("d1sc0rd",
 * "tele gram", "wh@tsapp"): report section 5 step 7 (compliance C25). Each letter accepts its usual
 * look-alikes and may be split by spaces, dots, dashes or underscores; a handle written after it goes too.
 */
const OFF_GAME_APPS = ['discord', 'telegram', 'whatsapp', 'snapchat', 'instagram', 'insta', 'wechat', 'kik'];
const LOOKALIKE: Record<string, string> = { a: 'a@4', c: 'c(', e: 'e3', g: 'g9', i: 'i1!|l', l: 'l1|i', o: 'o0', s: 's5$', t: 't7+' };
const HANDLE_SEP = '[\\s._*-]*';
const HANDLE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${OFF_GAME_APPS.map((w) => [...w].map((ch) => `[${(LOOKALIKE[ch] ?? ch).replace(/[\]\\^-]/g, '\\$&')}]`).join(HANDLE_SEP)).join('|')})(?![\\p{L}\\p{N}])(?:${HANDLE_SEP}[:@]?${HANDLE_SEP}[\\p{L}\\p{N}_#.]{2,})?`,
  'giu',
);

/**
 * Links, email addresses and phone numbers are removed from chat (re-audit: UK Online Safety Act
 * gap; the usual first step of scams and grooming is moving a player off the game).
 */
export function stripBasicContacts(text: string): string {
  return text
    .replace(/\b(?:https?:\/\/|www\.)\S+/giu, '[link removed]')
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, '[contact removed]')
    .replace(/\b[\p{L}\p{N}-]{2,}\s?(?:\.|\s?dot\s?)\s?(?:com|net|org|io|gg|me|app|xyz|ru|cn|ly|link|site|online|top|info|biz|co)\b(?:\/\S*)?/giu, '[link removed]')
    .replace(/(?:\+?\d[\s().-]?){7,}/gu, '[contact removed]')
    .replace(HANDLE_RE, '[contact removed]');
}

/** Why a name with a contact is refused (the server's own sentence, so the device's refusal reads and translates the same). */
export const CONTACT_NAME_REFUSED = 'Names cannot hold links, phone numbers, addresses or messaging-app handles.';

/** What a chat message becomes when it tries to move someone off the game. */
export const CONTACT_REMOVED = '[message removed: links and contact details are not allowed]';

/** Latin look-alikes from Cyrillic and Greek (the letters used to write "dіscord" past a filter). */
const CONFUSABLE: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ո: 'n', ս: 'u',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
};

/** The text as a filter should read it: compatibility forms, no invisible characters, look-alikes and spelled punctuation folded. */
export function foldForContact(text: string): string {
  let s = text.normalize('NFKC').toLowerCase();
  s = s.replace(/[\p{Cf}͏ᅟᅠㅤﾠ]/gu, ''); // zero-width and other invisible characters
  s = s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC'); // accents written over Latin letters
  s = Array.from(s, (ch) => CONFUSABLE[ch] ?? ch).join('');
  s = s.replace(/h\s*x\s*x\s*p\s*(s?)\s*:\s*\/\s*\//g, 'http$1://');
  s = s.replace(/\s*[([{<]\s*(?:dot|\.|d0t)\s*[)\]}>]\s*/g, '.').replace(/\s+(?:dot|d0t)\s+/g, '.');
  s = s.replace(/\s*[([{<]\s*at\s*[)\]}>]\s*/g, '@');
  return s;
}

const SEP = '[\\s._*·,|/\\\\-]*';
const spaced = (w: string) => [...w].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(SEP);

/**
 * Apps and services used to take a player off the game or to pay outside the store, beyond the shared
 * filter's list. Ordinary words are left out (line, signal, steam): too many false refusals in chat.
 */
const MORE_APPS = ['skype', 'viber', 'kakaotalk', 'kakao', 'facebook', 'tiktok', 'twitter', 'reddit', 'roblox', 'twitch', 'youtube', 'onlyfans', 'paypal', 'cashapp', 'venmo', 'zalo', 'whatsap', 'watsapp', 'telegarm', 'snap chat', 'insta gram', 'discordapp'];
const APP_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MORE_APPS.map((w) => spaced(w.replace(/ /g, ''))).join('|')})(?![\\p{L}])`, 'u');
/** Short links and invite hosts, also with the dot spelled or spaced. */
const SHORT_LINK_RE = /(?<![\p{L}\p{N}'’])(?:t|wa|telegram|discord|dsc|bit|tinyurl|linktr|lnkd|goo|cutt)\s*\.\s*(?:me|gg|ly|ee|in|gl|co|io|com|link)(?:\s*\/\s*[\p{L}\p{N}_+-]+)?/u;
/** A domain after folding ("example dot com" became "example.com"). */
const DOMAIN_RE = /(?<![\p{L}\p{N}])[\p{L}\p{N}-]{2,}\.(?:com|net|org|io|gg|me|app|xyz|ru|cn|ly|link|site|online|top|info|biz|co|tk|ml|ga|cf|gq|ee|to|in|uk|de|br|vn|id|ph|pk|ng|xn--[a-z0-9-]+)(?![\p{L}\p{N}])/u;
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}]{2,}/u;
const URL_RE = /\b(?:https?:\/\/|www\.)/u;
/** Seven or more digits written as words or digits (a phone number read out: "nine eight seven …"). */
const NUMBER_WORDS = 'zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|um|dois|quatro|sete|oito|nove|eins|zwei|drei|vier|funf|sechs|sieben|acht|neun|un|deux|trois|quatre|cinq|sept|huit|neuf';
const SPELLED_PHONE_RE = new RegExp(`(?:(?<![\\p{L}])(?:${NUMBER_WORDS}|\\d)(?![\\p{L}])[\\s.,()+-]*){7,}`, 'u');

/** The stronger patterns on folded text (no digit-run rule: chat may say "1000000 coins"). */
export function strongerMatch(text: string): boolean {
  const f = foldForContact(text);
  return f !== stripBasicContacts(f) || URL_RE.test(f) || EMAIL_RE.test(f) || DOMAIN_RE.test(f) || SHORT_LINK_RE.test(f) || APP_RE.test(f) || SPELLED_PHONE_RE.test(f);
}

/** Does the text, read the way a filter-dodger writes it, carry a way to reach someone off the game (names)? */
export function contactWrittenAround(text: string): boolean {
  const f = foldForContact(text);
  return f !== stripBasicContacts(f) || /\p{N}{6,}/u.test(f.replace(/[\s.()-]/g, '')) || strongerMatch(text);
}

/**
 * A chat message after the shared filter: kept when the stronger check finds nothing, otherwise the whole
 * message is replaced (a partly rewritten message would still show the parts a filter-dodger relies on).
 */
export function enforceChat(filtered: string): { text: string; removed: boolean } {
  return strongerMatch(filtered) ? { text: CONTACT_REMOVED, removed: true } : { text: filtered, removed: false };
}
