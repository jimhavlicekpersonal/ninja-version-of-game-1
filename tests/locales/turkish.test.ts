import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/tr.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { SYSTEM_FONT_LANGS } from '../../src/presentation/render/fonts';
import { checkLanguage, checkWorksheet, targets, turkishSuffixAfterPlaceholder } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'tr')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Turkish release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.tr.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0 && v === v.normalize('NFC'))).toBe(true);
  });

  it('serves Turkish devices with Turkish number grouping', async () => {
    installCatalog('tr', pack);
    for (const device of ['tr-TR', 'tr', 'tr_CY']) expect(await initLanguage([device, 'en-US']), device).toBe('tr');
    await useLanguage('tr');
    expect(translate('hud.attack')).toBe('Saldır');
    expect(numberText(1234567, 'tr', true)).toBe('1.234.567');
  });

  it('keeps the noun singular after a number and puts no suffix on a placeholder', () => {
    expect(translate('army.readyN', { n: 3 }, 'tr', pack)).toBe('Saldırıya hazır · 3 savaşçı');
    expect(translate('stipend.left', { n: 1 }, 'tr', pack)).toBe('Kalan ödeme: 1');
    expect(translate('time.hm', { h: 2, m: 5 }, 'tr', pack)).toBe('2sa 5dk');
    for (const [key, text] of Object.entries(pack)) expect(turkishSuffixAfterPlaceholder(text), key).toBe(false);
    expect(turkishSuffixAfterPlaceholder("{name}'in köyü")).toBe(true);
    expect(turkishSuffixAfterPlaceholder('Köy: {name}')).toBe(false);
    expect(checkWorksheet(lang, 'ui', { a: "{name}'s village" }, { a: { en: "{name}'s village", text: "{name}'in köyü" } }).errors.join()).toMatch(/suffix/);
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('Kage Ligi');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('Gölge Ligi');
  });

  it('writes generated names in the default order, adjective first', async () => {
    installCatalog('tr', pack); await useLanguage('tr');
    expect(generatedName('Thunder Peak')).toBe('Gürleyen Zirve');
    expect(generatedName('Iron Gate')).toBe('Demir Kapı');
    expect(generatedName('Twin Blade', 'grove')).toBe('İkiz Kılıç');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('tr', pack); await useLanguage('tr');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'tr', pack)).toContain(name);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).not.toBe('Hello!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Klan Kalesi');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Turkish with the system font, which has ğ ş İ', () => {
    expect(SYSTEM_FONT_LANGS).toContain('tr');
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    expect(css).toMatch(/html:is\([^)]*\[lang="tr"\][^)]*\)/);
  });

  it('ships Turkish pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/tr/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="tr">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('tr');
    expect(form).toContain('<html lang="tr">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'tr')).not.toBe('Your army is ready');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("tr: 'henüz yayımlanmadı'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>tr</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/tr.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\btr,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-tr/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="tr" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'tr')?.displayName).toBeTruthy();
  });
});
