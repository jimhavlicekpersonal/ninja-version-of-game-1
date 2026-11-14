/** Re-audit: chat removes links, email addresses and phone numbers (UK Online Safety Act gap; scams and grooming). */
import { describe, expect, it } from 'vitest';
import { filterText, hasContact, stripContacts } from '../../../src/gameplay/sim/social/grove';
import { CONTACT_REMOVED, foldForContact } from '../../../src/gameplay/sim/social/contactFilter';
import { defaultData } from '../../../src/gameplay/sim/data';
import { CONTACT_REMOVED as serverContactRemoved, serverHasContact } from '../../../server/core/contactFilter';

describe('chat contact stripping', () => {
  it('removes links, emails and phone numbers', () => {
    expect(stripContacts('join discord.gg/abc now')).toBe('join [link removed] now');
    expect(stripContacts('visit https://evil.com/x')).toBe('visit [link removed]');
    expect(stripContacts('www.site.ru')).toBe('[link removed]');
    expect(stripContacts('evil dot com')).toBe('[link removed]');
    expect(stripContacts('mail me kid@gmail.com')).toBe('mail me [contact removed]');
    expect(stripContacts('call +1 555 123 4567')).toBe('call [contact removed]');
  });
  it('leaves ordinary game talk alone', () => {
    for (const t of ['need 1500 coins and 300 rice', 'see you at 10.30', 'I have 12 warriors', 'ナイス攻撃！', 'gg wp']) expect(stripContacts(t)).toBe(t);
  });
});

/**
 * 2026-11-14: the server's stronger checks (backend batch 2026-11-13, C25 / UK OSA) are folded into the shared
 * filter (`sim/social/contactFilter.ts`), so the device refuses the same names and replaces the same messages.
 * The cases mirror tests/backend/server/moderation-batch.test.ts.
 */
describe('contacts written around the filter, on the device', () => {
  const dodges = [
    'add me on ｄｉｓｃｏｒｄ',
    'dіscord kage',
    'dis​cord me',
    'find me at kage dot com',
    'kage (dot) gg',
    'mail kage (at) example (dot) com',
    'join t.me/kagemura',
    'wa . me/123',
    'my skype is kage',
    'paypal me 5 dollars',
    'call nine eight seven six five four three two',
    'hxxps://evil.example',
  ];
  it('hasContact finds every one (names are refused) and filterText removes it (the plain kinds in place, the rest by replacing the message)', () => {
    for (const d of dodges) {
      expect(hasContact(d), d).toBe(true);
      expect(filterText(d, defaultData), d).toMatch(/removed/);
    }
    expect(filterText('join t.me/kagemura for free jade', defaultData)).toBe(CONTACT_REMOVED);
    expect(filterText('add me on ｄｉｓｃｏｒｄ', defaultData)).toBe(CONTACT_REMOVED);
  });
  it('ordinary chat and ordinary words that are also app names pass', () => {
    for (const ok of ['attack the left wall first', 'I have 500000 coins', 'good game, see you tomorrow', 'line up the archers', 'signal the attack', "don't. me neither", 'que tal amigo', 'ナイス攻撃！']) {
      expect(filterText(ok, defaultData), ok).toBe(ok);
    }
    for (const name of ['Ann Swift', 'Hidden Leaf', 'Kage', 'Signal Fire']) expect(hasContact(name), name).toBe(false);
    expect(foldForContact('ＤＩＳＣＯＲＤ')).toBe('discord');
  });
  it('the server uses the same implementation', () => {
    for (const d of dodges) expect(serverHasContact(d)).toBe(hasContact(d));
    expect(serverContactRemoved).toBe(CONTACT_REMOVED);
  });
});

/**
 * Second verification 2026-11-14: folding look-alikes turned Cyrillic "Со" into "co", and a sentence ending
 * before it read as a domain, so whole ordinary messages were replaced. A dot with a space beside it now only
 * counts before com/net/org/xyz/biz, and a dot before a word with no Latin letter is a sentence break.
 */
describe('ordinary sentences in many scripts are not read as links', () => {
  const corpus = [
    'Привет. Со мной всё хорошо',
    'Ok. Со временем станет лучше',
    'Привет.Со мной всё хорошо',
    'Я поймал. Сом большой',
    'Добрий день. Со мною все гаразд. Іду в атаку',
    'Γεια. Το πρωί επιτιθέμεθα',
    'Καλημέρα. Κανε επίθεση',
    'Merhaba. Bugün saldıralım. Co-op mu?',
    'مرحبا. سنهاجم في الصباح',
    'नमस्ते. सुबह हमला करेंगे',
    'Halo. Me tunggu di gerbang. Info: serang jam 10',
    'Ok. In the morning',
    'Hi. To be honest',
    'Ok. Me too',
    'Ok. Info here',
    'Bye. Co-op later',
    'Nice. Top raid!',
  ];
  it('passes them whole', () => {
    for (const s of corpus) {
      expect(filterText(s, defaultData), s).toBe(s);
      expect(hasContact(s), s).toBe(false);
    }
  });
  it('still catches look-alike domains and short links', () => {
    for (const d of ['т.ме/kagemura', 'kage.сом', 'kage . сом', 'gооgle.com', 'kage . com', 'kage. net']) expect(filterText(d, defaultData), d).toMatch(/removed/);
  });
});
