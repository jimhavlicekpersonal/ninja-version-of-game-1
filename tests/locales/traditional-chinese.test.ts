import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/zh-Hant.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, mainlandTerms, targets, wrongHanForms } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'zh-Hant')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Traditional Chinese release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability['zh-Hant'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Taiwan, Hong Kong and Macau, and keeps mainland devices on Simplified', async () => {
    installCatalog('zh-Hant', pack);
    for (const device of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-TW', 'zh-Hant']) expect(await initLanguage([device, 'en-US']), device).toBe('zh-Hant');
    expect(await initLanguage(['zh-CN', 'en-US'])).toBe('zh-Hans');
    await useLanguage('zh-Hant');
    expect(translate('hud.attack')).toBe('進攻');
    expect(numberText(1234567, 'zh-Hant', true)).toBe('1,234,567');
  });

  it('has only the other plural, with a classifier and the Han spacing rules', () => {
    expect(new Intl.PluralRules('zh-Hant').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 1 }, 'zh-Hant', pack)).toBe('剩餘 1 次發放');
    expect(translate('army.readyN', { n: 3 }, 'zh-Hant', pack)).toBe('準備進攻 · 3 名戰士');
    expect(translate('time.hm', { h: 2, m: 5 }, 'zh-Hant', pack)).toBe('2小時5分');
  });

  it('uses Traditional forms and Taiwanese vocabulary, never 妳 for the player', () => {
    for (const [key, text] of Object.entries(pack)) {
      expect(mainlandTerms(text), key).toEqual([]);
      expect(text, key).not.toContain('妳');
    }
    expect(mainlandTerms('打開設置，檢查網絡')).toEqual(['設置', '網絡']);
    expect(wrongHanForms('天守阁', 'Hant').length).toBeGreaterThan(0);
    expect(checkWorksheet(lang, 'ui', { a: 'Open Settings' }, { a: { en: 'Open Settings', text: '打開設置' } }).errors.join()).toMatch(/mainland/);
    expect(checkWorksheet(lang, 'ui', { a: 'Your turn' }, { a: { en: 'Your turn', text: '輪到妳了' } }).errors.join()).toMatch(/妳/);
    expect(checkWorksheet(lang, 'ui', { a: 'Clan Keep' }, { a: { en: 'Clan Keep', text: '天守阁' } }).errors.join()).toMatch(/Simplified or Japanese/);
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('影級聯賽');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('暗影聯賽');
    expect(pack['hud.settings']).toBe('設定');
  });

  it('joins generated names with no space', async () => {
    installCatalog('zh-Hant', pack); await useLanguage('zh-Hant');
    expect(generatedName('Thunder Peak')).toBe('雷霆峰');
    expect(generatedName('Iron Gate')).toBe('玄鐵門');
    expect(generatedName('Twin Blade', 'grove')).toBe('雙生刃');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('zh-Hant', pack); await useLanguage('zh-Hant');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'zh-Hant', pack)).toContain(name);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toMatch(/\p{Script=Han}/u);
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('天守閣');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Traditional Chinese with Traditional Chinese fonts', () => {
    expect(readFileSync(join(ROOT, 'src/presentation/render/fonts.ts'), 'utf8')).toMatch(/Hant: '[^']*PingFang TC/);
  });

  it('ships Traditional Chinese pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/zh-Hant/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="zh-Hant">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('zh-Hant');
    expect(form).toContain('<html lang="zh-Hant">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'zh-Hant')).toMatch(/軍隊|戰士/);
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("'zh-Hant': '尚未公布'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>zh-Hant</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/zh-Hant.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/"zh-Hant",\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-b+zh+Hant/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="zh-Hant" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) {
      const text = p.localizations.find(l => l.locale === 'zh_Hant')?.displayName ?? '';
      expect(text).toMatch(/\p{Script=Han}/u);
      expect(wrongHanForms(text, 'Hant')).toEqual([]);
    }
  });
});
