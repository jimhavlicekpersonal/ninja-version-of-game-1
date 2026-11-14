/**
 * How long a HUD toast stays (audit M10): every toast used to last 3 s, so a 170-character error vanished before it
 * could be read. Time grows with the text (about 15 Latin characters a second; a Han, kana or Hangul character carries
 * about as much as three), errors stay at least 5 s, and nothing stays more than 10 s (a tap dismisses it sooner).
 */
export const TOAST_MIN_MS = 3000;
export const TOAST_ERROR_MIN_MS = 5000;
export const TOAST_MAX_MS = 10000;
const PER_CHAR_MS = 65;
const DENSE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Reading weight of a text: code points, with dense-script characters counted three times. */
export function readingLength(text: string): number {
  let n = 0;
  for (const ch of text) n += DENSE.test(ch) ? 3 : 1;
  return n;
}

export function toastMs(text: string, kind: 'info' | 'error' | 'success' = 'info'): number {
  const min = kind === 'error' ? TOAST_ERROR_MIN_MS : TOAST_MIN_MS;
  return Math.round(Math.min(TOAST_MAX_MS, Math.max(min, 1000 + readingLength(text) * PER_CHAR_MS)));
}
