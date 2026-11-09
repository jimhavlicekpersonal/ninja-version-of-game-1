import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import german from '../../locales/compiled/de.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, fmtDecimal, fmtPercent, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const de = targets().find(l => l.code === 'de')!;
afterEach(() => useLanguage('en'));

describe('the complete German release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(de)).toMatchObject({ done: checkLanguage(de).total, errors: [] });
    expect(availability.de.ready).toBe(true);
    expect(Object.keys(german).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(german).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves German, Austrian, Swiss and Luxembourg devices, with German number formats', async () => {
    installCatalog('de', german);
    for (const device of ['de-DE', 'de-AT', 'de-CH', 'gsw-CH', 'lb-LU']) expect(await initLanguage([device, 'en-US'])).toBe('de');
    expect(translate('hud.attack')).toBe('Angriff');
    expect(numberText(1234567, 'de', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'de', german)).toBe('Nicht genug Ressourcen (benötigt 12.000 Münzen und 2.400 Proviant).');
    expect(fmtDecimal(1.25, 2)).toBe('1,25');
    expect(fmtPercent(2.5, 1)).toBe('2,5 %');
  });

  it('uses German plural rules: one is only 1, and 0 takes the plural', () => {
    expect(new Intl.PluralRules('de').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'de', german)).toBe('0 Zahlungen übrig');
    expect(translate('stipend.left', { n: 1 }, 'de', german)).toBe('1 Zahlung übrig');
    expect(translate('stipend.left', { n: 3 }, 'de', german)).toBe('3 Zahlungen übrig');
  });

  it('writes generated names as one compound word', async () => {
    installCatalog('de', german); await useLanguage('de');
    expect(generatedName('Thunder Peak')).toBe('Donnergipfel');
    expect(generatedName('Iron Gate')).toBe('Eisentor');
    expect(generatedName('Twin Blade', 'grove')).toBe('Zwillingsklinge');
    expect(generatedName('Midnight Shadow', 'grove')).toBe('Nachtschatten');
    // English and the noun-first languages are unchanged.
    await useLanguage('en');
    expect(generatedName('Thunder Peak')).toBe('Thunder Peak');
  });

  it('never puts an article, possessive or genitive s directly before a name or label', () => {
    // The game does not know the gender of {name}, {building} or {troop}, nor of the player (GLOSSARY.md).
    const before = /\b(der|die|das|dem|den|des|ein|eine|einen|einem|einer|dein|deine|deinen|deinem|deiner|mein|meine)\s+\{(name|building|troop|label)\}/i;
    const genitive = /\{(name|building|troop|label|arg\d+)\}s\b/;
    for (const [key, text] of Object.entries(german)) {
      expect(before.test(text), key).toBe(false);
      expect(genitive.test(text), key).toBe(false);
    }
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('de', german); await useLanguage('de');
    const name = '$& {n} <沙織> Jürgen';
    expect(sourceText(`${name} wants to be friends`, 'de', german)).toBe(`${name} möchte mit dir befreundet sein`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Hallo!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Clanburg');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships German public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/de/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="de">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('de');
    expect(form).toContain('<html lang="de">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'de')).toBe('Deine Armee ist bereit');
  });
});
