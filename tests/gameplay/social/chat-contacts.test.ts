/** Re-audit: chat removes links, email addresses and phone numbers (UK Online Safety Act gap; scams and grooming). */
import { describe, expect, it } from 'vitest';
import { stripContacts } from '../../../src/gameplay/sim/social/grove';

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
