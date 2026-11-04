/**
 * Player names (roadmap step 59, design in docs/backend/PVP_ROADMAP.md 5.2).
 * One unique name per player, used everywhere and typed to find them, after
 * the classic online-game precedent (Xbox gamertags, PSN ids, RuneScape):
 *
 * - 3–18 characters: Latin letters, digits, single spaces, `_` and `-`;
 *   starts with a letter; no separator at either end and no two in a row.
 * - The same name ignoring case, and with space, `_` and `-` interchangeable:
 *   `Silent Crane`, `silent_crane` and `SILENT-CRANE` are one name.
 *   Digits and letters stay different (`S1lent Crane` is another name).
 * - Reserved words are blocked, and so are their digit look-alikes
 *   (`adm1n`, `kag3mura`, `m0d`), so nobody poses as staff.
 *
 * Pure (shared by the game, for instant hints, and the server, which decides).
 */

export const NAME_MIN = 3;
export const NAME_MAX = 18;
/** One free change per this many days (RuneScape-style). */
export const NAME_CHANGE_DAYS = 28;
/** A released name stays with its previous owner this long. */
export const NAME_HOLD_DAYS = 35;

/** Spaces trimmed and runs of spaces made one (what a player meant to type). */
export function tidyName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Why a name breaks the shape rules, or null. Words and availability are the server's call. */
export function nameShapeProblem(name: string): string | null {
  if (name.length < NAME_MIN) return `A name needs at least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `A name can have at most ${NAME_MAX} characters.`;
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return 'Use only letters, digits, spaces, _ and -.';
  if (!/^[A-Za-z]/.test(name)) return 'A name starts with a letter.';
  if (/[ _-]$/.test(name)) return 'A name cannot end with a space, _ or -.';
  if (/[ _-]{2}/.test(name)) return 'Use one space, _ or - at a time.';
  return null;
}

/** The key that makes a name unique: lower case, every separator the same. */
export function nameKey(name: string): string {
  return tidyName(name).toLowerCase().replace(/[ _-]/g, '_');
}

/** Digits read as the letters they imitate, separators removed (for the reserved-word check only). */
function lookalike(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ _-]/g, '')
    .replace(/0/g, 'o')
    .replace(/[1|]/g, 'i')
    .replace(/l/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g');
}

/** Words only staff and the game itself may use, matched anywhere in a name. */
const RESERVED_ANYWHERE = ['admin', 'kagemura', 'moderator', 'support', 'official', 'staff', 'toadstool'];
/** Short words blocked only as a whole word of the name ("Mod Bob", not "Modest"). */
const RESERVED_WORDS = ['mod', 'gm', 'dev', 'system', 'server', 'ruler'];

const folded = (words: string[]) => words.map(lookalike);
const ANYWHERE = folded(RESERVED_ANYWHERE);
const WORDS = new Set(folded(RESERVED_WORDS));

/** Is the name (or a digit look-alike of it) reserved? */
export function isReservedName(name: string): boolean {
  const whole = lookalike(name);
  if (ANYWHERE.some((w) => whole.includes(w))) return true;
  return tidyName(name)
    .split(/[ _-]+/)
    .some((part) => WORDS.has(lookalike(part)));
}

/** Who may find a player by typing their name. Friend codes always work. */
export type Findable = 'everyone' | 'friends_of_friends' | 'nobody';
export const FINDABLE: readonly Findable[] = ['everyone', 'friends_of_friends', 'nobody'];

/** Friend codes: "KAGE-" and 6 characters without look-alikes (no 0, O, 1, I, L). */
export const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A typed or pasted friend code as stored ("kage 7q4m2k", "7Q4M-2K" → "KAGE-7Q4M2K"), or null. */
export function normalizeFriendCode(raw: unknown): string | null {
  let s = String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (s.startsWith('KAGE')) s = s.slice(4);
  if (s.length !== 6 || [...s].some((c) => !FRIEND_CODE_ALPHABET.includes(c))) return null;
  return `KAGE-${s}`;
}
