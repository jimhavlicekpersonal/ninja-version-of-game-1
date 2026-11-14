import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/ar.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, isRtl, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, easternArabicDigits, missingPluralForms, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { complaintPage } from '../../server/complaintPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'ar')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Arabic release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.ar.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0 && v === v.normalize('NFC'))).toBe(true);
  });

  it('serves Arabic devices right to left, with Western digits', async () => {
    installCatalog('ar', pack);
    for (const device of ['ar-SA', 'ar-EG', 'ar', 'ar_AE']) expect(await initLanguage([device, 'en-US']), device).toBe('ar');
    await useLanguage('ar');
    expect(isRtl()).toBe(true);
    expect(translate('hud.attack')).toBe('هجوم');
    expect(numberText(1234567, 'ar', true)).toMatch(/^[0-9][0-9,.\u066C\u00A0\u202F]*$/u);
    for (const [key, text] of Object.entries(pack)) expect(easternArabicDigits(text), key).toBe(false);
  });

  it('uses all six plural categories, with the right noun form for each count', () => {
    expect([0, 1, 2, 3, 11, 100].map(n => new Intl.PluralRules('ar').select(n))).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
    const ready = (n: number) => translate('army.readyN', { n }, 'ar', pack);
    expect(ready(1)).toBe('الجيش جاهز للهجوم · محارب واحد');
    expect(ready(2)).toBe('الجيش جاهز للهجوم · محاربان');
    expect(ready(3)).toBe('الجيش جاهز للهجوم · 3 محاربين');
    expect(ready(11)).toBe('الجيش جاهز للهجوم · 11 محاربًا');
    expect(ready(100)).toBe('الجيش جاهز للهجوم · 100 محارب');
    for (const [key, text] of Object.entries(pack)) expect(missingPluralForms('ar', text), key).toEqual([]);
    expect(checkWorksheet(lang, 'ui', { a: '{n, plural, one {# warrior} other {# warriors}}' }, { a: { en: '{n, plural, one {# warrior} other {# warriors}}', text: '{n, plural, one {محارب واحد} other {# محارب}}' } }).errors.join()).toMatch(/few, many/);
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('دوري كاغي');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('دوري الظل');
  });

  it('writes generated names noun first, as an idafa', async () => {
    installCatalog('ar', pack); await useLanguage('ar');
    expect(generatedName('Thunder Peak')).toBe('قمة الرعد');
    expect(generatedName('Iron Gate')).toBe('بوابة الحديد');
    expect(generatedName('Twin Blade', 'grove')).toBe('نصل التوائم');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('ar', pack); await useLanguage('ar');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'ar', pack)).toContain(name);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).not.toBe('Hello!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('قلعة العشيرة');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Arabic in the system font without letter-spacing, which would break the joined letters', () => {
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    expect(css).toContain('html[data-script="Arab"] body, html[data-script="Arab"] body * { letter-spacing: normal !important; }');
    expect(css).toMatch(/--font-fallback:[^;]*'Noto Sans Arabic', 'Geeza Pro', 'Segoe UI Arabic'/);
  });

  it('ships right-to-left Arabic pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/ar/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="ar" dir="rtl">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    expect(JSON.parse(readFileSync(join(ROOT, 'public/ar/manifest.webmanifest'), 'utf8'))).toMatchObject({ lang: 'ar', dir: 'rtl' });
    const form = deletionPage('ar');
    expect(form).toContain('<html lang="ar" dir="rtl">');
    expect(form).not.toContain('err.message;');
    expect(complaintPage(undefined, 'ar')).toContain('<html lang="ar" dir="rtl">');
    expect(notificationText('Your army is ready', 'ar')).not.toBe('Your army is ready');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("ar: 'لم يُنشر بعد'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>ar</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/ar.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bar,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-ar/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="ar" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'ar')?.displayName).toBeTruthy();
  });
});
