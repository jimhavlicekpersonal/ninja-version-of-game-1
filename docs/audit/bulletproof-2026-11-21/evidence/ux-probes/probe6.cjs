const { chromium } = require('playwright');
const SP = process.env.OUT_DIR || require('path').join(__dirname, 'out');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: +process.argv[2], height: +process.argv[3] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tk.notifyAsked', '1'); localStorage.setItem('tk.ageAskedAfterTutorial', JSON.stringify({ count: 3, last: Date.now() })); } catch {} });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5199/?sandbox&debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.tk && document.querySelector('#boot')?.classList.contains('done'), null, { timeout: 120000 });
  await page.evaluate(() => { const c = window.tk.controller; c.dispatch({ type: 'tutorial', step: 9, done: true }); document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()); });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.tk.hud.openShortcut('store'));
  await page.waitForTimeout(800);
  const names = await page.evaluate(() => [...document.querySelectorAll('.modal button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 12));
  console.log('STORE BUTTON NAMES', JSON.stringify(names));
  const jade = await page.evaluate(() => { const e = document.querySelector('.res-moonstones'); return { tag: e.tagName, role: e.getAttribute('role'), tabindex: e.getAttribute('tabindex'), label: e.getAttribute('aria-label'), text: e.textContent, focusable: e.tabIndex }; });
  console.log('JADE PILL', JSON.stringify(jade));
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
  // shake under reduced motion: hook camera shake
  await page.evaluate(() => { const c = window.tk.controller; window.tk.app.practice({ [Object.keys(c.data.troops)[0]]: 20 }); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const sc = window.tk.game.scene.getScene('battle'); window.__shakes = 0; const cam = sc.cameras.main; const orig = cam.shake.bind(cam); cam.shake = (...a) => { window.__shakes++; return orig(...a); }; });
  const big = await page.$('.big-attack'); if (big) await big.tap();
  await page.waitForTimeout(800);
  // deploy everything at the first open point via squad
  await page.evaluate(() => { const sc = window.tk.game.scene.getScene('battle'); try { sc.session.orderSquad({ point: 0, formation: 'together', order: 'tanks' }); } catch (e) {} });
  await page.waitForTimeout(1500);
  // rotate mid-battle
  await page.setViewportSize({ width: +process.argv[4], height: +process.argv[5] });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SP}/battle-${process.argv.slice(2).join('-')}.png` });
  const ov = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth, off: [...document.querySelectorAll('#battle-hud button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }).map((b) => b.textContent.trim().slice(0, 20)) }));
  console.log('ROTATED', JSON.stringify(ov));
  const cards = await page.evaluate(() => [...document.querySelectorAll('#battle-hud .troop-card, #battle-hud .b-troops > *')].map((c) => { const r = c.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { cls: c.className.slice(0, 30), lab: c.getAttribute('aria-label'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), hitOk: !!hit && (hit === c || c.contains(hit)), hitIs: hit ? (hit.className || hit.tagName).toString().slice(0, 30) : null }; }));
  console.log('CARDS', JSON.stringify(cards));
  const bb = await page.evaluate(() => [...document.querySelectorAll('#battle-hud .b-bottom button')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), x: Math.round(r.left), w: Math.round(r.width), y: Math.round(r.top) }; }));
  console.log('BOTTOM', JSON.stringify(bb));
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(100);
  const shakes = await page.evaluate(() => ({ shakes: window.__shakes, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, destroyed: window.tk.game.scene.getScene('battle')?.session?.sim?.buildings?.filter((b) => b.destroyed).length }));
  console.log('SHAKES UNDER REDUCED MOTION', JSON.stringify(shakes));
  await page.screenshot({ path: `${SP}/battle-reduced-motion-360x640.png` });
  await browser.close();
})();
