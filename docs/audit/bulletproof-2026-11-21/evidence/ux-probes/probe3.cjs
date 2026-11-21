const { chromium } = require('playwright');
const SP = process.env.OUT_DIR || require('path').join(__dirname, 'out');
const URL0 = 'http://localhost:5199/';
const CHECK = () => {
  const out = { overflowX: document.documentElement.scrollWidth > innerWidth, cut: [], off: [], small: [] };
  for (const el of document.querySelectorAll('#hud button, #hud .modal h2, #hud .modal p, #hud label, #hud .res-amt, #battle-hud button')) {
    if (el.closest('[hidden]') || el.closest('.out')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') out.cut.push((el.textContent || '').trim().slice(0, 40));
    if (el.tagName === 'BUTTON' && (r.right > innerWidth + 1 || r.left < -1)) out.off.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30));
    if (el.tagName === 'BUTTON') {
      const a = getComputedStyle(el, '::after');
      const ext = a.content !== 'none' && a.position === 'absolute' ? -(parseFloat(a.top) || 0) - (parseFloat(a.bottom) || 0) : 0;
      if (r.height + ext < 44 || r.width < 44 && !(a.content !== 'none' && a.position === 'absolute')) out.small.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}=${Math.round(r.width)}x${Math.round(r.height)}${ext ? '+' + Math.round(ext) : ''}`);
    }
  }
  return out;
};
(async () => {
  const [lang, size] = [process.argv[2] || 'de', (process.argv[3] || '320x568').split('x').map(Number)];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem('tk.lang', l); localStorage.setItem('tk.notifyAsked', '1'); localStorage.setItem('tk.ageAskedAfterTutorial', JSON.stringify({ count: 3, last: Date.now() })); } catch {} }, lang);
  const page = await ctx.newPage();
  await page.goto(URL0 + '?sandbox&debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.tk && document.querySelector('#boot')?.classList.contains('done'), null, { timeout: 120000 });
  await page.evaluate(() => { const c = window.tk.controller; c.dispatch({ type: 'tutorial', step: 9, done: true }); document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()); });
  await page.addStyleTag({ content: '.toast { display: none !important; }' });
  await page.waitForTimeout(800);
  const tag = `${lang}-${size[0]}x${size[1]}`;
  const res = {};
  res.village = await page.evaluate(CHECK);
  await page.screenshot({ path: `${SP}/${tag}-village.png` });
  for (const [id, fn] of [['store', () => window.tk.hud.openShortcut('store')], ['army', () => window.tk.hud.openShortcut('army')], ['settings', () => document.querySelector('[data-id=settings]').click()]]) {
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
    await page.evaluate(fn);
    await page.waitForTimeout(1200);
    res[id] = await page.evaluate(CHECK);
    await page.screenshot({ path: `${SP}/${tag}-${id}.png` });
  }
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
  // battle
  try {
    await page.evaluate(() => { const c = window.tk.controller; window.tk.app.practice({ ...c.state.army, ...(Object.keys(c.state.army).length ? {} : { [Object.keys(c.data.troops)[0]]: 5 }) }); });
    await page.waitForTimeout(3500);
    res.battle = await page.evaluate(CHECK);
    await page.screenshot({ path: `${SP}/${tag}-battle.png` });
  } catch (e) { res.battle = String(e).slice(0, 120); }
  console.log(tag, JSON.stringify(res, null, 0));
  await browser.close();
})();
