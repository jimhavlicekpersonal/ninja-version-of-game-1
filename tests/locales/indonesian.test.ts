import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/id.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { SYSTEM_FONT_LANGS } from '../../src/presentation/render/fonts';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'id')!;
const ROOT = join(__dirname, '../..');
afterEach(() => useLanguage('en'));

describe('the complete Indonesian release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(availability.id.ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Indonesian devices, the legacy in code and Javanese and Sundanese devices', async () => {
    installCatalog('id', pack);
    for (const device of ['id-ID', 'id', 'in-ID', 'in', 'jv-ID', 'su']) expect(await initLanguage([device, 'en-US']), device).toBe('id');
    await useLanguage('id');
    expect(translate('hud.attack')).toBe('Serang');
    expect(numberText(1234567, 'id', true)).toBe('1.234.567');
  });

  it('has only the other plural, with the noun not doubled after a number', () => {
    expect(new Intl.PluralRules('id').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 1 }, 'id', pack)).toBe('sisa 1 pembayaran');
    expect(translate('army.readyN', { n: 3 }, 'id', pack)).toBe('Siap menyerang · 3 prajurit');
    expect(translate('time.hm', { h: 2, m: 5 }, 'id', pack)).toBe('2j 5m');
  });

  it('addresses the player as kamu, never the formal Anda', () => {
    for (const [key, text] of Object.entries(pack)) expect(text, key).not.toMatch(/(?<!\p{L})Anda(?!\p{L})/u);
    const pages = JSON.parse(readFileSync(join(ROOT, 'locales/id/pages.json'), 'utf8')) as Record<string, { text: string }>;
    for (const [key, { text }] of Object.entries(pages)) expect(text, key).not.toMatch(/(?<!\p{L})Anda(?!\p{L})/u);
  });

  it('keeps Kage League distinct from Shadow League', () => {
    expect(pack['data.ranks.leagues.kage.name']).toBe('Liga Kage');
    expect(pack['data.ranks.leagues.shadow.name']).toBe('Liga Bayangan');
  });

  it('writes generated names noun first with a space', async () => {
    installCatalog('id', pack); await useLanguage('id');
    expect(generatedName('Thunder Peak')).toBe('Puncak Guntur');
    expect(generatedName('Iron Gate')).toBe('Gerbang Besi');
    expect(generatedName('Twin Blade', 'grove')).toBe('Pedang Kembar');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('id', pack); await useLanguage('id');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'id', pack)).toContain(name);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).not.toBe('Hello!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Benteng Klan');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('fits the bundled Latin fonts, so it needs no system-font rule', () => {
    expect(SYSTEM_FONT_LANGS).not.toContain('id');
  });

  it('ships Indonesian pages, the account form, server notifications and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(ROOT, `public/id/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="id">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('id');
    expect(form).toContain('<html lang="id">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'id')).not.toBe('Your army is ready');
    expect(readFileSync(join(ROOT, 'public/legal.js'), 'utf8')).toContain("id: 'belum diterbitkan'");
    expect(readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8')).toContain('<string>id</string>');
    expect(readFileSync(join(ROOT, 'ios/App/App/id.lproj/InfoPlist.strings'), 'utf8')).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toMatch(/\bid,\n/);
    // Android resolves Indonesian resources under the legacy ISO 639 code "in" (as it does iw for Hebrew).
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/values-in/strings.xml'), 'utf8')).toContain('Kagemura');
    expect(readFileSync(join(ROOT, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8')).toContain('<locale android:name="id" />');
    const storekit = JSON.parse(readFileSync(join(ROOT, 'ios/App/Products.storekit'), 'utf8')) as { products: { localizations: { locale: string; displayName: string }[] }[] };
    for (const p of storekit.products) expect(p.localizations.find(l => l.locale === 'id')?.displayName).toBeTruthy();
  });
});
