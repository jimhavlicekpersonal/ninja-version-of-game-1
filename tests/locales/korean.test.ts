import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/ko.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, listText, pickLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { formatCompact } from '../../src/presentation/ui/format';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, koreanParticleAfterPlaceholder, notKoreanRuns, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'ko')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Korean release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.ko.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Korean devices with Korean numbers and lists', async () => {
    installCatalog('ko', pack);
    for (const device of ['ko-KR', 'ko', 'ko_KR']) expect(await initLanguage([device, 'en-US']), device).toBe('ko');
    expect(pickLanguage(['ko-KR', 'ja-JP'], ['en', 'ja', 'ko'])).toBe('ko');
    await useLanguage('ko');
    expect(translate('hud.attack')).toBe('공격');
    expect(numberText(1234567, 'ko', true)).toBe('1,234,567');
    expect(formatCompact(12345)).toBe('1.2만');
    expect(listText(['A', 'B', 'C'])).toBe('A, B 및 C');
  });

  it('has only the other plural, with counters attached to the number', () => {
    expect(new Intl.PluralRules('ko').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 1 }, 'ko', pack)).toBe('남은 지급 1회');
    expect(translate('army.readyN', { n: 3 }, 'ko', pack)).toBe('공격 준비 완료 · 전사 3명');
    expect(translate('time.hm', { h: 2, m: 5 }, 'ko', pack)).toBe('2시간 5분');
  });

  it('never puts a particle that depends on the final sound right after a placeholder', () => {
    // 을/를, 이/가, 은/는, 과/와, 으로/로 follow the last sound of the word before them, which a placeholder cannot tell.
    for (const [key, text] of Object.entries(pack)) expect(koreanParticleAfterPlaceholder(text), key).toBe(false);
    expect(koreanParticleAfterPlaceholder('{name}을 공격')).toBe(true);
    expect(koreanParticleAfterPlaceholder('{n, plural, other {#가}}')).toBe(true);
    expect(koreanParticleAfterPlaceholder('{name}의 마을 · 코인 {n}개를 · {building}을(를) · {n}이상')).toBe(false);
    // A rich-text token that closes written words leaves the particle after known text; an empty pair does not.
    expect(koreanParticleAfterPlaceholder('{t0}커뮤니티 규칙{t1}을 보세요')).toBe(false);
    expect(koreanParticleAfterPlaceholder('{t0}{t1}가 운영합니다')).toBe(true);
    const ws = { a: { en: 'Raid {name}', text: '{name}를 습격' } };
    expect(checkWorksheet(lang, 'ui', { a: 'Raid {name}' }, ws).errors.join()).toMatch(/particle/);
  });

  it('writes Hangul only, except the Japanese titles quoted from the English pages', () => {
    for (const [key, text] of Object.entries(pack)) expect(notKoreanRuns(text, ENGLISH[key]), key).toEqual([]);
    expect(notKoreanRuns('修行 도장')).toEqual(['修行']);
    expect(notKoreanRuns('일본 법정 표시: 特定商取引法に基づく表記', '特定商取引法に基づく表記')).toEqual([]);
  });

  it('addresses nobody as 당신 or 너, and keeps Kage League distinct from Shadow League', () => {
    for (const [key, text] of Object.entries(pack)) expect(/당신|그녀/.test(text), key).toBe(false);
    expect(pack['data.ranks.leagues.kage.name']).toBe('카게 리그');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('그림자 리그');
  });

  it('keeps the default order with a space for generated names', async () => {
    installCatalog('ko', pack); await useLanguage('ko');
    expect(generatedName('Thunder Peak')).toBe('천둥 봉우리');
    expect(generatedName('Iron Gate')).toBe('강철 관문');
    expect(generatedName('Twin Blade', 'grove')).toBe('쌍둥이 칼날');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('ko', pack); await useLanguage('ko');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'ko', pack)).toBe(`${name} 님이 친구가 되고 싶어 해요`);
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'ko', pack)).toBe('자원이 부족해요(필요: 12,000 코인 및 2,400 군량).');
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('안녕하세요!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('가문 본성');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('draws Korean with Korean fonts and breaks lines only at spaces', () => {
    const css = readFileSync(join(ROOT, 'src/presentation/ui/styles.css'), 'utf8');
    const rule = /html\[data-script="Kore"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/--font-fallback:\s*'Apple SD Gothic Neo', 'Malgun Gothic'/);
    expect(rule).not.toMatch(/Hiragino|Yu Gothic|CJK JP|PingFang|YaHei/);
    expect(css).toMatch(/html\[data-script="Kore"\] body \{ word-break: keep-all;/);
    expect(readFileSync(join(ROOT, 'src/presentation/render/fonts.ts'), 'utf8')).toMatch(/Kore: '"Apple SD Gothic Neo", "Malgun Gothic"/);
  });

  it('ships Korean pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/ko/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="ko">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('ko');
    expect(form).toContain('<html lang="ko">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'ko')).toBe('군대가 준비됐어요');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("ko: '미공개'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>ko</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/ko.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bko,\n/);
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-ko/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="ko" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'ko')?.displayName).toMatch(/\p{Script=Hangul}/u);
  });
});
