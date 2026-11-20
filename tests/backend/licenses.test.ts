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
    const server = ['fastify', 'pg'];
    for (const dep of Object.keys(JSON.parse(read('package.json')).dependencies)) {
      if (server.includes(dep)) expect(html, dep).not.toContain(`<section id="${dep}">`);
      else expect(html, dep).toContain(`<section id="${dep}">`);
    }
    // Phaser bundles eventemitter3; the native apps compile in Apache-2.0 libraries (review M2).
    expect(html).toContain('<section id="eventemitter3">');
    expect(html).toContain('Apache License');
    expect(html).toContain('Firebase Cloud Messaging');
    expect(html).toContain('M PLUS 1');
    expect(html).toContain('Dela Gothic One');
    expect(html).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(html).toMatch(/Permission is hereby granted/);
  });

  it('is what the generator writes today', async () => {
    const m = (await import('../../tools/release/licenses.mjs')) as { licencesHtml(): string };
    expect(read('public/licenses.html')).toBe(m.licencesHtml());
  });

  it('the localized support pages link the one licences page (review M1)', () => {
    for (const code of ['de', 'ar', 'ja']) expect(read(`public/${code}/support.html`), code).toContain('href="../licenses.html"');
  });

  it('the support page links it inside its existing footer line', () => {
    expect(read('public/support.html')).toMatch(/<footer[^>]*>[^\n]*href="\.\/licenses\.html"[^\n]*<\/footer>/);
  });
});
