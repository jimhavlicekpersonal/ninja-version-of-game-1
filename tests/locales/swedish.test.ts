import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pack from '../../locales/compiled/sv.json';
import availability from '../../locales/availability.json';
import { ENGLISH, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, generatedName, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, targets } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const lang = targets().find(l => l.code === 'sv')!;
afterEach(() => useLanguage('en'));

describe('the complete Swedish release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(lang)).toMatchObject({ done: checkLanguage(lang).total, errors: [] });
    expect(availability['sv'].ready).toBe(true);
    expect(Object.keys(pack).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(pack).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('serves Sweden and Swedish-speaking Finland, with its number formats', async () => {
    installCatalog('sv', pack);
    for (const device of ['sv-SE', 'sv-FI', 'sv-AX', 'sv']) expect(await initLanguage([device, 'en-US'])).toBe('sv');
    expect(translate('hud.attack')).toBe('Anfall');
    // Intl groups Swedish thousands with a no-break space.
    expect(numberText(1234567, 'sv', true)).toBe('1\u00a0234\u00a0567');
    expect(sourceText('Not enough resources (needs 12,000 Coins and 2,400 Provisions).', 'sv', pack)).toBe('Inte tillräckligt med resurser (behövs: 12\u00a0000 Mynt och 2\u00a0400 Proviant).');
    // Northern Sami is not a game language, so a Sami device in Finland that also lists Swedish gets its first completed preference.
    expect(await initLanguage(['se-FI', 'sv-FI'])).toBe('sv');
  });

  it('uses its plural rules: one is only 1', () => {
    expect(new Intl.PluralRules('sv').select(0)).toBe('other');
    expect(translate('stipend.left', { n: 0 }, 'sv', pack)).toBe('0 utbetalningar kvar');
    expect(translate('stipend.left', { n: 1 }, 'sv', pack)).toBe('1 utbetalning kvar');
    expect(translate('stipend.left', { n: 1_000_000 }, 'sv', pack)).toBe('1\u00a0000\u00a0000 utbetalningar kvar');
  });

  it('writes the Swedish letters and quotation marks', () => {
    expect(Object.values(pack).some(text => /[åäö]/.test(text))).toBe(true);
    // Swedish quotes are ” on both sides; the German and English opening quotes are not used.
    for (const [key, text] of Object.entries(pack)) expect(/[„“]/.test(text), key).toBe(false);
  });

  it('builds generated names as compounds with indefinite second parts', async () => {
    installCatalog('sv', pack); await useLanguage('sv');
    expect(generatedName('Thunder Peak')).toBe('Åsktopp');
    expect(generatedName('Iron Gate')).toBe('Järnport');
    expect(generatedName('Midnight Blossom', 'grove')).toBe('Midnattsblom');
  });

  it('attaches no definite ending or genitive s to a placeholder', () => {
    // The definite article and the genitive are endings (byn, tornet, Annas), and en/ett is unknown for a placeholder (GLOSSARY.md).
    const attached = /\{(?:name|arg\d|building|troop|label)\}(?:s|en|et|n|t|na|ens|ets)\b/;
    for (const [key, text] of Object.entries(pack)) expect(attached.test(text), key).toBe(false);
  });

  it('translates owned text, keeps authored chat and leaves canonical data alone', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('sv', pack); await useLanguage('sv');
    const name = '$& {n} <沙織> Zoé';
    expect(sourceText(`${name} wants to be friends`, 'sv', pack)).toBe(`${name} vill bli vän med dig`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).toBe('Hej!');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('Klanborg');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/sv/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="sv">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('sv');
    expect(form).toContain('<html lang="sv">');
    expect(form).not.toContain('err.message;');
    expect(notificationText('Your army is ready', 'sv')).toBe('Din armé är redo');
  });
});
