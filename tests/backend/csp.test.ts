/** Beast Mode 2026-11-21 SEC-10 (F2): the web game carries a Content-Security-Policy whose hashes match its inline scripts. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cspContent } from '../../tools/release/csp.mjs';

const read = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('SEC-10: Content-Security-Policy', () => {
  it('hashes every inline script and none with a src', () => {
    const html = `<head><script>a()</script><script type="module" src="./x.js"></script></head><body><script>b()</script></body>`;
    const csp = cspContent(html, {});
    expect(csp).toContain(sha('a()'));
    expect(csp).toContain(sha('b()'));
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'none'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('lets the game reach its server and Sentry, and only those', () => {
    const csp = cspContent('', { VITE_SERVER_URL: 'https://api.example.com/', VITE_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/42' });
    expect(csp).toMatch(/connect-src 'self' https:\/\/api\.example\.com https:\/\/o1\.ingest\.sentry\.io /);
    expect(csp).not.toContain('key@');
  });

  it('the build adds it, and no inline event handler remains in index.html or the build plugins', () => {
    const config = read('vite.config.ts');
    expect(config).toMatch(/cspMeta\(\)\]/);
    expect(read('index.html')).not.toMatch(/\son(load|error|click)=/);
    expect(config).not.toMatch(/onload="this\.media/);
  });
});
