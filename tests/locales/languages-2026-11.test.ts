import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, translate } from '../../locales/runtime';
import { generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

// The 30 languages translated together on 2026-11-14 (every target except Arabic). One release test for all of
// them instead of one file each; language-specific rules live in the checker (tools/i18n/lib.mjs) and its tests.
const CODES = ['id', 'ms', 'tr', 'ru', 'uk', 'pl', 'cs', 'sk', 'sl', 'hr', 'hu', 'fi', 'el', 'he', 'ur', 'bn', 'or', 'pa', 'mr', 'gu', 'kn', 'ta', 'te', 'ml', 'sw', 'ha', 'yo', 'ig', 'zu', 'am'] as const;
// Languages App Store Connect offers as a product localization (tools/store/storekit.mjs APP_STORE_LOCALES).
const APP_STORE = new Set(['id', 'ms', 'tr', 'ru', 'uk', 'pl', 'cs', 'sk', 'hr', 'hu', 'fi', 'el', 'he']);
const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const json = <T>(p: string) => JSON.parse(read(p)) as T;
const ready = availability as Record<string, { ready: boolean }>;
afterEach(() => useLanguage('en'));

describe.each(CODES)('%s release', code => {
  const lang = targets().find(l => l.code === code)!;
  const pack = json<Record<string, string>>(`locales/compiled/${code}.json`);

  it('is complete, passes its checks and ships every key', () => {
    const result = checkLanguage(lang);
    expect(result).toMatchObject({ done: result.total, errors: [] });
    expect(ready[code].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0 && v === v.normalize('NFC'))).toBe(true);
  });

  it('serves devices set to the language', async () => {
    installCatalog(code, pack);
    const devices = [code, `${code}-XX`, ...(code === 'he' ? ['iw-IL'] : code === 'id' ? ['in-ID'] : [])];
    for (const device of devices) expect(await initLanguage([device, 'en-US']), device).toBe(code);
    await useLanguage(code);
    expect(translate('hud.attack')).toBe(pack['hud.attack']);
    expect(pack['hud.attack']).not.toBe(ENGLISH['hud.attack']);
  });

  it('builds generated names in the order its translator chose', async () => {
    installCatalog(code, pack); await useLanguage(code);
    const first = pack['data.names.placeFirst.0'], second = pack['data.names.placeSecond.0'];
    const english = `${ENGLISH['data.names.placeFirst.0']} ${ENGLISH['data.names.placeSecond.0']}`;
    const tail = second.charAt(0).toLocaleLowerCase(code) + second.slice(1);
    const order = (lang as { generatedNames?: string }).generatedNames ?? '';
    const expected = ({ 'noun-first': `${second} ${first}`, 'noun-first-joined': `${second}${first}`, compound: `${first}${tail}` } as Record<string, string>)[order] ?? `${first} ${second}`;
    expect(generatedName(english)).toBe(expected);
  });

  it('ships its pages, account form, server text, legal fallback and native resources', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = read(`public/${code}/${page}.html`);
      expect(html).toContain(`<html lang="${code}"`);
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage(code);
    expect(form).toContain(`<html lang="${code}"`);
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', code)).not.toBe('Your army is ready');
    expect(read('public/legal.js')).toMatch(new RegExp(`[{ ]${code}: '`));
    expect(read('ios/App/App/Info.plist')).toContain(`<string>${code}</string>`);
    expect(read(`ios/App/App/${code}.lproj/InfoPlist.strings`)).toContain('"CFBundleDisplayName" = "Kagemura";');
    expect(read('ios/App/App.xcodeproj/project.pbxproj')).toContain(`path = ${code}.lproj/InfoPlist.strings;`);
    expect(read(`android/app/src/main/res/values-${code}/strings.xml`)).toContain('Kagemura');
    expect(read('android/app/src/main/res/xml/locales_config.xml')).toContain(`<locale android:name="${code}" />`);
    expect(existsSync(join(ROOT, `docs/store/${code}/LISTING.md`))).toBe(true);
    const storekit = json<{ products: { localizations: { locale: string; displayName: string }[] }[] }>('ios/App/Products.storekit');
    for (const p of storekit.products) expect(Boolean(p.localizations.find(l => l.locale === code)?.displayName)).toBe(APP_STORE.has(code));
  });
});

it('keeps the legacy Android folders for Hebrew and Indonesian', () => {
  for (const legacy of ['iw', 'in']) expect(read(`android/app/src/main/res/values-${legacy}/strings.xml`)).toContain('Kagemura');
});
