// The language a published page declares (PUB-01): `lang` and `dir` are matched
// separately, so a right-to-left page (`<html lang="ar" dir="rtl">`) passes.
import { readFileSync } from 'node:fs';

const LANGUAGES = JSON.parse(readFileSync(new URL('../../locales/languages.json', import.meta.url), 'utf8')).languages;

/** Why `html` is not a page in `code`, or null when its `<html>` tag declares that language and its direction. */
export function pageLanguageProblem(html, code) {
  const tag = /<html\b([^>]*)>/i.exec(html)?.[1];
  if (tag === undefined) return 'no <html> tag';
  const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];
  if (attr('lang') !== code) return `lang is ${JSON.stringify(attr('lang') ?? null)}, expected ${JSON.stringify(code)}`;
  const want = LANGUAGES.find((l) => l.code === code)?.dir === 'rtl' ? 'rtl' : undefined;
  const dir = attr('dir');
  if (want === 'rtl' && dir !== 'rtl') return 'a right-to-left language without dir="rtl"';
  if (want !== 'rtl' && dir !== undefined && dir !== 'ltr') return `dir is ${JSON.stringify(dir)} on a left-to-right language`;
  return null;
}
