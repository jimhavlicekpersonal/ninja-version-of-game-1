/**
 * Worldwide audit GLOBAL-014, GLOBAL-015, GLOBAL-019, R06 and R10: what can be checked without a browser.
 * The toolbar fit, real taps, the Settings links and the pages were also checked in Chromium (Playwright) at
 * 320x568, 360x640, 390x844, 568x320 and 844x390; there is no browser in `npm test`, so redo that by hand
 * after changing the bottom bar (see src/presentation/CLAUDE.md).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PREF_DEFAULTS } from '../../src/backend/platform/prefs';
import { buildEnvelope, parseDsn, scrubText } from '../../src/backend/analytics/sentryEnvelope';
import { deletionPage } from '../../server/accountPage';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('bottom toolbar fits narrow phones (GLOBAL-014)', () => {
  const css = read('src/presentation/ui/styles.css');
  const px = (block: string, name: string) => {
    const m = new RegExp(`--${name}:\\s*(\\d+)px`).exec(block);
    return m ? Number(m[1]) : undefined;
  };
  const base = /\.hud-bottom \{\n\s*(--rb:[^\n]*)/.exec(css)![1];
  const narrow = /@media \(max-width: 389px\) \{\s*\.hud-bottom \{([^}]*)\}/.exec(css)![1];
  const narrowest = /@media \(max-width: 345px\) \{\s*\.hud-bottom \{([^}]*)\}/.exec(css)![1];
  const sizes = (...blocks: string[]) => {
    const get = (n: string) => blocks.map((b) => px(b, n)).filter((v) => v !== undefined).pop()!;
    return { rb: get('rb'), big: get('rb-big'), gap: get('rb-gap'), side: get('rb-side') };
  };
  // Three round buttons, Attack and Build at their smallest, the gaps and the side margins.
  const minWidth = (s: ReturnType<typeof sizes>) => 3 * s.rb + 2 * s.gap + s.gap + 2 * s.big + s.gap + 2 * s.side;

  it.each([
    ['390px and wider', [base], 390],
    ['346-389px', [base, narrow], 346],
    ['320-345px', [base, narrow, narrowest], 320],
  ] as const)('every button fits at %s, and none is under 44px', (_label, blocks, width) => {
    const s = sizes(...blocks);
    expect(minWidth(s)).toBeLessThanOrEqual(width);
    expect(Math.min(s.rb, s.big)).toBeGreaterThanOrEqual(44);
  });

  it('long labels wrap inside the button instead of widening the bar', () => {
    expect(css).toMatch(/\.hud-bottom \.round-btn\.big span:last-child \{[^}]*-webkit-line-clamp: 2/);
    expect(css).toMatch(/\.hud-bottom \.round-btn\.big \{[^}]*max-width: var\(--rb-big-max\)/);
  });
});

describe('zoom, touch and motion (R10)', () => {
  it('index.html lets players zoom the page', () => {
    const meta = /<meta name="viewport" content="([^"]+)"/.exec(read('index.html'))![1];
    expect(meta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  });
  it('the map and the battle screen keep pinch for the camera', () => {
    const css = read('src/presentation/ui/styles.css');
    expect(css).toMatch(/#game canvas \{[^}]*touch-action: none/);
    expect(css).toMatch(/#battle-hud \{[^}]*touch-action: none/);
  });
  it('reduced motion stops HUD animations and transitions', () => {
    expect(read('src/presentation/ui/styles.css')).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{[^}]*animation-duration[^}]*transition-duration/);
  });
});

describe('privacy, support and community pages (GLOBAL-015, R06)', () => {
  const pages = ['privacy.html', 'support.html', 'community.html'];
  it.each(pages)('public/%s ships with the build and invents no publisher facts', (p) => {
    const html = read(`public/${p}`);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toContain('./legal-config.js');
    // No draft placeholders such as <email address> or <server>.
    expect(html).not.toMatch(/&lt;(email|server|owner|date)|<(email|server|owner name|date)>/i);
    expect(html).not.toMatch(/@example\.|TODO/);
  });
  it('the shared publisher config is empty until the owner fills it', () => {
    const cfg = read('public/legal-config.js');
    for (const k of ['operator', 'supportEmail', 'deletionUrl']) expect(cfg).toMatch(new RegExp(`${k}: ''`));
    expect(existsSync(resolve(root, 'public/legal.js'))).toBe(true);
  });
  it('Settings links all three pages, with build overrides', () => {
    const hud = read('src/presentation/ui/hud.ts');
    for (const [env, page] of [['VITE_PRIVACY_URL', './privacy.html'], ['VITE_SUPPORT_URL', './support.html'], ['VITE_COMMUNITY_URL', './community.html']]) {
      expect(hud).toContain(`env.${env}, '${page}'`);
    }
    expect(hud).toContain('VITE_SUPPORT_EMAIL');
  });
});

describe('privacy defaults and declarations (GLOBAL-019)', () => {
  it('crash reports are off until the player turns them on', () => {
    expect(PREF_DEFAULTS.crashReports).toBe(false);
  });
  it('the web deletion page asks for no email or other contact', () => {
    const page = deletionPage();
    expect(page).not.toMatch(/name="contact"|autocomplete="email"|email address\)/);
    expect(page).toContain("We don't ask for an email address");
    // The script sends only the three fields it asks for (re-audit: the one-time deletion code proves ownership).
    expect(page).toContain('const body = { playerId: data.playerId, code: data.code, note: data.note };');
  });
  it('error messages lose URL parameters and email-like text before sending', () => {
    expect(scrubText('fetch failed https://api.example.test/v1/me?token=abc#x for ann@example.com')).toBe('fetch failed https://api.example.test/v1/me for [email]');
    const dsn = parseDsn('https://key@o1.ingest.sentry.io/42')!;
    const env = buildEnvelope(dsn, { error: new Error('GET https://h.test/a?b=c failed'), platform: 'javascript', release: 'r', environment: 'web' }, 'e'.repeat(32), 0);
    expect(env).toContain('GET https://h.test/a failed');
    expect(env).not.toContain('b=c');
  });
  it('the store docs no longer claim email is never collected or that everything is earnable', () => {
    expect(read('docs/store/LISTING.md')).not.toContain('everything in the game can be earned by playing');
    expect(read('public/privacy.html')).toContain('It is off until you turn it on');
  });
});
