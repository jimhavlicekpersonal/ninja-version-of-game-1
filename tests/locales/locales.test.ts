/**
 * locales/: the 50 languages, the English source and every translator's worksheet
 * (locales/CLAUDE.md). Fails when game text changed without `npm run i18n:extract
 * && npm run i18n:sync`, or when a translation breaks a placeholder or script rule.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, checkLanguage, extractData, formatSource, languages, scriptShare, syncWorksheet, targets } from '../../tools/i18n/lib.mjs';

describe('locales', () => {
  it('ships 50 distinct languages, including every App Store language family and six African ones', () => {
    const { source, languages: all } = languages();
    expect(source).toBe('en');
    expect(all).toHaveLength(50);
    const codes = all.map((l) => l.code);
    expect(new Set(codes).size).toBe(50);
    for (const c of ['en', 'es', 'pt', 'de', 'fr', 'ar', 'ja', 'zh-Hans', 'zh-Hant', 'id', 'sw', 'ha', 'yo', 'am', 'zu', 'ig']) expect(codes).toContain(c);
    for (const l of all) {
      expect(l.dir === 'rtl').toBe(['Arab', 'Hebr'].includes(l.script));
      expect(Intl.getCanonicalLocales(l.code)[0]).toBe(l.code);
    }
    const aliases = all.flatMap((l) => l.alsoFor ?? []);
    expect(aliases.filter((a) => codes.includes(a))).toEqual([]);
  });

  it('the English source matches the game data (run npm run i18n:extract)', () => {
    const onDisk = readFileSync(join(LOCALES, 'en', 'data.json'), 'utf8');
    expect(onDisk).toBe(formatSource(extractData()));
  });

  it('never extracts comments, art notes or the profanity list', () => {
    const keys = Object.keys(extractData());
    expect(keys.length).toBeGreaterThan(500);
    expect(keys.filter((k) => /\$comment|\.look\.|visualStages|profanity/.test(k))).toEqual([]);
  });

  it('every worksheet exists, is in sync and passes its checks', () => {
    const failures: string[] = [];
    for (const lang of targets()) {
      expect(existsSync(join(LOCALES, lang.code, 'data.json')), lang.code).toBe(true);
      const r = checkLanguage(lang);
      for (const e of r.errors) failures.push(`${lang.code}: ${e}`);
    }
    expect(failures).toEqual([]);
  });

  it('sync keeps translations, queues changed English with the old text as a hint, and drops removed keys', () => {
    const ws = { a: { en: 'Attack', text: 'Ataque' }, b: { en: 'Old text', text: 'Texto viejo' }, gone: { en: 'x', text: 'y' } };
    const r = syncWorksheet({ a: 'Attack', b: 'New text', c: 'Fresh' }, ws);
    expect(r.worksheet).toEqual({ a: { en: 'Attack', text: 'Ataque' }, b: { en: 'New text', text: '', old: 'Texto viejo' }, c: { en: 'Fresh', text: '' } });
    expect([r.added, r.changed, r.removed]).toEqual([1, 1, 1]);
  });

  it('the script check tells a real translation from English left in place', () => {
    expect(scriptShare(['忍者の村', '{n}枚のコイン'], 'Jpan')).toBe(1);
    expect(scriptShare(['Collect {n} Coins'], 'Arab')).toBe(0);
    expect(scriptShare(['اجمع {n} عملة'], 'Arab')).toBe(1);
  });
});
