/**
 * One unique name per player (roadmap step 59), shared by the game and the
 * server. 3–18 characters: Latin letters, digits, single spaces, `_` and `-`;
 * starts with a letter; no separator at the ends or twice in a row. Case
 * never makes a new name, and a space, `_` and `-` are interchangeable
 * (`nameKey`), but digits and letters stay different, as in classic online
 * games. Names of staff and the game are reserved, including their digit
 * look-alikes (`adm1n`, `kag3mura`). Pure and deterministic.
 */
import type { GameData } from '../types';
import { filterText } from './grove';

export type NameProblem = 'length' | 'characters' | 'start' | 'separators' | 'reserved' | 'filtered';

/** The key a name is unique by: lower case, separators made one. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/[ _-]+/g, '_');
}

/** The letters a name reads as, with digits as their look-alike letters and separators dropped (for the reserved check only). */
function readAs(name: string): string {
  const look: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '2': 'z', '6': 'g' };
  return name
    .toLowerCase()
    .replace(/[ _-]+/g, '')
    .replace(/[0-9]/g, (d) => look[d] ?? d)
    .replace(/l/g, 'i'); // "adml" and "admin" read alike too
}

/** Why a name can't be used, or null when it is fine (it may still be taken). */
export function nameProblem(raw: string, data: GameData): NameProblem | null {
  const r = data.names.playerNameRules;
  const name = raw.trim();
  if (name.length < r.minLength || name.length > r.maxLength) return 'length';
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return 'characters';
  if (!/^[A-Za-z]/.test(name)) return 'start';
  if (/[ _-]{2,}|[ _-]$/.test(name)) return 'separators';
  const read = readAs(name);
  const reserved = (w: string) => readAs(w);
  if (r.reservedWords.some((w) => read.includes(reserved(w))) || r.reservedExact.some((w) => read === reserved(w))) return 'reserved';
  if (filterText(name, data) !== name) return 'filtered';
  return null;
}

export const NAME_PROBLEM_TEXT: Record<NameProblem, string> = {
  length: 'Names are 3 to 18 characters.',
  characters: 'Use letters, digits, spaces, _ and - only.',
  start: 'Start the name with a letter.',
  separators: 'No space, _ or - at the end or twice in a row.',
  reserved: 'That name is kept for the game and its staff.',
  filtered: "That name isn't allowed.",
};

/**
 * Names to offer: built from the data file's name parts (`Midnight Lotus`
 * style), each made to fit the rules, digits added after the first round.
 * `taken` says whether a key is already used.
 */
export function suggestNames(seed: number, data: GameData, taken: (key: string) => boolean, count = 3, base?: string): string[] {
  const out: string[] = [];
  const first = data.names.playerFirst;
  const second = data.names.playerSecond;
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s;
  };
  const tryName = (n: string) => {
    const name = n.trim().slice(0, data.names.playerNameRules.maxLength).trim();
    if (!out.includes(name) && !nameProblem(name, data) && !taken(nameKey(name))) out.push(name);
  };
  if (base && !nameProblem(base, data)) for (let d = 2; d < 100 && out.length < count; d++) tryName(`${base.slice(0, data.names.playerNameRules.maxLength - String(d).length - 1)} ${d}`);
  for (let i = 0; i < 200 && out.length < count; i++) {
    const n = `${first[next() % first.length]} ${second[next() % second.length]}`;
    tryName(i < 50 ? n : `${n.slice(0, 15)} ${(next() % 90) + 10}`);
  }
  return out.slice(0, count);
}

/**
 * Make an existing name fit the rules (migration of names from before step
 * 59): keep it if it fits, shorten a long one at a word boundary, and return
 * null when it can't be kept (the server then picks a suggestion).
 */
export function fitName(raw: string, data: GameData): string | null {
  let name = raw.trim().replace(/\s+/g, ' ').replace(/[^A-Za-z0-9 _-]/g, '');
  const max = data.names.playerNameRules.maxLength;
  if (name.length > max) {
    const cut = name.slice(0, max + 1).lastIndexOf(' ');
    name = (cut >= data.names.playerNameRules.minLength ? name.slice(0, cut) : name.slice(0, max)).trim();
  }
  name = name.replace(/([ _-])[ _-]+/g, '$1').replace(/[ _-]+$/, '');
  return nameProblem(name, data) ? null : name;
}
