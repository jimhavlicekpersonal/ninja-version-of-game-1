import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/vi.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { SYSTEM_FONT_LANGS } from '../../src/presentation/render/fonts';
import { checkLanguage, checkWorksheet, oldStyleTones, targets, vietnameseGendered } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'vi')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Vietnamese release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.vi.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0 && v === v.normalize('NFC'))).toBe(true);
  });

  it('serves Vietnamese devices with Vietnamese number grouping', async () => {
    installCatalog('vi', pack);
    for (const device of ['vi-VN', 'vi', 'vi_VN']) expect(await initLanguage([device, 'en-US']), device).toBe('vi');
    await useLanguage('vi');
    expect(translate('hud.attack')).toBe('Tấn công');
    expect(numberText(1234567, 'vi', true)).toBe(new Intl.NumberFormat('vi').format(1234567));
  });

  it('has only the other plural, with the number before the noun', () => {
    expect(new Intl.PluralRules('vi').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 1 }, 'vi', pack)).toBe('còn 1 lần nhận');
    expect(translate('army.readyN', { n: 3 }, 'vi', pack)).toBe('Sẵn sàng tấn công · 3 chiến binh');
    expect(translate('time.hm', { h: 2, m: 5 }, 'vi', pack)).toBe('2 giờ 5 phút');
  });

  it('uses no kinship pronoun for the player and the new-style tone placement', () => {
    for (const [key, text] of Object.entries(pack)) {
      expect(vietnameseGendered(text), key).toEqual([]);
      expect(oldStyleTones(text), key).toEqual([]);
    }
    expect(vietnameseGendered('Anh ấy đã tấn công')).toEqual(['Anh ấy']);
    expect(oldStyleTones('hoà bình, khoẻ')).toEqual(['oà', 'oẻ']);
    // "quý", "hòa" and "khỏe" are already right.
    expect(oldStyleTones('quý hòa khỏe thủy')).toEqual([]);
    expect(checkWorksheet(lang, 'ui', { a: 'They attacked' }, { a: { en: 'They attacked', text: 'Cô ấy đã tấn công' } }).errors.join()).toMatch(/gender|kinship/);
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('Giải Kage');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('Giải Bóng Tối');
  });

  it('writes generated names noun first with a space', async () => {
    installCatalog('vi', pack); await useLanguage('vi');
    expect(generatedName('Thunder Peak')).toBe('Đỉnh Sấm Sét');
    expect(generatedName('Iron Gate')).toBe('Cổng Sắt');
    expect(generatedName('Twin Blade', 'grove')).toBe('Lưỡi Kiếm Song Sinh');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('vi', pack); await useLanguage('vi');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'vi', pack)).toContain(name);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).not.toBe('Hello!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Thành Gia Tộc');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Vietnamese with the system font, which has its stacked diacritics', () => {
    expect(SYSTEM_FONT_LANGS).toContain('vi');
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    expect(css).toMatch(/html:is\([^)]*\[lang="vi"\][^)]*\)/);
  });

  it('ships Vietnamese pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/vi/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="vi">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('vi');
    expect(form).toContain('<html lang="vi">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'vi')).not.toBe('Your army is ready');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("vi: 'chưa công bố'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>vi</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/vi.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bvi,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-vi/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="vi" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'vi')?.displayName).toBeTruthy();
  });
});
