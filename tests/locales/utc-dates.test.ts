/** P1-09: a UTC moment the simulation wrote in English is shown in the device language, on every engine. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translate } from '../../locales/runtime';

function pack(code: string): Record<string, string> {
  const sheet = JSON.parse(readFileSync(`locales/${code}/messages.json`, 'utf8')) as Record<string, { text: string }>;
  return Object.fromEntries(Object.entries(sheet).map(([k, v]) => [k, v.text]));
}

describe('event reminder end dates (P1-09)', () => {
  it('reads the simulation fragment without Date.parse and formats it for the language', () => {
    const at = Date.UTC(2026, 10, 21, 0, 0);
    const fragment = new Date(at).toUTCString().slice(0, 22);
    const de = translate('sim.ends_utc_5598bc85ac', { arg1: 'x', arg2: fragment }, 'de', pack('de'));
    expect(de).toContain(new Intl.DateTimeFormat('de', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(at));
    expect(de).not.toContain('Nov');
    const parse = Date.parse;
    try {
      Date.parse = () => NaN; // an engine that refuses the truncated form
      expect(translate('sim.ends_utc_5598bc85ac', { arg1: 'x', arg2: fragment }, 'de', pack('de'))).toBe(de);
    } finally {
      Date.parse = parse;
    }
  });
});
