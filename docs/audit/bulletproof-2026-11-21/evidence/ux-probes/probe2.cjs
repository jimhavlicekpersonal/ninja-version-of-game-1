const { chromium } = require('playwright');
const SP = process.env.OUT_DIR || require('path').join(__dirname, 'out');
const URL0 = 'http://localhost:5199/';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tk.notifyAsked', '1'); localStorage.setItem('tk.ageAskedAfterTutorial', JSON.stringify({ count: 3, last: Date.now() })); } catch {} });
  const page = await ctx.newPage();
  await page.goto(URL0 + '?sandbox&debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.tk && document.querySelector('#boot')?.classList.contains('done'), null, { timeout: 120000 });
  await page.evaluate(() => { const c = window.tk.controller; c.dispatch({ type: 'tutorial', step: 9, done: true }); c.dispatch({ type: 'setProfile', under18: false, ageBand: 'adult' }); document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()); });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.tk.hud.openShortcut('store'));
  await page.waitForTimeout(800);
  const buy = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal button')].find((x) => /test/.test(x.textContent) && !x.disabled); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: b.textContent }; });
  const p0 = await page.evaluate(() => ({ n: window.tk.controller.state.purchases.length, jade: window.tk.controller.state.resources.moonstones }));
  await page.touchscreen.tap(buy.x, buy.y);
  await page.waitForTimeout(90);
  await page.touchscreen.tap(buy.x, buy.y);
  await page.waitForTimeout(600);
  const titles = await page.evaluate(() => [...document.querySelectorAll('.modal-backdrop:not(.out) h2')].map((e) => e.textContent));
  console.log('after double tap:', JSON.stringify(titles));
  await page.screenshot({ path: `${SP}/360x640-buy-doubletap-two-confirms.png` });
  // confirm every "Confirm purchase" dialog on top
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-backdrop:not(.out) .modal')].pop(); if (!m || !/Confirm purchase/.test(m.querySelector('h2').textContent)) return null; const b = [...m.querySelectorAll('.modal-foot button')].find((x) => /Buy/.test(x.textContent)); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    if (!r) break;
    await page.touchscreen.tap(r.x, r.y);
    await page.waitForTimeout(1200);
  }
  const p1 = await page.evaluate(() => ({ n: window.tk.controller.state.purchases.length, jade: window.tk.controller.state.resources.moonstones }));
  console.log('purchases before/after', JSON.stringify(p0), JSON.stringify(p1));
  // Jade spend: double tap a gold "finish" button? Use a Look purchase (spendMoonstones) in store Looks
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
  await browser.close();
})();
