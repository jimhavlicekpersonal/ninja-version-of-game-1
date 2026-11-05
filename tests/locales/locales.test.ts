/**
 * locales/: the 50 languages, the English source and every translator's worksheet
 * (locales/CLAUDE.md). Fails when game text changed without `npm run i18n:extract
 * && npm run i18n:sync`, or when a translation breaks a placeholder or script rule.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, LOCALES, checkLanguage, checkWorksheet, extractData, formatSource, languages, scriptShare, syncWorksheet, targets } from '../../tools/i18n/lib.mjs';

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


describe('translation validation regressions', () => {
  const lang = targets().find((l) => l.code === 'es')!;
  const src = { a: 'Collect {n} Coins' };
  it('rejects malformed entries without throwing or treating them as empty', () => {
    for (const ws of [null, [], { a: null }, { a: 42 }, { a: { en: src.a } }, { a: { en: src.a, text: null } }]) {
      const r = checkWorksheet(lang, 'data', src, ws);
      expect(r.total).toBe(1);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it('checks placeholders, invisible characters and unchanged Latin-script text', () => {
    const check = (text: string) => checkWorksheet(lang, 'data', src, { a: { en: src.a, text } });
    expect(check('Recoge monedas').errors.join()).toContain('placeholders');
    for (const hidden of ['\u0000', '\u034f', '\u1160', '\u202e', '\u2067', '\u200b']) {
      expect(check(`Recoge {n} monedas${hidden}`).errors.join()).toContain('invisible');
    }
    expect(check(src.a).warnings.join()).toContain('identical to English');
    expect(check('Recoge {n} monedas').errors).toEqual([]);
    expect(check('اجمع {n} عملة می‌خواهم').errors).toEqual([]); // ZWNJ can be needed in spelling
  });
  it('rejects unknown language selections instead of reporting a successful check', () => {
    for (const command of ['check', 'next']) {
      const r = spawnSync(process.execPath, ['tools/i18n/i18n.mjs', command, 'not-a-language'], { cwd: ROOT, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Unknown target language');
      expect(r.stdout).not.toContain('All languages complete');
    }
  });
});
