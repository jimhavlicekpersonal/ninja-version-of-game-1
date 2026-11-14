import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/ru.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { SYSTEM_FONT_LANGS } from '../../src/presentation/render/fonts';
import { checkLanguage, checkWorksheet, missingPluralForms, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'ru')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Russian release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.ru.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0 && v === v.normalize('NFC'))).toBe(true);
  });

  it('serves Russian devices with Russian number grouping', async () => {
    installCatalog('ru', pack);
    for (const device of ['ru-RU', 'ru', 'ru_KZ']) expect(await initLanguage([device, 'en-US']), device).toBe('ru');
    await useLanguage('ru');
    expect(translate('hud.attack')).toBe('Атака');
    expect(numberText(1234567, 'ru', true)).toBe(new Intl.NumberFormat('ru').format(1234567));
  });

  it('writes one, few and many in every plural', () => {
    const left = (n: number) => translate('stipend.left', { n }, 'ru', pack);
    expect([1, 3, 5, 21].map(left)).toEqual(['Осталась 1 выплата', 'Осталось 3 выплаты', 'Осталось 5 выплат', 'Осталась 21 выплата']);
    expect(translate('army.readyN', { n: 5 }, 'ru', pack)).toBe('Готовы к атаке · 5 воинов');
    expect(translate('time.hm', { h: 2, m: 5 }, 'ru', pack)).toBe('2 ч 5 мин');
    for (const [key, text] of Object.entries(pack)) expect(missingPluralForms('ru', text), key).toEqual([]);
    const en = '{n, plural, one {# warrior} other {# warriors}}';
    expect(checkWorksheet(lang, 'ui', { a: en }, { a: { en, text: '{n, plural, one {# воин} other {# воинов}}' } }).errors.join()).toMatch(/few, many/);
  });

  it('never puts a gendered past tense or short adjective on ты', () => {
    const gendered = /(?<!\p{L})ты\s+(?:уже\s+|ни\s+|не\s+)?\p{L}+(?:л|ла|лся|лась|ен|на|ов|ова)(?!\p{L})/iu;
    const pages = JSON.parse(readFileSync(join(ROOT, 'locales/ru/pages.json'), 'utf8')) as Record<string, { text: string }>;
    for (const [key, text] of [...Object.entries(pack), ...Object.entries(pages).map(([k, v]) => [k, v.text] as const)]) expect(text, key).not.toMatch(gendered);
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('Лига Каге');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('Теневая лига');
  });

  it('writes generated names adjective first, both parts agreeing', async () => {
    installCatalog('ru', pack); await useLanguage('ru');
    expect(generatedName('Thunder Peak')).toBe('Громовой пик');
    expect(generatedName('Iron Gate')).toBe('Железный кордон');
    expect(generatedName('Twin Blade', 'grove')).toBe('Двойной клинок');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('ru', pack); await useLanguage('ru');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'ru', pack)).toContain(name);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).not.toBe('Hello!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Цитадель клана');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Cyrillic with the system fonts, like the other non-Latin scripts', () => {
    // The display fonts are Latin subsets; html[data-script] other than Latn already switches titles to the system font.
    expect(SYSTEM_FONT_LANGS).not.toContain('ru');
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    expect(css).toContain('html[data-script]:not([data-script="Latn"]) { --font-display: var(--font-fallback); }');
  });

  it('ships Russian pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/ru/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="ru">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('ru');
    expect(form).toContain('<html lang="ru">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'ru')).not.toBe('Your army is ready');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("ru: 'ещё не опубликовано'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>ru</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/ru.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bru,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-ru/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="ru" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'ru')?.displayName).toBeTruthy();
  });
});
