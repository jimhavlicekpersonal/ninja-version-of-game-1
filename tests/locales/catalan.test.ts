import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/ca.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'ca')!;
afterEach(() => useLanguage('en'));

describe('the complete Catalan release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['ca'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves its devices ahead of Spanish, with its number formats', async () => {
    installCatalog('ca', pack);
    for (const device of ['ca-ES', 'ca-AD', 'ca-ES-valencia', 'ca-FR']) expect(await initLanguage([device, 'es-ES', 'en-US'])).toBe('ca');
    expect(translate('hud.attack')).toBe('Ataca');
    expect(numberText(1234567, 'ca', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'ca', pack)).toBe('No tens prou recursos (calen: 12.000 Monedes i 2.400 Provisions).');
    // A device that prefers Spanish keeps Spanish; Catalan is chosen only where the device ranks it first.
    expect(await initLanguage(['es-ES', 'ca-ES'])).toBe('es');
  });

  it('uses its plural rules', () => {
    expect(new Intl.PluralRules('ca').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'ca', pack)).toBe('Queden 0 pagaments');
    expect(translate('stipend.left', { n: 1 }, 'ca', pack)).toBe('Queda 1 pagament');
    expect(translate('stipend.left', { n: 1_000_000 }, 'ca', pack)).toBe('Queden 1.000.000 pagaments');
  });

  it('writes l·l with the middle dot, and the check refuses the legacy ŀ', () => {
    expect(Object.values(pack).some(text => text.includes('l·l'))).toBe(true);
    for (const [key, text] of Object.entries(pack)) expect(/[ĿŀĽ]/.test(text) || /l\.l/.test(text), key).toBe(false);
    const ws = { 'hud.attack': { en: 'Attack', text: 'coŀlecció' } };
    expect(checkWorksheet(lang, 'ui', { 'hud.attack': 'Attack' }, ws).errors.join()).toMatch(/middle dot/);
  });

  it('builds generated names noun-first with invariant modifiers', async () => {
    installCatalog('ca', pack); await useLanguage('ca');
    expect(generatedName('Thunder Peak')).toBe('Cim del Tro');
    expect(generatedName('Crimson Gorge')).toBe('Gorja Carmesí');
    expect(generatedName('Misty Valley')).toBe('Vall de la Boira');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Flor de Mitjanit');
  });

  it('never puts an article, contraction, elided word or personal article directly before a name or label', () => {
    // The game knows neither the gender nor the first sound of {name}, {building}, {troop} or {label} (GLOSSARY.md).
    const before = /(?:\b(?:el|la|els|les|de|del|dels|al|als|pel|pels|en|na|que|un|una)\s+|\b(?:l|d|n|qu)['’])\{(?:name|building|troop|label)\}/i;
    for (const [key, text] of Object.entries(pack)) expect(before.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('ca', pack); await useLanguage('ca');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'ca', pack)).toBe(`${name} vol que sigueu amics`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Hola!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Fortalesa del Clan');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/ca/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="ca">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('ca');
    expect(form).toContain('<html lang="ca">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'ca')).toBe('El teu exèrcit està llest');
  });
});
