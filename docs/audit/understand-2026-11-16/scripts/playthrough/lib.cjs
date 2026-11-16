const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');
const ORIGIN = 'http://localhost:5199/';
async function open({ url = ORIGIN, width = 360, height = 640, touch = true, tag = 'run', storageState, locale = 'en-US' } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, locale, ...(storageState ? { storageState } : {}) });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push(`[${t}] ${m.text()} @${m.location().url}:${m.location().lineNumber}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,4).join('\n')}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  return { browser, ctx, page, logs, t0, tag };
}
let n = 0;
async function shot(page, name) {
  const f = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: f });
  return f;
}
/** Visible interactive elements and visible text summary. */
async function dump(page, { max = 60 } = {}) {
  return page.evaluate((max) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const out = [];
    for (const e of document.querySelectorAll('button, [role="button"], a, input, select, .shop-card, .troop-card')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      out.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}${e.dataset.id ? '[data-id=' + e.dataset.id + ']' : ''}${e.dataset.type ? '[data-type=' + e.dataset.type + ']' : ''}${e.dataset.tab ? '[data-tab=' + e.dataset.tab + ']' : ''}${e.disabled ? '[disabled]' : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)}" @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (out.length >= max) break;
    }
    return out.join('\n');
  }, max);
}
async function text(page, sel = 'body') {
  return page.evaluate((sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\n{2,}/g, '\n').slice(0, 3000) : '(none)'; }, sel);
}
module.exports = { open, shot, dump, text, SHOTS, ORIGIN };
