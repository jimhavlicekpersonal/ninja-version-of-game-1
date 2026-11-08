import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import hindi from '../../locales/compiled/hi.json';
import availability from '../../locales/availability.json';
import { ENGLISH, format, installCatalog, numberText, sourceText, translate } from '../../locales/runtime';
import { chatText, displayData, initLanguage, useLanguage } from '../../src/presentation/ui/i18n';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { checkLanguage, namespaces, targets, worksheet } from '../../tools/i18n/lib.mjs';
import { deletionPage } from '../../server/accountPage';
import { notificationText } from '../../server/localization';

const hi = targets().find(l => l.code === 'hi')!;
afterEach(() => useLanguage('en'));

describe('the complete Hindi release catalog', () => {
  it('contains every shipping key, passes its checks and is ready', () => {
    expect(checkLanguage(hi)).toMatchObject({ done: checkLanguage(hi).total, errors: [] });
    expect(availability.hi.ready).toBe(true);
    expect(Object.keys(hindi).sort()).toEqual(Object.keys(ENGLISH).sort());
    expect(Object.values(hindi).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('stores nukta letters decomposed (NFC), never as U+0958-U+095F', () => {
    for (const ns of namespaces()) {
      for (const e of Object.values(worksheet('hi', ns)) as { text: string }[]) {
        expect(e.text).toBe(e.text.normalize('NFC'));
        expect(e.text).not.toMatch(/[\u0958-\u095F]/);
      }
    }
  });

  it('is chosen for Hindi devices and uses Hindi plural rules (0 and 1 are "one")', async () => {
    installCatalog('hi', hindi);
    expect(await initLanguage(['hi-IN', 'en-US'])).toBe('hi');
    expect(translate('hud.attack')).toBe('हमला');
    expect(translate('army.queued', { n: 2 })).toBe('2 योद्धा कतार में जोड़े गए।');
    expect(translate('army.queued', { n: 1 })).toBe('1 योद्धा कतार में जोड़ा गया।');
    expect(translate('army.queued', { n: 0 })).toBe('0 योद्धा कतार में जोड़ा गया।');
  });

  it('formats numbers in the Indian grouping with Western digits', () => {
    expect(numberText(1234567, 'hi', true)).toBe('12,34,567');
    expect(sourceText('Not enough resources (needs 1,200,000 Coins and 2,400 Provisions).', 'hi', hindi)).toBe('संसाधन काफ़ी नहीं हैं (12,00,000 सिक्के और 2,400 रसद चाहिए)।');
  });

  it('inserts player parameters literally and keeps authored chat as written', async () => {
    installCatalog('hi', hindi); await useLanguage('hi');
    const name = '$& {n} <沙織> राज़';
    expect(format('{name} · {n, plural, one {# दिन} other {# दिन}}', { name, n: 2 }, 'hi')).toBe(`${name} · 2 दिन`);
    expect(sourceText(`${name} wants to be friends`, 'hi', hindi)).toBe(`${name} आपसे दोस्ती करना चाहते हैं`);
    expect(chatText({ kind: 'chat', text: 'Hello!' })).toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'Hello!', presetId: 0 })).not.toBe('Hello!');
    expect(chatText({ kind: 'chat', text: 'नमस्ते 沙織 👩🏽‍🚀' })).toBe('नमस्ते 沙織 👩🏽‍🚀');
  });

  it('changes the presentation without mutating canonical data or seeded game results', async () => {
    const before = JSON.stringify(defaultData), base = JSON.stringify(generateOpponent(2026, 8, defaultData));
    installCatalog('hi', hindi); await useLanguage('hi');
    expect(displayData(defaultData).buildings.elder_toadstool.name).toBe('कबीले का किला');
    expect(JSON.stringify(defaultData)).toBe(before);
    expect(JSON.stringify(generateOpponent(2026, 8, defaultData))).toBe(base);
  });

  it('ships Hindi public pages, the account form and server notifications', () => {
    for (const page of ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai']) {
      const html = readFileSync(join(__dirname, `../../public/hi/${page}.html`), 'utf8');
      expect(html).toContain('<html lang="hi">');
      expect(html).not.toMatch(/\{t\d+\}/);
      expect(html).not.toContain('not published yet');
      expect(html).toContain('../legal.js');
    }
    const form = deletionPage('hi');
    expect(form).toContain('<html lang="hi">');
    expect(form).not.toContain('err.message;');
    expect(deletionPage('__proto__')).toContain('<html lang="en">');
    expect(notificationText('Your army is ready', 'hi')).toBe('आपकी सेना तैयार है');
  });
});
