// Phase 6 surface check (BEAST_MODE 2026-11-16, section 11): opens the village's panels in the testing sandbox at the
// four device sizes and in the given languages, with touch, and reports what a player cannot reach.
//
// Usage: node tools/ui/surfaces.mjs [--url=http://localhost:5173/] [--langs=en,ar,de] [--sizes=320x568,360x640,390x844,844x390]
//                                   [--shots=docs/audit/understand-2026-11-16/phase6/shots] [--only=army,store]
// Start the dev server first (`npm run dev`). Needs Playwright with Chromium (a development tool, never shipped).
// Checks per surface: every listed target's centre is inside the viewport and a hit test there lands on it (not on
// the canvas or a covering element); text boxes that are cut (scrollWidth > clientWidth with an ellipsis) are listed.
// Chromium emulation: an estimate of a phone, not a device certification.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const URL0 = arg('url', 'http://localhost:5173/');
const LANGS = arg('langs', 'en').split(',');
const SIZES = arg('sizes', '320x568,360x640,390x844,844x390').split(',').map((s) => s.split('x').map(Number));
const SHOTS = arg('shots', '');
const ONLY = arg('only', '').split(',').filter(Boolean);

/** Surfaces: how to open each one from the village, and the elements a player must be able to tap there. */
const SURFACES = [
  { id: 'village', open: () => undefined, targets: ['.hud-bottom button', '.objective-chip:not([hidden])'] },
  { id: 'army', open: (tk) => tk.hud.openShortcut('army'), targets: ['.army-list > .troop-row:first-child .btn.primary', '.army-tabrow button'] },
  { id: 'store', open: (tk) => tk.hud.openShortcut('store'), targets: ['.modal .shop-tabs button'] },
  { id: 'daily', open: (tk) => tk.hud.openShortcut('daily'), targets: ['.daily > .actions .btn'] },
  { id: 'news', open: (tk) => tk.hud.openShortcut('news'), targets: ['.modal .modal-close, .modal button[aria-label]'] },
  {
    id: 'keep-sheet',
    open: (tk) => {
      const keep = tk.controller.state.buildings.find((b) => tk.controller.data.buildings[b.type]?.category === 'hall');
      tk.hud.bus?.emit?.('select', keep?.id);
    },
    targets: ['.sheet .actions .btn', '.sheet .sheet-head .icon-btn'],
  },
];

// The showcase village (tools/store/showcaseVillage.ts) at --keep (default 6), loaded into the sandbox save.
const KEEP = process.argv.includes('--tutorial') ? 0 : Number(arg('keep', '6'));
let village = null;
if (KEEP > 0) {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    village = (await vite.ssrLoadModule('/tools/store/showcaseVillage.ts')).showcaseVillage(KEEP, 4200 + KEEP, Date.now());
  } finally {
    await vite.close();
  }
}

/** --tutorial: a new village on the Keep step (index 2) with the Keep's sheet open. */
const TUTORIAL = process.argv.includes('--tutorial');
const TUTORIAL_CHECK = () => {
  const out = [];
  const box = (e) => e && e.getBoundingClientRect();
  const btn = document.querySelector('.sheet:not([hidden]) .btn.upgrade');
  const bubble = document.querySelector('.tut-bubble:not([hidden])');
  const bar = document.querySelector('#hud .hud-bottom');
  const hit = (el) => {
    const r = box(el);
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return h && (h === el || el.contains(h));
  };
  const over = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  if (!btn) out.push({ problem: 'no Upgrade on the Keep sheet' });
  else if (!hit(btn)) out.push({ problem: 'Upgrade is covered' });
  if (bubble && btn && over(box(bubble), box(btn))) out.push({ problem: 'bubble over Upgrade' });
  if (bubble && bar && over(box(bubble), box(bar))) out.push({ problem: 'bubble over the bottom bar' });
  const skip = document.querySelector('.tut-skip');
  if (skip && !hit(skip)) out.push({ problem: 'skip link covered' });
  const ring = document.querySelector('.tut-ring:not([hidden])');
  const sheet = document.querySelector('.sheet:not([hidden])');
  if (ring && sheet && btn && over(box(ring), box(sheet)) && !over(box(ring), box(btn))) out.push({ problem: 'ring drawn through the sheet away from Upgrade' });
  const head = document.querySelector('.sheet:not([hidden]) .sheet-head');
  if (bubble && head && over(box(bubble), box(head))) out.push({ problem: 'bubble over the sheet head' });
  const close = document.querySelector('.sheet:not([hidden]) .sheet-head .icon-btn');
  if (close && !hit(close)) out.push({ problem: 'sheet close button covered' });
  return out;
};

const browser = await chromium.launch();
const report = [];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
for (const lang of LANGS) {
  for (const [w, hgt] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: lang });
    await ctx.addInitScript((l) => {
      try {
        localStorage.setItem('tk.lang', l);
        // One-time questions answered, so they do not cover the panels under test.
        localStorage.setItem('tk.ageAskedAfterTutorial', JSON.stringify({ count: 3, last: Date.now() }));
        localStorage.setItem('tk.notifyAsked', '1');
      } catch {
        /* storage blocked */
      }
    }, lang);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && !/GL Driver|GPU stall/.test(m.text()) && errors.push(`${m.type()}: ${m.text()}`));
    await page.goto(`${URL0}?debug`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.tk && document.querySelector('#boot')?.classList.contains('done'), null, { timeout: 120000 });
    if (TUTORIAL) {
      const found = await page.evaluate(async (check) => {
        const tk = window.tk;
        const c = tk.controller;
        c.dispatch({ type: 'tutorial', step: 2, done: false });
        const keep = c.state.buildings.find((b) => c.data.buildings[b.type]?.category === 'hall');
        tk.hud.bus.emit('select', keep.id);
        await new Promise((r) => setTimeout(r, 1500));
        return eval(`(${check})()`);
      }, TUTORIAL_CHECK.toString());
      report.push({ key: `${lang} ${w}x${hgt} tutorial-keep`, problems: found });
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${w}x${hgt}-tutorial-keep.png`) });
      await ctx.close();
      continue;
    }
    if (village) {
      await page.evaluate(async (v) => window.tk.controller.replace(v), village);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.tk && document.querySelector('#boot')?.classList.contains('done'), null, { timeout: 120000 });
    }
    await page.addStyleTag({ content: '.toast { display: none !important; }' });
    // Past the tutorial (the showcase village is).
    await page.evaluate(() => {
      const tk = window.tk;
      if (!tk.controller.state.tutorial.done) tk.controller.dispatch({ type: 'tutorial', step: 9, done: true });
      document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
    });
    await page.waitForTimeout(800);
    for (const s of SURFACES) {
      if (ONLY.length && !ONLY.includes(s.id)) continue;
      await page.evaluate(() => {
        window.tk.hud.closeAllModals?.();
        window.tk.hud.bus?.emit?.('select', null);
      });
      await page.waitForTimeout(250);
      await page.evaluate(`(${s.open.toString()})(window.tk)`);
      await page.waitForTimeout(700);
      const found = await page.evaluate((targets) => {
        const out = [];
        for (const sel of targets) {
          const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
          if (!els.length) out.push({ sel, problem: 'none shown' });
          for (const el of els.slice(0, 6)) {
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40);
            if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
              out.push({ sel, label, problem: `centre off screen (${Math.round(cx)},${Math.round(cy)})` });
              continue;
            }
            const hit = document.elementFromPoint(cx, cy);
            if (!hit || !(el === hit || el.contains(hit))) out.push({ sel, label, problem: `covered by ${hit ? hit.tagName.toLowerCase() + '.' + [...hit.classList].join('.') : 'nothing'}` });
            if (r.width < 44 && r.height < 44 && el.matches('button, a, [role=button]')) out.push({ sel, label, problem: `small target ${Math.round(r.width)}x${Math.round(r.height)}` });
          }
        }
        // Cut text inside the open panel.
        const scope = document.querySelector('.modal-backdrop:not(.out) .modal') ?? document.querySelector('.sheet:not([hidden])') ?? document.body;
        for (const el of scope.querySelectorAll('b, span, button, .chip, h2, h3, p')) {
          const cs = getComputedStyle(el);
          if (el.offsetParent !== null && cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push({ sel: 'cut text', label: el.textContent.trim().slice(0, 40), problem: `${el.clientWidth}/${el.scrollWidth}px` });
        }
        return out;
      }, s.targets);
      const key = `${lang} ${w}x${hgt} ${s.id}`;
      report.push({ key, problems: found });
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang}-${w}x${hgt}-${s.id}.png`) });
    }
    if (errors.length) report.push({ key: `${lang} ${w}x${hgt} console`, problems: errors.slice(0, 10).map((e) => ({ problem: e })) });
    await ctx.close();
  }
}
await browser.close();
for (const r of report) {
  console.log(`${r.problems.length ? '✗' : '✓'} ${r.key}`);
  for (const p of r.problems) console.log(`    ${p.sel ?? ''} ${p.label ? `"${p.label}"` : ''} ${p.problem}`);
}
if (SHOTS) writeFileSync(join(SHOTS, 'report.json'), JSON.stringify(report, null, 1));
