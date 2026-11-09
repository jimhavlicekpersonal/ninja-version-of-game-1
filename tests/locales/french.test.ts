import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/fr.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'fr')!;
afterEach(() => useLanguage('en'));

describe('the complete French release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['fr'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves its devices, with its number formats', async () => {
    installCatalog('fr', pack);
    for (const device of ['fr-FR', 'fr-CA', 'fr-BE', 'fr-CH', 'fr-SN']) expect(await initLanguage([device, 'en-US'])).toBe('fr');
    expect(translate('hud.attack')).toBe('Attaquer');
    expect(numberText(1234567, 'fr', true)).toBe('1 234 567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'fr', pack)).toBe('Ressources insuffisantes (il faut 12 000 Pièces et 2 400 Provisions).');
  });

  it('uses its plural rules', () => {
    expect(new Intl.PluralRules('fr').select(0)).toBe('one');
    expect(translate('stipend.left', { n: 0 }, 'fr', pack)).toBe('0 versement restant');
    expect(translate('stipend.left', { n: 1 }, 'fr', pack)).toBe('1 versement restant');
    expect(translate('stipend.left', { n: 3 }, 'fr', pack)).toBe('3 versements restants');
  });

  it('builds generated names noun-first with invariant modifiers', async () => {
    installCatalog('fr', pack); await useLanguage('fr');
    expect(generatedName('Thunder Peak')).toBe('Pic du Tonnerre');
    expect(generatedName('Crimson Gorge')).toBe('Gorge Pourpre');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Fleur de Minuit');
  });

  it('never puts an article, contraction or elided word directly before a name or label', () => {
    // The game knows neither the gender nor the first sound of {name}, {building} or {troop} (GLOSSARY.md).
    const before = /(?:\b(?:le|la|les|de|du|des|que)\s+|\b[dlq]['’])\{(?:name|building|troop|label)\}/i;
    for (const [key, text] of Object.entries(pack)) expect(before.test(text), key).toBe(false);
  });

  it('uses French no-break spaces between words only, never at the edge of a string', () => {
    expect(translate('battle.victory', {}, 'fr', pack)).toBe('Victoire\u202f!');
    expect(translate('ui.message_463d2c3dd0', { arg1: 'x' }, 'fr', pack)).toBe(': x');
    for (const [key, text] of Object.entries(pack)) {
      expect(/^[\u00a0\u202f]|[\u00a0\u202f]$/.test(text), key).toBe(false);
      expect(/[^\s\u00a0\u202f][;!?]/.test(text.replace(/\{[^}]*\}/g, '').replace(/https?:\S+/g, '').replace(/\?\w+=/g, '')), key).toBe(false);
    }
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('fr', pack); await useLanguage('fr');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'fr', pack)).toBe(`${name} t'envoie une demande d'ami`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Bonjour !');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Donjon du Clan');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/fr/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="fr">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('fr');
    expect(form).toContain('<html lang="fr">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'fr')).toBe('Ton armée est prête');
  });
});
