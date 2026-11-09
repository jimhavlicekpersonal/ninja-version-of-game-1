import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import portuguese from '../../locales/compiled/pt.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const pt = targets().find(l => l.code === 'pt')!;
afterEach(() => useLanguage('en'));

describe('the complete Brazilian Portuguese release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(pt)).toMatchObject({ done: checkLanguage(pt).total, errors: [] });
    expect(availability.pt.ready).toBe(true);
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(portuguese).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Brazilian and European Portuguese devices, with Brazilian number formats', async () => {
    installCatalog('pt', portuguese);
    expect(await initLanguage(['pt-BR', 'en-US'])).toBe('pt');
    expect(await initLanguage(['pt-PT', 'en-US'])).toBe('pt');
    expect(translate('hud.attack')).toBe('Atacar');
    expect(numberText(1234567, 'pt', true)).toBe('1.234.567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'pt', portuguese)).toBe('Recursos insuficientes (precisa de 12.000 Moedas e 2.400 Provisões).');
  });

  it('says zero in the plural, as Brazilians do, although CLDR puts 0 in "one"', () => {
    expect(new Intl.PluralRules('pt').select(0)).toBe('one');
    expect(translate('stipend.left', { n: 0 }, 'pt', portuguese)).toBe('Nenhum pagamento restante');
    expect(translate('stipend.left', { n: 1 }, 'pt', portuguese)).toBe('1 pagamento restante');
    expect(translate('stipend.left', { n: 3 }, 'pt', portuguese)).toBe('3 pagamentos restantes');
  });

  it('builds generated names noun-first with invariant modifiers', async () => {
    installCatalog('pt', portuguese); await useLanguage('pt');
    expect(generatedName('Thunder Peak')).toBe('Pico do Trovão');
    expect(generatedName('Crimson Gorge')).toBe('Garganta Carmesim');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Flor da Meia-Noite');
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('pt', portuguese); await useLanguage('pt');
    const name = '$& {n} <沙織> João';
    expect(sourceText(`${name} wants to be friends`, 'pt', portuguese)).toBe(`${name} enviou um pedido de amizade`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Olá!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Fortaleza do Clã');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships Portuguese public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/pt/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="pt">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('pt');
    expect(form).toContain('<html lang="pt">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'pt')).toBe('Seu exército está pronto');
  });
});
