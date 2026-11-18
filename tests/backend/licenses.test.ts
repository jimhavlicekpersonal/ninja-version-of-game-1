/**
 * P7-05 (PUB-08): third-party licence notices ship with the game. Every runtime dependency and both bundled fonts are
 * in public/licenses.html with their licence text, the page is current, and the support page links it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('third-party licences (P7-05)', () => {
  it('lists every runtime dependency and both fonts, with the OFL text', () => {
    const html = read('public/licenses.html');
    for (const dep of Object.keys(JSON.parse(read('package.json')).dependencies)) expect(html, dep).toContain(`<section id="${dep}">`);
    expect(html).toContain('M PLUS 1');
    expect(html).toContain('Dela Gothic One');
    expect(html).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(html).toMatch(/Permission is hereby granted/);
  });

  it('is what the generator writes today', async () => {
    const m = (await import('../../tools/release/licenses.mjs')) as { licencesHtml(): string };
    expect(read('public/licenses.html')).toBe(m.licencesHtml());
  });

  it('the support page links it inside its existing footer line', () => {
    expect(read('public/support.html')).toMatch(/<footer[^>]*>[^\n]*href="\.\/licenses\.html"[^\n]*<\/footer>/);
  });
});
