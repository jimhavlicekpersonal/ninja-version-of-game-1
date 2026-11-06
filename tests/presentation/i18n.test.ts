/**
 * The text layer (report section 5 step 9; compliance L01–L04, art F15, F16).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../locales/en/ui.json';
import languagesFile from '../../locales/languages.json';
import { fmtNumber, formatMessage, initLanguage, pickLanguage, pointLabel, t, useLanguage } from '../../src/presentation/ui/i18n';
import { formatCompact, formatDuration } from '../../src/presentation/ui/format';

const ROOT = join(__dirname, '../..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

afterEach(() => useLanguage('en'));

describe('picking the language (device preference, never the save)', () => {
  it('walks the device list with RFC 4647 lookup, aliases and Chinese scripts', () => {
    const table: [string[], string][] = [
      [['gsw-CH', 'de-CH', 'en'], 'de'],
      [['zh-TW'], 'zh-Hant'],
      [['zh-HK'], 'zh-Hant'],
      [['zh-Hant-TW'], 'zh-Hant'],
      [['zh-CN'], 'zh-Hans'],
      [['zh'], 'zh-Hans'],
      [['pt-BR'], 'pt'],
      [['es-419'], 'es'],
      [['fr-CA'], 'fr'],
      [['iw-IL'], 'he'],
      [['in'], 'id'],
      [['no'], 'nb'],
      [['nn-NO'], 'nb'],
      [['gl-ES'], 'es'],
      [['jv'], 'id'],
      [['xx-YY', 'ja-JP'], 'ja'],
      [['ar-EG'], 'ar'],
      [['sr-Latn'], 'en'],
      [[], 'en'],
    ];
    for (const [device, want] of table) expect(pickLanguage(device), device.join(',')).toBe(want);
  });
});

describe('an untranslated language', () => {
  it('keeps the game in English until its interface is translated (no right-to-left English)', async () => {
    expect(await initLanguage(['ar-EG'])).toBe('en');
    expect(await initLanguage(['en-GB'])).toBe('en');
  });
});

describe('messages', () => {
  it('fall back to English, and to the key when a key is missing', async () => {
    await useLanguage('de');
    expect(t('hud.attack')).toBe('Attack');
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it("use each language's plural rules (one/few/many/other) and its number grouping", async () => {
    const ru = '{n, plural, one {# воин} few {# воина} many {# воинов} other {# воина}}';
    await useLanguage('ru');
    expect([1, 3, 5, 21, 1000].map((n) => formatMessage(ru, { n }))).toEqual(['1 воин', '3 воина', '5 воинов', '21 воин', '1 000 воинов'.replace(' ', ' ')]);
    await useLanguage('en');
    expect(t('army.queued', { n: 1 })).toBe('Queued 1 warrior.');
    expect(t('army.queued', { n: 2500 })).toBe('Queued 2,500 warriors.');
    expect(t('battle.scoutSummary', { points: 1, defenses: 12 })).toBe('1 point · 12 defenses');
  });

  it('formats numbers in the language, always with Western digits', async () => {
    await useLanguage('de');
    expect(fmtNumber(5448274)).toBe('5.448.274');
    await useLanguage('hi');
    expect(fmtNumber(5448274)).toBe('54,48,274');
    await useLanguage('ar');
    expect(fmtNumber(5448274)).toMatch(/^[0-9٬,.  ]+$/);
    await useLanguage('en');
    expect(fmtNumber(5448274)).toBe('5,448,274');
    expect(formatCompact(34_567)).toBe('34K');
    expect(formatCompact(1_500_000)).toBe('1.5M');
    expect(formatDuration(3 * 3600_000 + 40 * 60_000)).toBe('3h 40m');
  });

  it('labels Infiltration Points with numbers outside the Latin script (art F16)', async () => {
    expect(pointLabel('C')).toBe('C');
    await useLanguage('ar');
    expect(pointLabel('C')).toBe('3');
    await useLanguage('ja');
    expect(pointLabel('A')).toBe('1');
  });
});

describe('keys and worksheets', () => {
  const sources = [...walk(join(ROOT, 'src/presentation')), join(ROOT, 'src/main.ts'), join(ROOT, 'src/app.ts')].filter((f) => f.endsWith('.ts'));
  const used = new Set<string>();
  for (const f of sources) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  for (const f of sources) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(`rail\.\$\{label\}`\)/g)) void m;

  it('every key the code uses exists in English (locales/en/ui.json)', () => {
    const missing = [...used].filter((k) => !(k in (en as Record<string, string>)));
    expect(missing).toEqual([]);
  });

  it('every language has a ui worksheet with every English key (npm run i18n:sync)', () => {
    const langs = (languagesFile as { languages: { code: string }[] }).languages.filter((l) => l.code !== 'en');
    for (const l of langs) {
      const ws = JSON.parse(readFileSync(join(ROOT, 'locales', l.code, 'ui.json'), 'utf8')) as Record<string, { en: string }>;
      expect(Object.keys(ws).sort(), l.code).toEqual(Object.keys(en).sort());
    }
  });

  it('no hand-built English plurals: plurals are keyed messages with each language\'s rules (compliance L02)', () => {
    const ui = walk(join(ROOT, 'src/presentation/ui')).filter((f) => f.endsWith('.ts'));
    const count = ui.reduce((n, f) => n + (readFileSync(f, 'utf8').match(/\? 's' : ''|\? '' : 's'/g) ?? []).length, 0);
    expect(count).toBe(0);
  });
});
