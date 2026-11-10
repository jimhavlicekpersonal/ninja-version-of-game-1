import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/ro.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'ro')!;
afterEach(() => useLanguage('en'));

describe('the complete Romanian release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['ro'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves its devices, with its number formats', async () => {
    installCatalog('ro', pack);
    for (const device of ['ro-RO', 'ro-MD', 'mo']) expect(await initLanguage([device, 'en-US'])).toBe('ro');
    expect(translate('hud.attack')).toBe('Atac');
    expect(numberText(1234567, 'ro', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'ro', pack)).toBe('Resurse insuficiente (necesar: 12.000 Monede și 2.400 Provizii).');
  });

  it('uses one, few and other, with "de" from 20 up', () => {
    // CLDR: few is 0 and 2-19 (and 101-119), other is 20 and up; other needs "de" (20 de plăți).
    expect([0, 1, 2, 19, 20, 101, 120].map(n => new Intl.PluralRules('ro').select(n))).toEqual(['few', 'one', 'few', 'few', 'other', 'few', 'other']);
    expect(translate('stipend.left', { n: 0 }, 'ro', pack)).toBe('0 plăți rămase');
    expect(translate('stipend.left', { n: 1 }, 'ro', pack)).toBe('1 plată rămasă');
    expect(translate('stipend.left', { n: 19 }, 'ro', pack)).toBe('19 plăți rămase');
    expect(translate('stipend.left', { n: 20 }, 'ro', pack)).toBe('20 de plăți rămase');
    expect(translate('stipend.left', { n: 101 }, 'ro', pack)).toBe('101 plăți rămase');
    // Every plural whose English has a counted noun keeps a few branch next to other.
    for (const [key, text] of Object.entries(pack)) if (/\{\w+, plural,/.test(text) && /\bone \{/.test(text)) expect(text, key).toMatch(/\bfew \{/);
  });

  it('writes comma-below ș ț, and the check refuses the cedilla forms', () => {
    for (const [key, text] of Object.entries(pack)) expect(/[ŞşŢţ]/.test(text), key).toBe(false);
    const ws = { 'hud.attack': { en: 'Attack', text: 'Atacă aşa' } };
    expect(checkWorksheet(lang, 'ui', { 'hud.attack': 'Attack' }, ws).errors.join()).toMatch(/cedilla/);
  });

  it('builds generated names noun-first: articled nouns with genitive or de modifiers', async () => {
    installCatalog('ro', pack); await useLanguage('ro');
    expect(generatedName('Thunder Peak')).toBe('Vârful Tunetului');
    expect(generatedName('Crimson Gorge')).toBe('Defileul de Purpură');
    expect(generatedName('Misty Valley')).toBe('Valea Ceții');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Floarea Miezului Nopții');
  });

  it('never attaches an article or case ending to a name or label', () => {
    // The definite article and the genitive are endings, and "lui" depends on the name (GLOSSARY.md).
    const attached = /\blui\s+\{(?:name|building|troop|label|arg\d+)\}|\}-(?:ul|ului|a|ei|lor)\b/;
    for (const [key, text] of Object.entries(pack)) expect(attached.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('ro', pack); await useLanguage('ro');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'ro', pack)).toBe(`${name} vrea să fiți prieteni`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Salut!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Cetatea Clanului');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/ro/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="ro">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('ro');
    expect(form).toContain('<html lang="ro">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'ro')).toBe('Armata ta e gata');
  });
});
