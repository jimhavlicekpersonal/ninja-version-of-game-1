import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/da.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'da')!;
afterEach(() => useLanguage('en'));

describe('the complete Danish release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['da'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Denmark, Greenland and the Faroe Islands, with its number formats', async () => {
    installCatalog('da', pack);
    for (const device of ['da-DK', 'da-GL', 'da-FO', 'da']) expect(await initLanguage([device, 'en-US'])).toBe('da');
    expect(translate('hud.attack')).toBe('Angrib');
    expect(numberText(1234567, 'da', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'da', pack)).toBe('Ikke nok ressourcer (kræver: 12.000 Mønter og 2.400 Proviant).');
  });

  it('uses its plural rules: one is only 1', () => {
    expect(new Intl.PluralRules('da').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'da', pack)).toBe('0 udbetalinger tilbage');
    expect(translate('stipend.left', { n: 1 }, 'da', pack)).toBe('1 udbetaling tilbage');
    expect(translate('stipend.left', { n: 1_000_000 }, 'da', pack)).toBe('1.000.000 udbetalinger tilbage');
  });

  it('writes Danish, never Norwegian or Swedish spellings, and the check refuses them', () => {
    expect(Object.values(pack).some(text => /[æøå]/.test(text))).toBe(true);
    const norwegian = /(?<!\p{L})(?:igjen|enhet\p{L}*|kjøp\p{L}*|etter|ennå)(?!\p{L})|[äö]/iu;
    for (const [key, text] of Object.entries(pack)) expect(norwegian.test(text), key).toBe(false);
    const ws = { 'hud.attack': { en: 'Attack', text: 'Prøv igjen' } };
    expect(checkWorksheet(lang, 'ui', { 'hud.attack': 'Attack' }, ws).errors.join()).toMatch(/Norwegian or Swedish spelling/);
  });

  it('builds generated names as compounds with indefinite second parts', async () => {
    installCatalog('da', pack); await useLanguage('da');
    expect(generatedName('Thunder Peak')).toBe('Tordentop');
    expect(generatedName('Iron Gate')).toBe('Jernport');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Midnatsblomst');
  });

  it('attaches no definite ending or genitive s to a placeholder', () => {
    // The definite article and the genitive are endings (byen, tårnet, Annas), and the gender is unknown for a placeholder (GLOSSARY.md).
    const attached = /\{(?:name|arg\d|building|troop|label)\}(?:s|en|et|n|t|na|ens|ets)\b/;
    for (const [key, text] of Object.entries(pack)) expect(attached.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('da', pack); await useLanguage('da');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'da', pack)).toBe(`${name} vil gerne være venner`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Hej!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Klanborg');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/da/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="da">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('da');
    expect(form).toContain('<html lang="da">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'da')).toBe('Din hær er klar');
  });
});
