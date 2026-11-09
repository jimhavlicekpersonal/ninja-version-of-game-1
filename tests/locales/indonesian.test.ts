import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/id.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'id')!;
afterEach(() => useLanguage('en'));

describe('the complete Indonesian release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['id'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves its devices, including the legacy "in" tag, Javanese and Sundanese, with its number formats', async () => {
    installCatalog('id', pack);
    for (const device of ['id-ID', 'in-ID', 'jv-ID', 'su-ID']) expect(await initLanguage([device, 'en-US'])).toBe('id');
    expect(translate('hud.attack')).toBe('Serang');
    expect(numberText(1234567, 'id', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'id', pack)).toMatch(/^Sumber daya tidak cukup \(butuh 12\.000 Koin dan 2\.400 Perbekalan\)\.$/);
  });

  it('uses its plural rules (only other, no reduplication after a number)', () => {
    expect(new Intl.PluralRules('id').select(1)).toBe('other');
    expect(translate('stipend.left', { n: 1 }, 'id', pack)).toBe('sisa 1 pembayaran');
    expect(translate('stipend.left', { n: 3 }, 'id', pack)).toBe('sisa 3 pembayaran');
  });

  it('builds generated names noun-first', async () => {
    installCatalog('id', pack); await useLanguage('id');
    expect(generatedName('Thunder Peak')).toBe('Puncak Guntur');
    expect(generatedName('Crimson Gorge')).toBe('Ngarai Merah');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Bunga Tengah Malam');
  });

  it('never attaches a suffix to a placeholder and keeps Benteng for the Keep only', () => {
    for (const [key, text] of Object.entries(pack)) {
      expect(/\}(?:nya|mu|ku)\b/.test(text), key).toBe(false);
      if (/fortress/i.test(ENGLISH[key] ?? '') && !/Keep/.test(ENGLISH[key] ?? '')) expect(/benteng/i.test(text), key).toBe(false);
    }
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('id', pack); await useLanguage('id');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'id', pack)).toBe(`${name} ingin berteman`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Halo!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Benteng Klan');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/id/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="id">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('id');
    expect(form).toContain('<html lang="id">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'id')).toBe('Pasukanmu sudah siap');
  });
});
