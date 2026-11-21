/** Beast Mode 2026-11-21 STB-08: the page-head language script stays small and inlines only an explicit list. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOT_INLINE_KEYS, languageBootScript } from '../../tools/i18n/build.mjs';

const available = JSON.parse(readFileSync('locales/availability.json', 'utf8')) as Record<string, { ready: boolean; boot?: string }>;
const ready = Object.keys(available).filter((c) => available[c].ready);

describe('languageBootScript', () => {
  const script = languageBootScript();

  it('is under 60,000 characters (it held every language and main.ts strings by source line: ~190 KB)', () => {
    expect(script.length).toBeLessThan(60_000);
  });

  it('inlines English only, and only the explicit boot list', () => {
    const tables = JSON.parse(/tables=(\{.*?\}\}),en=/.exec(script)![1]) as Record<string, Record<string, string>>;
    expect(Object.keys(tables)).toEqual(['en']);
    for (const k of Object.keys(tables.en)) expect(BOOT_INLINE_KEYS, k).toContain(k);
    for (const k of ['boot.loading', 'boot.failureTitle', 'boot.retry']) expect(tables.en[k], k).toBeTruthy();
  });

  it('every ready language has a boot file with the loading, failure and retry strings', () => {
    for (const code of ready.filter((c) => c !== 'en')) {
      expect(available[code].boot, code).toMatch(/^lang\/boot-[\w-]+-[0-9a-f]{16}\.json$/);
      const pack = JSON.parse(readFileSync(`locales/compiled/${code}.json`, 'utf8')) as Record<string, string>;
      for (const k of ['boot.loading', 'boot.failureTitle', 'boot.retry']) expect(pack[k], `${code} ${k}`).toBeTruthy();
      expect(script).toContain(available[code].boot!);
    }
  });

  it('every boot string the guard shows is in the list (boot.js matches by English text)', () => {
    const en = JSON.parse(readFileSync('locales/en/boot.json', 'utf8')) as Record<string, string>;
    const guard = readFileSync('src/backend/pwa/boot.js', 'utf8');
    for (const [k, v] of Object.entries(en)) if (guard.includes(v)) expect(BOOT_INLINE_KEYS, k).toContain(k);
  });
});
