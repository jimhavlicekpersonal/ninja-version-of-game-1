import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/it.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'it')!;
afterEach(() => useLanguage('en'));

describe('the complete Italian release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['it'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves its devices, with its number formats', async () => {
    installCatalog('it', pack);
    for (const device of ['it-IT', 'it-CH', 'it-SM']) expect(await initLanguage([device, 'en-US'])).toBe('it');
    expect(translate('hud.attack')).toBe('Attacca');
    expect(numberText(1234567, 'it', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'it', pack)).toBe('Risorse insufficienti (servono 12.000 Monete e 2400 Provviste).');
  });

  it('uses its plural rules', () => {
    expect(new Intl.PluralRules('it').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'it', pack)).toBe('0 pagamenti rimasti');
    expect(translate('stipend.left', { n: 1 }, 'it', pack)).toBe('1 pagamento rimasto');
    expect(translate('stipend.left', { n: 3 }, 'it', pack)).toBe('3 pagamenti rimasti');
  });

  it('builds generated names noun-first with invariant modifiers', async () => {
    installCatalog('it', pack); await useLanguage('it');
    expect(generatedName('Thunder Peak')).toBe('Picco del Tuono');
    expect(generatedName('Crimson Gorge')).toBe('Gola Cremisi');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Fiore di Mezzanotte');
  });

  it('never puts an article, contraction or elided word directly before a name or label', () => {
    // The game knows neither the gender nor the first sound of {name}, {building} or {troop} (GLOSSARY.md).
    const before = /(?:\b(?:il|lo|la|i|gli|le|di|del|dello|della|dei|degli|delle|al|allo|alla|ai|agli|alle|nel|nello|nella|un|uno|una)\s+|\b(?:l|dell|all|nell|un)['’])\{(?:name|building|troop|label)\}/i;
    for (const [key, text] of Object.entries(pack)) expect(before.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('it', pack); await useLanguage('it');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'it', pack)).toBe(`${name} ti ha inviato una richiesta di amicizia`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Ciao!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Rocca del Clan');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/it/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="it">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('it');
    expect(form).toContain('<html lang="it">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'it')).toBe('Il tuo esercito è pronto');
  });
});
