import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/nb.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'nb')!;
afterEach(() => useLanguage('en'));

describe('the complete Norwegian release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['nb'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Bokmål, Nynorsk and plain Norwegian devices, with its number formats', async () => {
    installCatalog('nb', pack);
    for (const device of ['nb-NO', 'nn-NO', 'no-NO', 'no', 'nb-SJ']) expect(await initLanguage([device, 'en-US'])).toBe('nb');
    expect(translate('hud.attack')).toBe('Angrip');
    // Intl groups Norwegian thousands with a no-break space.
    expect(numberText(1234567, 'nb', true)).toBe('1\u00a0234\u00a0567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'nb', pack)).toBe('Ikke nok ressurser (trenger: 12\u00a0000 Mynter og 2\u00a0400 Proviant).');
  });

  it('uses its plural rules: one is only 1', () => {
    expect(new Intl.PluralRules('nb').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'nb', pack)).toBe('0 utbetalinger igjen');
    expect(translate('stipend.left', { n: 1 }, 'nb', pack)).toBe('1 utbetaling igjen');
    expect(translate('stipend.left', { n: 1_000_000 }, 'nb', pack)).toBe('1\u00a0000\u00a0000 utbetalinger igjen');
  });

  it('writes Norwegian Bokmål, never Danish or Swedish spellings, and the check refuses them', () => {
    expect(Object.values(pack).some(text => /[æøå]/.test(text))).toBe(true);
    const danish = /(?<!\p{L})(?:nu|igen|enhed\p{L}*|købe|køb\p{L}*|efter|hvad|endnu)(?!\p{L})|[äö]/iu;
    for (const [key, text] of Object.entries(pack)) expect(danish.test(text), key).toBe(false);
    const ws = { 'hud.attack': { en: 'Attack', text: 'Prøv igen' } };
    expect(checkWorksheet(lang, 'ui', { 'hud.attack': 'Attack' }, ws).errors.join()).toMatch(/Danish or Swedish spelling/);
  });

  it('builds generated names as compounds with indefinite second parts', async () => {
    installCatalog('nb', pack); await useLanguage('nb');
    expect(generatedName('Thunder Peak')).toBe('Tordentopp');
    expect(generatedName('Iron Gate')).toBe('Jernport');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Midnattsblomst');
  });

  it('attaches no definite ending or genitive s to a placeholder', () => {
    // The definite article and the genitive are endings (byen, tårnet, Annas), and the gender is unknown for a placeholder (GLOSSARY.md).
    const attached = /\{(?:name|arg\d|building|troop|label)\}(?:s|en|et|n|t|na|ens|ets)\b/;
    for (const [key, text] of Object.entries(pack)) expect(attached.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('nb', pack); await useLanguage('nb');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'nb', pack)).toBe(`${name} vil bli venner`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Hei!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Klanborg');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/nb/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="nb">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('nb');
    expect(form).toContain('<html lang="nb">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'nb')).toBe('Hæren din er klar');
  });
});
