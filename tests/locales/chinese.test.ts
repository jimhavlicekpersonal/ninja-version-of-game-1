import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import chinese from '../../locales/compiled/zh-Hans.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, fmtDecimal, fmtPercent, generatedName, initLanguage, listText, pickLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { formatCompact } from '../../src/presentation/ui/format';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, scriptShare, targets, wrongHanForms } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const zh = targets().find(l => l.code === 'zh-Hans')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Simplified Chinese release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(zh);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability['zh-Hans'].ready).toBe(true);
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(chinese).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('uses Simplified characters only: no Traditional or Japanese forms, no kana', () => {
    for (const [key, text] of Object.entries(chinese)) {
      expect(wrongHanForms(text, 'Hans'), key).toEqual([]);
      expect(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text), key).toBe(false);
    }
    expect(wrongHanForms('戦闘は這個', 'Hans')).toEqual(['戦', '這', '個']);
  });

  it('serves Simplified devices, and never serves Simplified to Traditional devices', async () => {
    installCatalog('zh-Hans', chinese);
    for (const device of ['zh-CN', 'zh-SG', 'zh-MY', 'zh', 'zh-Hans', 'zh-Hans-CN', 'zh-Hans-HK', 'zh_CN']) expect(await initLanguage([device, 'en-US']), device).toBe('zh-Hans');
    // While zh-Hant is not shipped, Taiwan, Hong Kong and Macau devices get their next language.
    const shipped = ['en', 'de', 'zh-Hans'];
    expect(pickLanguage(['zh-TW', 'en-US'], shipped)).toBe('en');
    expect(pickLanguage(['zh-Hant-HK', 'de-DE'], shipped)).toBe('de');
    expect(pickLanguage(['zh-MO'], shipped)).toBe('en');
    expect(pickLanguage(['zh-HK', 'zh-CN'], shipped)).toBe('zh-Hans');
    expect(pickLanguage(['zh-TW'], [...shipped, 'zh-Hant'])).toBe('zh-Hant');
    expect(translate('hud.attack')).toBe('进攻');
  });

  it('formats numbers, lists and compact amounts the Chinese way', async () => {
    installCatalog('zh-Hans', chinese); await useLanguage('zh-Hans');
    expect(numberText(1234567, 'zh-Hans', true)).toBe('1,234,567');
    expect(formatCompact(12345)).toBe('1.2万');
    expect(fmtDecimal(1.25, 2)).toBe('1.25');
    expect(fmtPercent(2.5, 1)).toBe('2.5%');
    expect(listText(['A', 'B', 'C'])).toBe('A、B和C');
    expect(translate('text.period')).toBe('。');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'zh-Hans', chinese)).toBe('资源不足（需要 12,000 金币和2,400 粮草）。');
  });

  it('has only the other plural, with measure words and no English left in counts', () => {
    expect(new Intl.PluralRules('zh-Hans').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'zh-Hans', chinese)).toBe('还剩 0 次发放');
    expect(translate('stipend.left', { n: 1 }, 'zh-Hans', chinese)).toBe('还剩 1 次发放');
    expect(translate('army.readyN', { n: 3 }, 'zh-Hans', chinese)).toBe('可以进攻 · 3 名战士');
    expect(translate('time.hm', { h: 2, m: 5 }, 'zh-Hans', chinese)).toBe('2小时5分');
  });

  it('joins generated names with no space', async () => {
    installCatalog('zh-Hans', chinese); await useLanguage('zh-Hans');
    expect(generatedName('Thunder Peak')).toBe('雷鸣峰');
    expect(generatedName('Iron Gate')).toBe('玄铁门');
    expect(generatedName('Twin Blade', 'grove')).toBe('双生刃');
    expect(generatedName('Midnight Shadow', 'grove')).toBe('午夜影');
    await useLanguage('en');
    expect(generatedName('Thunder Peak')).toBe('Thunder Peak');
  });

  it('writes full-width punctuation in the words, ASCII in the ICU syntax, and no gendered pronoun for a placeholder', () => {
    for (const [key, text] of Object.entries(chinese)) {
      const words = text.replace(/\{[^{}]*\}/g, 'X');
      expect(/\p{Script=Han}[,.:;!?()]|[,;!?(]\p{Script=Han}/u.test(words), key).toBe(false);
      expect(/[，｛｝]/.test(text.match(/\{\s*\w+\s*,\s*(plural|select)\s*,/)?.[0] ?? ''), key).toBe(false);
      expect(/[他她]\{|\{(name|arg\d+)\}[他她]/.test(text), key).toBe(false);
    }
  });

  it('counts a Latin brand inside Chinese as one word in the script check', () => {
    expect(scriptShare(['无法加载 Kagemura'], 'Hans')).toBeGreaterThan(0.7);
    expect(scriptShare(['Kagemura'], 'Latn')).toBe(1);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('zh-Hans', chinese); await useLanguage('zh-Hans');
    const name = '$& {n} <沙織> 小明';
    expect(sourceText(`${name} wants to be friends`, 'zh-Hans', chinese)).toBe(`${name}想加你为好友`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('你好！');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('天守阁');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Chinese with Chinese fonts before the Japanese ones (Han unification)', () => {
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    const rule = /html\[data-script="Hans"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/--font-fallback:\s*'PingFang SC'/);
    expect(rule).not.toMatch(/Hiragino Sans'|Yu Gothic|Noto Sans JP|CJK JP|Meiryo/);
    expect(rule).toContain("'M PLUS 1 Han'");
    const han = /font-family: 'M PLUS 1 Han';[\s\S]*?unicode-range: ([^;]*);/.exec(css)?.[1] ?? '';
    expect(han).not.toContain('U+2000-206F');
    const canvas = readFileSync(join(ROOT, 'src/presentation/render/fonts.ts'), 'utf8');
    expect(canvas).toMatch(/Hans: '"M PLUS 1 Han", "PingFang SC"/);
  });

  it('ships Chinese pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/zh-Hans/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="zh-Hans">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('zh-Hans');
    expect(form).toContain('<html lang="zh-Hans">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'zh-Hans')).toBe('你的军队已就绪');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("'zh-Hans': '尚未公布'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>zh-Hans</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/zh-Hans.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toContain('"zh-Hans",');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-b+zh+Hans/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="zh-Hans" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'zh_Hans')?.displayName).toMatch(/\p{Script=Han}/u);
  });
});
