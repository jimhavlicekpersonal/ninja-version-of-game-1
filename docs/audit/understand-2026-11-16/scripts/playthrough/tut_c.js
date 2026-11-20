const W = 1000;
s.t0 = Date.now(); s.taps = 0; s.marks = {};
const cdp = await page.context().newCDPSession(page);
async function swipe(x, y0, y1, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  s.taps++;
}
const bub = () => page.evaluate(() => { const b = document.querySelector('.tut-bubble'); return b && !b.hidden ? b.innerText.replace(/\n/g, ' ').slice(0, 110) : '(bubble hidden)'; });
const step = async (label = '') => log(elapsed(), 'taps', s.taps, label, '|', await bub());
await sleep(2500);
await ft('.tut-bubble .btn.primary', W); await step();
await sleep(2500);
await ft('.round-btn.build', W);
await ft('.shop-card[data-type="acorn_orchard"]', W);
await ft('.round-btn.ok', W); await step();
await page.waitForSelector('.sheet .btn.collect', { timeout: 30000 });
await sleep(1500);
let zeroCollects = 0;
for (let i = 0; i < 8; i++) {
  await ft('.sheet .btn.collect', 500);
  if (i === 0) { await shot('r10-collect-zero'); log('toast after zero collect: ' + await page.evaluate(() => [...document.querySelectorAll('.toast')].map(e => e.innerText).join(' | '))); }
  if (/STEP 3/i.test(await bub())) break;
  zeroCollects++;
  await sleep(3000);
}
log('collect taps with nothing happening:', zeroCollects);
await step();
await sleep(2500);
await ft('.sheet .icon-btn', W);
await ft('#tk-banner-persist button:nth-of-type(2)', W);
const ring = await page.evaluate(() => { const r = document.querySelector('.tut-ring').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.6]; });
await page.touchscreen.tap(ring[0], ring[1]); s.taps++; await sleep(W);
await swipe(180, 430, 300); await sleep(600);
await ft('.sheet .btn.upgrade', W); await step();
await sleep(2500);
await ft('.sheet .btn.gold', W);
await ft('.modal-backdrop:last-child .btn.primary', W);
await step('keep2');
s.marks.keep2 = elapsed();
await sleep(2500);
// close the keep sheet as a player would
if (!(await ft('.sheet .icon-btn', W))) { log('close X covered: tapping the map above the sheet instead'); await page.touchscreen.tap(150, 125); s.taps++; await sleep(W); log('sheet still open: ' + await page.evaluate(() => Boolean(document.querySelector('#hud .sheet:not([hidden])')))); }
await shot('r11-after-keep-sheet-close');
