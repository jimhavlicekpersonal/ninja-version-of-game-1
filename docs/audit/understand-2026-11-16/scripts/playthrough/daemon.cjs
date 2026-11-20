// Long-lived Playwright driver: POST JS to http://127.0.0.1:5311/run ; state survives between commands.
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const SHOTS = path.join(__dirname, 'shots');
const ORIGIN = 'http://localhost:5199/';
const S = {}; // sessions
let browser;
async function newSession(name, { url = ORIGIN, width = 360, height = 640, touch = true, locale = 'en-US', init } = {}) {
  if (S[name]) { try { await S[name].ctx.close(); } catch {} }
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, locale });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push(`[${t}] ${m.text().slice(0, 400)} @${(m.location().url || '').replace(ORIGIN, '')}:${m.location().lineNumber}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  page.on('dialog', async (d) => { logs.push(`[dialog ${d.type()}] ${d.message()}`); try { await d.dismiss(); } catch {} });
  const s = { ctx, page, logs, t0: Date.now(), taps: 0, name, logCursor: 0 };
  S[name] = s;
  await page.goto(url, { waitUntil: 'commit' });
  return s;
}
function helpers(s, out) {
  const page = s?.page;
  const H = {
    S, newSession, page, s,
    log: (...a) => out.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    elapsed: () => ((Date.now() - s.t0) / 1000).toFixed(1) + 's',
    async shot(name) { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f }); out.push('shot ' + f); return f; },
    async tap(sel, opts = {}) {
      const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
      await loc.tap({ timeout: opts.timeout ?? 4000, ...(opts.force ? { force: true } : {}) });
      s.taps++;
      await page.waitForTimeout(opts.wait ?? 350);
    },
    async tapText(text, opts = {}) {
      const loc = page.getByRole('button', { name: text, exact: opts.exact ?? false }).first();
      await loc.tap({ timeout: opts.timeout ?? 4000 });
      s.taps++;
      await page.waitForTimeout(opts.wait ?? 350);
    },
    async tapXY(x, y, wait = 300) { await page.touchscreen.tap(x, y); s.taps++; await page.waitForTimeout(wait); },
    async dump(max = 70, root = 'body') {
      const r = await page.evaluate(({ max, root }) => {
        const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
        const o = [];
        const base = document.querySelector(root) || document.body;
        for (const e of base.querySelectorAll('button, [role="button"], a, input, select, .shop-card, .troop-card, [role="tab"]')) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect();
          o.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}${e.dataset.id ? '[data-id=' + e.dataset.id + ']' : ''}${e.dataset.type ? '[data-type=' + e.dataset.type + ']' : ''}${e.dataset.tab ? '[data-tab=' + e.dataset.tab + ']' : ''}${e.disabled ? '[disabled]' : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70)}" @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (o.length >= max) break;
        }
        return o.join('\n');
      }, { max, root });
      out.push(r);
      return r;
    },
    async text(sel = 'body', max = 2500) {
      const r = await page.evaluate(({ sel, max }) => { const e = [...document.querySelectorAll(sel)].pop(); return e ? e.innerText.replace(/\n{2,}/g, '\n').slice(0, max) : '(none)'; }, { sel, max });
      out.push(r);
      return r;
    },
    newLogs() { const l = s.logs.slice(s.logCursor); s.logCursor = s.logs.length; if (l.length) out.push('LOGS:\n' + l.join('\n')); return l; },
    /** clipped/overflow audit: elements whose rect leaves the viewport or text overflows */
    async audit(root = 'body') {
      const r = await page.evaluate((root) => {
        const o = [];
        const base = [...document.querySelectorAll(root)].pop() || document.body;
        const vis = (e) => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
        for (const e of base.querySelectorAll('button, .btn, .chip, .res, h1, h2, h3, .title, .tab, [role="tab"], label, .badge, p, span, td, th, li')) {
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || !vis(e)) continue;
          if (r.bottom < 0 || r.top > innerHeight) continue;
          const txt = (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
          if (!txt) continue;
          const tag = `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${txt}"`;
          if (r.right > innerWidth + 1 || r.left < -1) {
            // ignore if inside a horizontally scrollable ancestor
            let p = e.parentElement, scroll = false;
            while (p) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth) { scroll = true; break; } p = p.parentElement; }
            if (!scroll) o.push(`OFFSCREEN-X ${tag} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
          }
          if (e.children.length === 0 && (e.scrollWidth > e.clientWidth + 2) && getComputedStyle(e).overflow !== 'visible') o.push(`TEXT-CLIPPED ${tag} scrollW=${e.scrollWidth} clientW=${e.clientWidth}`);
          if ((e.tagName === 'BUTTON' || e.classList.contains('btn')) && (r.width < 40 || r.height < 40) && r.width > 0) o.push(`SMALL-TARGET ${tag} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        // raw key leaks
        const body = base.innerText;
        const leaks = body.match(/\b(?:ui|hud|tutorial|battle|data|messages|store|army|settings)\.[a-z0-9_.]{3,}\b/gi) || [];
        const ids = body.match(/\b[a-z]+_[a-z]+(?:_[a-z0-9]+)*\b/g) || [];
        if (leaks.length) o.push('KEY-LEAK ' + [...new Set(leaks)].slice(0, 20).join(', '));
        if (ids.length) o.push('SNAKE-IDS ' + [...new Set(ids)].slice(0, 30).join(', '));
        if (/undefined|NaN|\[object|null\b/.test(body)) o.push('BAD-TOKEN ' + (body.match(/.{0,30}(undefined|NaN|\[object|null\b).{0,30}/g) || []).slice(0, 8).join(' | '));
        if (document.documentElement.scrollWidth > innerWidth + 1) o.push(`PAGE-HSCROLL scrollWidth=${document.documentElement.scrollWidth}`);
        return [...new Set(o)].slice(0, 60).join('\n');
      }, root);
      out.push('AUDIT(' + root + '):\n' + (r || '(clean)'));
      return r;
    },
  };
  return H;
}
(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', async () => {
      const u = new URL(req.url, 'http://x');
      const name = u.searchParams.get('s') || 'main';
      const out = [];
      try {
        const H = helpers(S[name], out);
        const fn = new Function(...Object.keys(H), `return (async () => {\n${body}\n})();`);
        const r = await fn(...Object.values(H));
        if (r !== undefined) out.push('=> ' + (typeof r === 'string' ? r : JSON.stringify(r)));
      } catch (e) { out.push('ERROR: ' + (e.stack || e.message).split('\n').slice(0, 6).join('\n')); }
      res.writeHead(200, { 'content-type': 'text/plain' }).end(out.join('\n') + '\n');
    });
  }).listen(5311, '127.0.0.1', () => console.log('daemon ready'));
})();
