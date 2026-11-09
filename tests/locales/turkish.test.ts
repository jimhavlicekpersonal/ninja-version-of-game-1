import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/tr.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'tr')!;
afterEach(() => useLanguage('en'));

describe('the complete Turkish release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['tr'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves its devices, with its number formats', async () => {
    installCatalog('tr', pack);
    for (const device of ['tr-TR', 'tr-CY', 'tr']) expect(await initLanguage([device, 'en-US'])).toBe('tr');
    expect(translate('hud.attack')).toBe('Saldır');
    expect(numberText(1234567, 'tr', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'tr', pack)).toBe('Yeterli kaynak yok (gereken: 12.000 Sikke ve 2.400 Erzak).');
  });

  it('keeps the noun singular after a number', () => {
    expect(new Intl.PluralRules('tr').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'tr', pack)).toBe('0 ödeme kaldı');
    expect(translate('stipend.left', { n: 1 }, 'tr', pack)).toBe('1 ödeme kaldı');
    expect(translate('stipend.left', { n: 3 }, 'tr', pack)).toBe('3 ödeme kaldı');
  });

  it('builds generated names as adjective + bare noun', async () => {
    installCatalog('tr', pack); await useLanguage('tr');
    expect(generatedName('Thunder Peak')).toBe('Gürleyen Zirve');
    expect(generatedName('Crimson Gorge')).toBe('Kızıl Boğaz');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Karanlık Çiçek');
  });

  it('never attaches a suffix to a placeholder', () => {
    // The game cannot know the vowel harmony of {name}, {building} or a number (GLOSSARY.md),
    // so no case ending, possessive or apostrophe suffix may follow one. time.* are unit abbreviations.
    const suffixed = /\{[a-zA-Z]\w*\}['’]?\p{L}|#['’]\p{L}/u;
    for (const [key, text] of Object.entries(pack)) if (!key.startsWith('time.')) expect(suffixed.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('tr', pack); await useLanguage('tr');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'tr', pack)).toBe(`Seninle arkadaş olmak istiyor: ${name}`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Merhaba!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Klan Kalesi');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/tr/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="tr">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('tr');
    expect(form).toContain('<html lang="tr">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'tr')).toBe('Ordun hazır');
  });
});
