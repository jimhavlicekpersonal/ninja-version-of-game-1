import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import japanese from '../../locales/compiled/ja.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, translate } from '../../locales/runtime';
import { chatText, displayData, fmtDecimal, fmtPercent, generatedName, initLanguage, listText, pickLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { formatCompact } from '../../src/presentation/ui/format';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, scriptShare, targets, wrongHanForms } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const ja = targets().find(l => l.code === 'ja')!;
const ROOT = join(__dirname, '../..');
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
afterEach(() => useLanguage('en'));

describe('the complete Japanese release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(ja);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.ja.ready).toBe(true);
    expect(Object.keys(japanese).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(japanese).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('uses Japanese character forms only: no Simplified or Traditional Chinese forms', () => {
    for (const [key, text] of Object.entries(japanese)) expect(wrongHanForms(text, 'Jpan'), key).toEqual([]);
    expect(wrongHanForms('战斗们這圖', 'Jpan')).toEqual(['战', '们', '這', '圖']);
    // Characters Japanese shares with Simplified or Traditional Chinese are not refused.
    expect(wrongHanForms('会員の国、点数、学校、写真、時間、問題、電話、万、宝、名誉', 'Jpan')).toEqual([]);
  });

  it('counts the long-vowel mark and a Latin brand as Japanese text in the script check', () => {
    expect(scriptShare(['リレー'], 'Jpan')).toBe(1);
    expect(scriptShare(['Kagemura を読み込めませんでした'], 'Jpan')).toBeGreaterThan(0.7);
  });

  it('serves Japanese devices', async () => {
    installCatalog('ja', japanese);
    for (const device of ['ja-JP', 'ja', 'ja_JP']) expect(await initLanguage([device, 'en-US']), device).toBe('ja');
    expect(pickLanguage(['ja-JP', 'en-US'], ['en', 'zh-Hans', 'ja'])).toBe('ja');
    expect(pickLanguage(['zh-CN', 'ja-JP'], ['en', 'zh-Hans', 'ja'])).toBe('zh-Hans');
    expect(translate('hud.attack')).toBe('攻撃');
  });

  it('formats numbers, lists and compact amounts the Japanese way', async () => {
    installCatalog('ja', japanese); await useLanguage('ja');
    expect(numberText(1234567, 'ja', true)).toBe('1,234,567');
    expect(formatCompact(12345)).toBe('1.2万');
    expect(fmtDecimal(1.25, 2)).toBe('1.25');
    expect(fmtPercent(2.5, 1)).toBe('2.5%');
    expect(listText(['A', 'B', 'C'])).toBe('A、B、C');
    expect(translate('text.period')).toBe('。');
  });

  it('has only the other plural, with counters and no space before them', () => {
    expect(new Intl.PluralRules('ja').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'ja', japanese)).toBe('残り0回');
    expect(translate('stipend.left', { n: 1 }, 'ja', japanese)).toBe('残り1回');
    expect(translate('army.readyN', { n: 3 }, 'ja', japanese)).toBe('出撃準備完了 · 戦士3人');
    expect(translate('time.hm', { h: 2, m: 5 }, 'ja', japanese)).toBe('2時間5分');
  });

  it('joins generated names with no space', async () => {
    installCatalog('ja', japanese); await useLanguage('ja');
    expect(generatedName('Thunder Peak')).toBe('雷鳴峰');
    expect(generatedName('Iron Gate')).toBe('鉄門');
    expect(generatedName('Twin Blade', 'grove')).toBe('双子刃');
    expect(generatedName('Midnight Shadow', 'grove')).toBe('深夜影');
    await useLanguage('en');
    expect(generatedName('Thunder Peak')).toBe('Thunder Peak');
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(japanese['data.ranks.leagues.kage.name']).toBe('影リーグ');
    expect(japanese['data.ranks.leagues.shadow.name']).toBe('闇リーグ');
  });

  it('writes full-width punctuation, 「」 quotes, ASCII ICU syntax, and no あなた or 彼/彼女 in the game', () => {
    for (const [key, text] of Object.entries(japanese)) {
      const words = text.replace(/\{[^{}]*\}/g, 'X');
      expect(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー][,!?;]|[,;!?(][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(words), key).toBe(false);
      expect(/[“”]/.test(text), key).toBe(false);
      expect(/[，｛｝]/.test(text.match(/\{\s*\w+\s*,\s*(plural|select)\s*,/)?.[0] ?? ''), key).toBe(false);
      expect(/彼女?/.test(text), key).toBe(false);
      if (!key.startsWith('pages.')) expect(/あなた|お前/.test(text), key).toBe(false);
    }
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('ja', japanese); await useLanguage('ja');
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toMatch(JAPANESE);
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('天守閣');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Japanese with Japanese fonts, never the Chinese ones (Han unification)', () => {
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    const rule = /html\[data-script="Jpan"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/--font-fallback:\s*'Hiragino Sans'/);
    expect(rule).not.toMatch(/PingFang|YaHei|JhengHei|CJK SC|CJK TC|Hiragino Sans GB/);
    expect(rule).toContain("'M PLUS 1 Han'");
    const canvas = readFileSync(join(ROOT, 'src/presentation/render/fonts.ts'), 'utf8');
    expect(canvas).toMatch(/Jpan: '"M PLUS 1 Han", "Hiragino Sans"/);
  });

  it('ships Japanese pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/ja/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="ja">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    expect(readFileSync(join(ROOT, 'public/ja/tokushoho.html'), 'utf8')).toContain('特定商取引法に基づく表記');
    const form = deletionPage('ja');
    expect(form).toContain('<html lang="ja">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'ja')).toBe('軍の準備が整いました');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("ja: '未公開'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>ja</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/ja.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bja,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-ja/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="ja" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'ja')?.displayName).toMatch(JAPANESE);
  });
});
