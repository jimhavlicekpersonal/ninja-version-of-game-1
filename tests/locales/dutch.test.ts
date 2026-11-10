import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/nl.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'nl')!;
afterEach(() => useLanguage('en'));

describe('the complete Dutch release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['nl'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves the Netherlands, Flanders and Suriname, with its number formats', async () => {
    installCatalog('nl', pack);
    for (const device of ['nl-NL', 'nl-BE', 'nl-SR', 'nl']) expect(await initLanguage([device, 'en-US'])).toBe('nl');
    expect(translate('hud.attack')).toBe('Aanvallen');
    expect(numberText(1234567, 'nl', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'nl', pack)).toBe('Niet genoeg grondstoffen (nodig: 12.000 Munten en 2.400 Proviand).');
    // A Belgian device that ranks French first keeps French.
    expect(await initLanguage(['fr-BE', 'nl-BE'])).toBe('fr');
  });

  it('uses its plural rules: one is only 1', () => {
    expect(new Intl.PluralRules('nl').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'nl', pack)).toBe('Nog 0 betalingen');
    expect(translate('stipend.left', { n: 1 }, 'nl', pack)).toBe('Nog 1 betaling');
    expect(translate('stipend.left', { n: 1_000_000 }, 'nl', pack)).toBe('Nog 1.000.000 betalingen');
  });

  it('writes IJ as two letters, and the check refuses the ligature', () => {
    expect(Object.values(pack).some(text => text.includes('IJzer'))).toBe(true);
    for (const [key, text] of Object.entries(pack)) expect(/[Ĳĳ]/u.test(text), key).toBe(false);
    const ws = { 'hud.attack': { en: 'Attack', text: 'ĳzer' } };
    expect(checkWorksheet(lang, 'ui', { 'hud.attack': 'Attack' }, ws).errors.join()).toMatch(/ligature/);
  });

  it('builds generated names as compounds', async () => {
    installCatalog('nl', pack); await useLanguage('nl');
    expect(generatedName('Thunder Peak')).toBe('Donderpiek');
    expect(generatedName('Iron Gate')).toBe('IJzerpoort');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Middernachtbloesem');
  });

  it('never puts an article, adjective ending or genitive s on a name or label', () => {
    // The game knows neither the gender (de/het) nor the spelling of {name}, {building}, {troop} or {label} (GLOSSARY.md).
    const before = /\b(?:de|het|een|deze|dit|die|dat|jouw|mijn)\s+\{(?:name|building|troop|label)\}/i;
    const genitive = /\{(?:name|arg\d|building|troop|label)\}'?s\b/;
    for (const [key, text] of Object.entries(pack)) {
      expect(before.test(text), key).toBe(false);
      expect(genitive.test(text), key).toBe(false);
    }
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('nl', pack); await useLanguage('nl');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'nl', pack)).toBe(`${name} wil vrienden worden`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Hallo!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Clanburcht');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/nl/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="nl">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('nl');
    expect(form).toContain('<html lang="nl">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'nl')).toBe('Je leger is klaar');
  });
});
