import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/th.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, listFormat, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, dateText, displayData, generatedName, initLanguage, listText, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, thaiGenderedWords, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'th')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Thai release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.th.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Thai devices with Western digits and the Buddhist-era year', async () => {
    installCatalog('th', pack);
    for (const device of ['th-TH', 'th', 'th_TH']) expect(await initLanguage([device, 'en-US']), device).toBe('th');
    await useLanguage('th');
    expect(translate('hud.attack')).toBe('โจมตี');
    expect(numberText(1234567, 'th', true)).toBe('1,234,567');
    expect(dateText(Date.UTC(2026, 10, 10, 12), { year: 'numeric', timeZone: 'UTC' })).toMatch(/2569/);
  });

  it('puts a space between และ/หรือ and a number or Latin word, as Thai spaces numbers', async () => {
    installCatalog('th', pack); await useLanguage('th');
    expect(listFormat(['12,000 เหรียญ', '2,400 เสบียง'], 'th')).toBe('12,000 เหรียญและ 2,400 เสบียง');
    expect(listText(['เหรียญ', 'เสบียง'])).toBe('เหรียญและเสบียง');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'th', pack)).toBe('ทรัพยากรไม่พอ (ต้องใช้ 12,000 เหรียญและ 2,400 เสบียง)');
    expect(listFormat(['A', 'B'], 'en')).toBe('A and B');
  });

  it('has only the other plural, with the classifier after the number', () => {
    expect(new Intl.PluralRules('th').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 1 }, 'th', pack)).toBe('เหลืออีก 1 งวด');
    expect(translate('army.readyN', { n: 3 }, 'th', pack)).toBe('พร้อมโจมตี · นักรบ 3 คน');
    expect(translate('time.hm', { h: 2, m: 5 }, 'th', pack)).toBe('2 ชม. 5 นาที');
  });

  it('uses no gendered particle or pronoun anywhere', () => {
    // ครับ/ผม are a man's speech, ค่ะ/คะ/ดิฉัน a woman's; the game, Sensei Hoshi and bots have no gender.
    for (const [key, text] of Object.entries(pack)) expect(thaiGenderedWords(text), key).toEqual([]);
    expect(thaiGenderedWords('ขอบคุณครับ ผมไปก่อนนะคะ')).toEqual(['ครับ', 'ผม', 'คะ']);
    // คะแนน (score) and ผมวด are not the particle and the pronoun.
    expect(thaiGenderedWords('คะแนน 10')).toEqual([]);
    const ws = { a: { en: 'Thanks!', text: 'ขอบคุณค่ะ!' } };
    expect(checkWorksheet(lang, 'ui', { a: 'Thanks!' }, ws).errors.join()).toMatch(/gender/);
  });

  it('keeps Kage League distinct from Shadow League and writes Thai script', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('ลีกคาเงะ');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('ลีกเงา');
    // No sentence-final full stop in Thai's own text, apart from the period fragment the game appends.
    expect(pack['text.period']).toBe('.');
    expect(pack['hud.settings']).toMatch(/^\p{Script=Thai}+$/u);
  });

  it('writes generated names noun first with no space', async () => {
    installCatalog('th', pack); await useLanguage('th');
    expect(generatedName('Thunder Peak')).toBe('ยอดเขาสายฟ้า');
    expect(generatedName('Iron Gate')).toBe('ประตูเหล็ก');
    expect(generatedName('Twin Blade', 'grove')).toBe('ใบมีดแฝด');
    await useLanguage('en');
    expect(generatedName('Thunder Peak')).toBe('Thunder Peak');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('th', pack); await useLanguage('th');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'th', pack)).toBe(`${name} อยากเป็นเพื่อนกับคุณ`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('สวัสดี!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('ป้อมตระกูล');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Thai with Thai fonts, without letter-spacing or forced word breaks', () => {
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    expect(/html\[data-script="Thai"\]\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/--font-fallback:\s*Thonburi, 'Sukhumvit Set', 'Leelawadee UI'/);
    expect(css).toMatch(/html\[data-script="Thai"\] body, html\[data-script="Thai"\] body \* \{ letter-spacing: normal !important; \}/);
    expect(css).toMatch(/html\[data-script="Thai"\] \.event \{ word-break: normal;/);
    expect(readFileSync(join(ROOT, 'src/presentation/render/fonts.ts'), 'utf8')).toMatch(/Thai: '"Thonburi", "Sukhumvit Set", "Leelawadee UI"/);
  });

  it('ships Thai pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/th/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="th">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('th');
    expect(form).toContain('<html lang="th">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'th')).toBe('กองทัพของคุณพร้อมแล้ว');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("th: 'ยังไม่เผยแพร่'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>th</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/th.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bth,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-th/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="th" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'th')?.displayName).toMatch(/\p{Script=Thai}/u);
  });
});
