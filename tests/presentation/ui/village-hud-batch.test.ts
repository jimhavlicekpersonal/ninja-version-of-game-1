/**
 * GUI batch 2026-11-13, village side: toast time (audit M10), the age question coming back rarely (economy E02), the
 * warrior unlock ceremony (retention G22), News and messages (G17), dialog exit motion (art F10), relative type and tap
 * targets (R10, M8), script fallbacks and right-to-left rules, link previews and shortcuts (G23), the complaints
 * route on the support page (UK OSA). Layout itself was measured in Chromium (docs/store/WORLDWIDE_AUDIT.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOAST_ERROR_MIN_MS, TOAST_MAX_MS, TOAST_MIN_MS, readingLength, toastMs } from '../../../src/presentation/ui/toastTime';
import { AGE_ASK_GAP_DAYS, AGE_ASK_MAX, parseAskRecord, shouldAskAge } from '../../../src/presentation/ui/askAgain';
import { newUnlocks } from '../../../src/presentation/ui/unlockCeremony';
import { noticeKey, unseenNews } from '../../../src/presentation/ui/newsUi';
import en from '../../../locales/en/ui.json';
import enPages from '../../../locales/en/pages.json';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const css = read('src/presentation/ui/styles.css');
const hud = read('src/presentation/ui/hud.ts');
const DAY = 86_400_000;

describe('toasts stay long enough to read (audit M10)', () => {
  it('short ones keep the old 3 s, long ones grow, errors stay longer, nothing stays forever', () => {
    expect(toastMs('Saved')).toBe(TOAST_MIN_MS);
    const long = 'x'.repeat(170);
    expect(toastMs(long)).toBeGreaterThan(9000);
    expect(toastMs('Oops', 'error')).toBe(TOAST_ERROR_MIN_MS);
    expect(toastMs('y'.repeat(5000), 'error')).toBe(TOAST_MAX_MS);
  });
  it('counts a Han, kana or Hangul character as three Latin ones', () => {
    expect(readingLength('資源が足りません')).toBe(24);
    expect(readingLength('abc')).toBe(3);
  });
  it('the HUD uses it and a tap dismisses', () => {
    expect(hud).toContain('toastMs(shown, kind)');
    expect(hud).toMatch(/el\.addEventListener\('click', dismiss\)/);
  });
});

describe('the age question after "Not now" (economy E02)', () => {
  const now = 1_800_000_000_000;
  it('asks the first time, then only after a few days, at most a few times', () => {
    expect(shouldAskAge(null, now)).toBe(true);
    expect(shouldAskAge({ count: 1, last: now - (AGE_ASK_GAP_DAYS - 1) * DAY }, now)).toBe(false);
    expect(shouldAskAge({ count: 1, last: now - AGE_ASK_GAP_DAYS * DAY }, now)).toBe(true);
    expect(shouldAskAge({ count: AGE_ASK_MAX, last: 0 }, now)).toBe(false);
  });
  it('treats the old one-time flag as asked just now (no burst of questions after the update)', () => {
    expect(parseAskRecord('1', now)).toEqual({ count: 1, last: now });
    expect(shouldAskAge(parseAskRecord('1', now), now)).toBe(false);
    expect(parseAskRecord('{"count":2,"last":5}', now)).toEqual({ count: 2, last: 5 });
    expect(parseAskRecord('garbage', now)).toEqual({ count: 1, last: now });
  });
  it('never asks over a dialog or a battle, and nothing is offered meanwhile', () => {
    expect(hud).toMatch(/askAgeAfterTutorial[\s\S]*battle-hud'\)\?\.hidden === false\) return void window\.setTimeout/);
    // Offers still need an adult answer (sim/offers.ts offersAllowed); the HUD never sets an age by itself.
    expect(read('src/gameplay/sim/offers.ts')).toMatch(/under18 === false && \(state\.profile\.ageBand \?\? 'adult'\) === 'adult'/);
  });
});

describe('warrior unlock ceremony (retention G22)', () => {
  it('fires only for warriors that became trainable, never on the first look', () => {
    expect(newUnlocks(null, ['ninja', 'saboteur'])).toEqual([]);
    expect(newUnlocks(['ninja'], ['ninja', 'saboteur'])).toEqual(['saboteur']);
    expect(newUnlocks(['ninja', 'saboteur'], ['ninja', 'saboteur'])).toEqual([]);
  });
  it('is skippable, brief and still under reduced motion', () => {
    const src = read('src/presentation/ui/unlockCeremony.ts');
    expect(src).toMatch(/card\.addEventListener\('click', \(\) => close\(\)\)/);
    expect(src).toMatch(/CEREMONY_MS = \d{4}/);
    expect(src).toContain('reducedMotion()');
  });
});

describe('News and messages (retention G17) and leaderboards from the HUD (G15)', () => {
  it('counts only unread moderator notices and a new operators notice', () => {
    const notices = [{ id: 'a', at: 1, kind: 'account', text: 'x', read: false }, { id: 'b', at: 1, kind: 'account', text: 'y', read: true }];
    expect(unseenNews({ serverNotice: null, notices }, '')).toBe(1);
    expect(unseenNews({ serverNotice: 'Maintenance at 10', notices: [] }, '')).toBe(1);
    expect(unseenNews({ serverNotice: 'Maintenance at 10', notices: [] }, noticeKey('Maintenance at 10'))).toBe(0);
    expect(noticeKey('a')).not.toBe(noticeKey('b'));
  });
  it('is in the top bar, and the Honor panel carries the leaderboards', () => {
    expect(hud).toMatch(/class: 'res res-news'/);
    expect(hud).toMatch(/openLeague\(\)[\s\S]*leaderboardBlock\(true\)/);
  });
  it('refused cross-device actions are told and listed (GLOBAL-009)', () => {
    expect(hud).toContain("t('sync.refused', { n: n - this.refusedTold })");
    expect(en['sync.refused']).toMatch(/plural/);
  });
});

describe('dialogs leave with motion (art F10)', () => {
  it('marks the dialog .out and removes it after its animation, at once under reduced motion', () => {
    const fb = read('src/presentation/ui/feedback.ts');
    expect(fb).toMatch(/export function removeWithExit[\s\S]*reducedMotion\(\)[\s\S]*el\.remove\(\)/);
    expect(hud).toContain('removeWithExit(backdrop)');
    expect(read('src/presentation/ui/battleHud.ts')).toContain('removeWithExit(backdrop)');
    expect(css).toMatch(/\.modal-backdrop\.out \{ animation: fade-out/);
    expect(css).toMatch(/#hud \.modal-backdrop\.out, #battle-hud \.modal-backdrop\.out \{ pointer-events: none; \}/);
  });
});

describe('type follows the OS text size and stays readable (R10, M8, F21)', () => {
  it('no font size is a fixed px value (the 16 px field floor and capped round-button labels aside)', () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
    for (const v of sizes) if (!/^max\(16px, 1em\)$|^var\(|^min\(\d|rem|em\b|^inherit$|^clamp\(/.test(v)) throw new Error(`fixed font size: ${v}`);
    expect([...css.matchAll(/\bfont:\s*(?:[a-z-]+\s+)?(?:\d{3}\s+)?(\d+)px/g)]).toEqual([]);
  });
  it('nothing is smaller than 12 px at the default size', () => {
    for (const m of css.matchAll(/(\d*\.?\d+)rem/g)) {
      const px = Number(m[1]) * 16;
      // Spacing in rem is not type; every rem in this file is a font size.
      expect(px, m[0]).toBeGreaterThanOrEqual(11);
    }
    const tiny = [...css.matchAll(/font-size:\s*(\d*\.?\d+)rem/g)].filter((m) => Number(m[1]) * 16 < 12);
    expect(tiny.map((m) => m[0])).toEqual([]);
  });
  it('small controls reach 44 px', () => {
    for (const sel of ['.shop-tabs button { border: none; border-radius: 999px; min-height: 44px', '.army-strip-line .btn { min-height: 44px', '.stack-row .btn { min-height: 44px', '.scout-row .chip { flex: none; min-height: 44px', '.link-btn { border: none; background: none; padding: 0; text-decoration: underline; font: inherit; cursor: pointer; min-height: 44px'])
      expect(css).toContain(sel);
    expect(css).toMatch(/\.queue-item \.qx::after, \.chat-more::after/);
  });
});

describe('scripts and right-to-left (localization CSS)', () => {
  it('names the phone fonts for every script the 50 languages use, with no font download', () => {
    for (const script of ['Arab', 'Hebr', 'Cyrl', 'Grek', 'Beng', 'Telu', 'Taml', 'Gujr', 'Knda', 'Mlym', 'Guru', 'Orya', 'Ethi'])
      expect(css, script).toMatch(new RegExp(`data-script="${script}"`));
    expect(css).toMatch(/html\[lang="ur"\] \{ --font-fallback: 'Noto Nastaliq Urdu'/);
    expect(css).toMatch(/html:is\(\[data-script="Arab"\], \[data-script="Hebr"\]\) body[^{]*\{ letter-spacing: normal !important; \}/);
    expect(css.match(/@font-face/g)).toHaveLength(3);
  });
  it('mirrors the fixed layout under dir=rtl', () => {
    for (const rule of ['html[dir="rtl"] .side-rail', 'html[dir="rtl"] .rail-pill', 'html[dir="rtl"] .hud-head', 'html[dir="rtl"] .scout-caret', 'html[dir="rtl"] .b-left.collapsed .b-caret::before'])
      expect(css).toContain(rule);
    // Physical left/right paddings became logical ones.
    expect(css).not.toMatch(/\.modal-body ul \{ padding-left/);
    expect(css).toMatch(/\.badge \{ position: absolute; top: -4px; inset-inline-end: -4px;/);
    expect(read('src/presentation/ui/tutorial.ts')).toContain('railLeft');
  });
});

describe('link previews, shortcuts, boot mark (G23, F24)', () => {
  const html = read('index.html');
  it('has Open Graph and Twitter tags with relative images and no og:url', () => {
    for (const tag of ['og:title', 'og:description', 'og:image', 'twitter:card']) expect(html).toContain(tag);
    expect(html).not.toContain('property="og:url"');
    expect(html).not.toMatch(/content="https?:\/\//);
  });
  it('the boot mark is sharp on 2x-3x phones without loading the 512 px icon', () => {
    expect(html).toMatch(/class="boot-mark"[^>]*srcset="\.\/icons\/icon-192\.png 192w, \.\/icons\/icon-336\.png 336w"/);
  });
  it('offers home-screen shortcuts the HUD opens', () => {
    const m = JSON.parse(read('public/manifest.webmanifest')) as { shortcuts: { url: string }[] };
    expect(m.shortcuts.map((s) => s.url)).toEqual(['./?open=daily', './?open=army', './?open=store', './?open=news']);
    for (const name of ['daily', 'army', 'store', 'news']) expect(hud).toContain(`name === '${name}'`);
    expect(read('tools/i18n/build.mjs')).toContain("SHORTCUT_KEYS = { daily: 'rail.Daily', army: 'hud.army', store: 'rail.Store', news: 'news.title' }");
  });
});

describe('support page: complaints route (UK Online Safety Act)', () => {
  it('says what can be complained about, how, and what happens', () => {
    const page = read('public/support.html');
    expect(page).toContain('id="complaints"');
    expect(page).toMatch(/Online safety complaint/);
    expect(Object.values(enPages as Record<string, string>).some((v) => v.includes('UK Online Safety Act'))).toBe(true);
  });
});
