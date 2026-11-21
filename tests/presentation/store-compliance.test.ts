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
  // PUB-04 (P7-01, 2026-11-18): empty (the honest "not decided yet") or well formed, read as values (the file's
  // comments use example.com on purpose). The store preflight, not this test, stops a store build with empty facts.
  it('the shared publisher config holds no placeholder: each fact is empty or well formed', async () => {
    const { readLegalConfig, legalValueProblem } = await import('../../tools/release/legal-config.mjs');
    const cfg = readLegalConfig(resolve(root, 'public/legal-config.js'));
    for (const k of ['operator', 'supportEmail', 'deletionUrl', 'termsEffective', 'policyUpdated']) expect(k in cfg, k).toBe(true);
    for (const [k, v] of Object.entries(cfg)) expect(legalValueProblem(k, v), k).toBeNull();
    expect(legalValueProblem('supportEmail', 'support@example.com')).toMatch(/placeholder/);
    expect(legalValueProblem('operator', '<owner name>')).toMatch(/placeholder/);
    expect(legalValueProblem('deletionUrl', 'http://x.test/delete')).toMatch(/https/);
    expect(legalValueProblem('termsEffective', 'soon')).toMatch(/date/);
    expect(existsSync(resolve(root, 'public/legal.js'))).toBe(true);
  });
  it('Settings links all three pages, with build overrides', () => {
    const hud = read('src/presentation/ui/settingsUi.ts');
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
  it('the privacy page names the stable installation id (last gaps 2026-11-14), in English and every ready language', () => {
    const en = read('public/privacy.html');
    expect(en).toContain('random installation id');
    expect(en).toContain('only to prevent abuse');
    expect(en).toContain('The ids kept for your account are deleted with it');
    const pages = JSON.parse(read('locales/en/pages.json')) as Record<string, string>;
    const key = Object.keys(pages).find((k) => k.startsWith('pages.privacy.') && pages[k]!.includes('random installation id'))!;
    const languages = JSON.parse(read('locales/languages.json')) as { code: string }[] | { languages: { code: string }[] };
    const codes = (Array.isArray(languages) ? languages : languages.languages).map((l) => l.code).filter((c) => c !== 'en');
    expect(codes.length).toBe(49);
    for (const code of codes) {
      const ws = JSON.parse(read(`locales/${code}/pages.json`)) as Record<string, { en: string; text: string }>;
      expect(ws[key]!.en, code).toBe(pages[key]);
      expect(ws[key]!.text.length, code).toBeGreaterThan(pages[key]!.length / 3);
    }
    expect(read('docs/store/PRIVACY.md')).toMatch(/Device or other IDs \| FCM push token; the game's random installation id/);
  });
  it('the store docs no longer claim email is never collected or that everything is earnable', () => {
    expect(read('docs/store/LISTING.md')).not.toContain('everything in the game can be earned by playing');
    expect(read('public/privacy.html')).toContain('It is off until you turn it on');
  });
});

describe('the listing names the Season Scroll look as the data has it (P1-02)', () => {
  it("its claims row matches pass.json seasonSkins and the description names no single look", () => {
    const listing = readFileSync(resolve('docs/store/LISTING.md'), 'utf8');
    const pass = JSON.parse(readFileSync(resolve('src/gameplay/data/pass.json'), 'utf8')) as { seasonSkins: string[] };
    const cosmetics = JSON.parse(readFileSync(resolve('src/gameplay/data/cosmetics.json'), 'utf8')) as { hallSkins: { id: string; name: string; passOnly?: boolean }[] };
    const row = listing.split('\n').find((l) => l.startsWith('| A Keep look that changes each season'));
    expect(row).toBeDefined();
    expect(row).toContain(`(${pass.seasonSkins.length} looks`);
    for (const id of pass.seasonSkins) expect(cosmetics.hallSkins.find((s) => s.id === id)?.passOnly).toBe(true);
    const description = listing.split('\n').find((l) => l.startsWith('Kagemura is free to download'))!;
    for (const id of pass.seasonSkins) expect(description).not.toContain(cosmetics.hallSkins.find((s) => s.id === id)!.name);
  });
});

describe('the privacy page date follows its text (PUB-11, P7-08)', () => {
  it("policyUpdated changes whenever the English privacy strings do", async () => {
    const { createHash } = await import('node:crypto');
    const pages = JSON.parse(readFileSync(resolve('locales/en/pages.json'), 'utf8')) as Record<string, string>;
    const text = Object.keys(pages).filter((k) => k.startsWith('pages.privacy.')).sort().map((k) => `${k}=${pages[k]}`).join('\n');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const date = /policyUpdated:\s*'([^']*)'/.exec(readFileSync(resolve('public/legal-config.js'), 'utf8'))?.[1];
    // When the privacy text changes: set policyUpdated to that day in public/legal-config.js and both values here.
    expect({ hash, date }).toEqual({ hash: '818a60cc8d64d2b4', date: '2026-11-14' });
  });
});

describe('Apple age-rating answers match what the game does (C05, P7-04)', () => {
  it('answers Contests Frequent and Age assurance present, with the reasoning beside each', () => {
    const privacy = readFileSync(resolve('docs/store/PRIVACY.md'), 'utf8');
    const row = (q: string) => privacy.split('\n').find((l) => l.startsWith(`| ${q} |`)) ?? '';
    expect(row('Contests')).toMatch(/\*\*Frequent\*\*.*leagues/);
    expect(row('Age assurance')).toMatch(/\*\*Yes \/ present\*\*.*Declared Age Range/);
    expect(row('Parental controls')).toMatch(/\*\*No\*\*/);
  });
});

describe('short landscape battle: the bottom buttons never cover the cards (Beast Mode UX-02)', () => {
  const css = read('src/presentation/ui/styles.css');
  it('Speed and End battle stack in a column no wider than the space left of the cards', () => {
    const block = css.split('@media (max-height: 480px) {').find((b) => b.includes('#battle-hud .b-troops { bottom:'))!;
    const troopsLeft = Number(/#battle-hud \.b-troops \{[^}]*left: calc\((\d+)px/.exec(block)![1]);
    const live = /#battle-hud:not\(\[data-mode='scout'\]\) \.b-bottom \{([^}]*)\}/.exec(block)![1];
    expect(live).toMatch(/flex-direction: column/);
    const width = Number(/width: (\d+)px/.exec(live)![1]);
    // .b-bottom starts 12 px from the left edge (plus the safe area, which .b-troops adds too).
    expect(12 + width).toBeLessThan(troopsLeft);
  });
});

describe('soft launch, device matrix and playtest documents (Beast Mode OPS-11)', () => {
  const doc = (f: string) => readFileSync(`docs/store/${f}`, 'utf8');
  it('SOFT_LAUNCH.md names a kill line for D1 and the crash-free rate, and says statistics are an opt-in sample', () => {
    const s = doc('SOFT_LAUNCH.md');
    expect(s).toMatch(/\| D1 retention \|[^\n]*\*\*D1 < 25%\*\*/);
    expect(s).toMatch(/\| Crash-free users \|[^\n]*\| < 98\.0% \|/);
    expect(s).toMatch(/opt-in/);
    expect(s).toMatch(/never reported/);
  });
  it('DEVICE_MATRIX.md lists a ≤ 2 GB Android device and the cold-start ×50 protocol; PLAYTEST.md is silent', () => {
    const m = doc('DEVICE_MATRIX.md');
    expect(m).toMatch(/≤ 2 GB Android Go/);
    expect(m).toMatch(/Cold start ×50/);
    expect(doc('PLAYTEST.md')).toMatch(/No help, no hints, no answers/);
  });
  it('RELEASE.md and the owner checklist link all three', () => {
    for (const f of ['RELEASE.md', 'OWNER_CHECKLIST.md']) for (const d of ['SOFT_LAUNCH.md', 'DEVICE_MATRIX.md', 'PLAYTEST.md']) expect(doc(f), `${f} -> ${d}`).toContain(d);
  });
});
