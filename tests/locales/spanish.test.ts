import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import spanish from '../../locales/compiled/es.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, formatMessage, initLanguage, messageText, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, checkWorksheet, targets } from '../../tools/i18n/lib.mjs';
const es = targets().find(l => l.code === 'es')!;
afterEach(() => useLanguage('en'));

describe('the complete Spanish release catalog', () => {
  it('contains every shipping key with no worksheet/source duplication or stale entries', () => {
    expect(checkLanguage(es)).toMatchObject({ done: checkLanguage(es).total, errors: [] });
    expect(availability.es.ready).toBe(true);
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(spanish).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(Object.entries(availability).filter(([,v])=>v.ready).map(([k])=>k).sort()).toEqual(['ca','de','en','es','fr','hi','it','nl','pt','ro','sv','zh-Hans']);
  });
  it('uses the first completed device preference, including Spanish regional tags', async () => {
    installCatalog('es', spanish);
    expect(await initLanguage(['pl-PL','es-MX','en-US'])).toBe('es');
    expect(translate('hud.attack')).toBe('Atacar');
    expect(translate('army.queued', {n:2})).toBe('Se añadieron 2 guerreros a la cola.');
  });
  it('inserts arbitrary player parameters literally and handles nested ICU selectors', async () => {
    installCatalog('es',spanish); await useLanguage('es');
    const name = '$& {n} <沙織> 👩🏽‍🚀';
    expect(formatMessage('Hola, {name}. {n, plural, one {# día} other {# días}}', {name,n:2})).toBe(`Hola, ${name}. 2 días`);
    expect(sourceText(`${name} wants to be friends`,'es',spanish)).toBe(`${name} quiere ser tu amigo`);
    expect(sourceText('Sent 2 Shinobis to 沙織.','es',spanish)).toBe('Se enviaron 2 × Shinobi a 沙織.');
    expect(sourceText('Sent 1 Shinobi to 沙織.','es',spanish)).toBe('Se enviaron 1 × Shinobi a 沙織.');
    expect(sourceText('Could not load products: unknown SDK diagnostic','es',spanish)).toContain('No se pudieron cargar');
    expect(sourceText('Could not load products: unknown SDK diagnostic','es',spanish)).not.toContain('unknown SDK');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).','es',spanish)).toBe('Recursos insuficientes (requiere 12.000 Monedas y 2400 Provisiones).');
    expect(sourceText('You can change your name again on Fri, 06 Nov 2026.','es',spanish)).not.toContain('Fri');
    expect(translate('common.purchasesRecovered', {n:2}, 'es', spanish)).toBe('Tus 2 compras se han entregado.');
  });
  it('changes the presentation without mutating canonical data or seeded game results', async () => {
    const before=JSON.stringify(defaultData), base=JSON.stringify(generateOpponent(2026,8,defaultData));
    installCatalog('es',spanish);await useLanguage('es');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Fortaleza del Clan');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026,8,defaultData))).toBe(base);
    expect(messageText('Friendly duel with 沙織: no warriors were spent and nothing was won.')).toContain('Duelo amistoso con 沙織');
  });
  it('preserves authored Unicode chat while translating marked presets', async () => {
    installCatalog('es', spanish); await useLanguage('es');
    expect(chatText({kind:'chat',text:'Hello!'})).toBe('Hello!');
    expect(chatText({kind:'chat',text:'Hello!',presetId:0})).toBe('¡Hola!');
    expect(chatText({kind:'chat',text:'مرحبا 沙織 👩🏽‍🚀'})).toBe('مرحبا 沙織 👩🏽‍🚀');
  });
  it('rejects missing ICU selector variables and duplicated markup tokens', () => {
    expect(checkWorksheet(es,'ui',{x:'{n, plural, one {One} other {Many}}'},{x:{en:'{n, plural, one {One} other {Many}}',text:'Muchos'}}).errors.join()).toContain('placeholders');
    const source='{t0}Hello{t1}';
    expect(checkWorksheet(es,'pages',{x:source},{x:{en:source,text:'{t0}Hola{t0}{t1}'}}).errors.join()).toContain('rich-text');
  });
  it('ships Spanish public pages and a localized account form, retaining privacy facts and routes', () => {
    for(const page of ['privacy','support','community','terms','tokushoho','shikin-kessai']) {
      const html=readFileSync(join(__dirname,`../../public/es/${page}.html`),'utf8');
      expect(html).toContain('<html lang="es">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
  });
});
