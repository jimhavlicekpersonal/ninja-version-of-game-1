const { chromium } = require('playwright');
const SP = process.env.OUT_DIR || require('path').join(__dirname, 'out');
const URL0 = 'http://localhost:5199/';
const MEASURE = () => {
  const out = [];
  for (const el of document.querySelectorAll('#hud button, #hud a[href], #hud input, #hud select, #hud [role=button], #battle-hud button')) {
    if (el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const after = getComputedStyle(el, '::after');
    let hw = r.width, hh = r.height;
    if (after.content && after.content !== 'none' && after.position === 'absolute') {
      const ins = ['top','right','bottom','left'].map((k) => parseFloat(after[k]) || 0);
      hw = r.width - ins[1] - ins[3]; hh = r.height - ins[0] - ins[2];
    }
    const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.title;
    if (Math.min(hw, hh) < 44) out.push({ cls: el.className.toString().slice(0, 40), name, w: Math.round(r.width), h: Math.round(r.height), hit: [Math.round(hw), Math.round(hh)] });
    if (!name && el.tagName === 'BUTTON') out.push({ cls: el.className.toString().slice(0,40), unlabeled: true });
  }
  return out;
};
(async () => {
  const browser = await chromium.launch();
  const size = (process.argv[2] || '360x640').split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tk.notifyAsked', '1'); } catch {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(URL0 + '?sandbox&debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.tk && document.querySelector('#boot')?.classList.contains('done'), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const tag = `${size[0]}x${size[1]}`;
  await page.screenshot({ path: `${SP}/${tag}-first-launch.png` });
  const first = await page.evaluate(() => ({ modals: [...document.querySelectorAll('.modal-backdrop:not(.out) h2')].map((e) => e.textContent), tut: document.querySelector('.tut-bubble:not([hidden])')?.textContent?.slice(0, 120), hist: history.length }));
  console.log('FIRST', JSON.stringify(first));
  // past tutorial
  await page.evaluate(() => { const tk = window.tk; tk.controller.dispatch({ type: 'tutorial', step: 9, done: true }); document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()); });
  await page.waitForTimeout(800);
  console.log('VILLAGE small targets', JSON.stringify(await page.evaluate(MEASURE)));
  await page.screenshot({ path: `${SP}/${tag}-village.png` });
  // store
  await page.evaluate(() => window.tk.hud.openShortcut('store'));
  await page.waitForTimeout(800);
  console.log('STORE small targets', JSON.stringify(await page.evaluate(MEASURE)));
  await page.screenshot({ path: `${SP}/${tag}-store.png` });
  const buy = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal button')].find((x) => /Test|\$/.test(x.textContent) && !x.disabled); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: b.textContent }; });
  console.log('BUY', JSON.stringify(buy));
  if (buy) {
    // fast double tap
    await page.touchscreen.tap(buy.x, buy.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(buy.x, buy.y);
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({ modals: [...document.querySelectorAll('.modal-backdrop:not(.out) h2')].map((e) => e.textContent) }));
    console.log('AFTER DOUBLE TAP BUY', JSON.stringify(st));
    await page.screenshot({ path: `${SP}/${tag}-store-doubletap.png` });
    // where is the confirm button vs buy
    const conf = await page.evaluate(() => { const ms = [...document.querySelectorAll('.modal-backdrop:not(.out) .modal')]; const m = ms.pop(); if (!m) return null; return [...m.querySelectorAll('.modal-foot button')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }); });
    console.log('CONFIRM BUTTONS', JSON.stringify(conf));
    // Now: confirm, then quickly tap Buy again while purchase is in flight
    const jade0 = await page.evaluate(() => window.tk.controller.state.resources.moonstones);
    const cb = conf && conf.find((b) => /Buy/.test(b.t));
    if (cb) {
      await page.touchscreen.tap(cb.x + cb.w / 2, cb.y + cb.h / 2);
      await page.waitForTimeout(30);
      await page.touchscreen.tap(buy.x, buy.y);
      await page.waitForTimeout(600);
      const st2 = await page.evaluate(() => ({ modals: [...document.querySelectorAll('.modal-backdrop:not(.out) h2')].map((e) => e.textContent), jade: window.tk.controller.state.resources.moonstones, purchases: window.tk.controller.state.purchases.length }));
      console.log('AFTER CONFIRM + REBUY TAP', jade0, JSON.stringify(st2));
    }
  }
  // back button: history
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
  await page.evaluate(() => window.tk.hud.openShortcut('army'));
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({ len: history.length, url: location.href, modals: document.querySelectorAll('.modal-backdrop:not(.out)').length }));
  const resp = await page.goBack({ waitUntil: 'load', timeout: 5000 }).catch((e) => 'ERR ' + e.message.slice(0, 80));
  const after = await page.evaluate(() => ({ url: location.href, modals: document.querySelectorAll('.modal-backdrop:not(.out)').length })).catch((e) => 'gone ' + e.message.slice(0, 60));
  console.log('BACK', JSON.stringify(before), String(resp && resp.url ? resp.url() : resp), JSON.stringify(after));
  console.log('ERRS', errs.slice(0, 5));
  await browser.close();
})();
