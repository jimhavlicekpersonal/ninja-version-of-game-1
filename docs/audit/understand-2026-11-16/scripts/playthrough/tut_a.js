// human-paced: ~1s per tap, 2.5s to read each new bubble
const W = 1000;
s.t0 = Date.now(); s.taps = 0;
const cdp = await page.context().newCDPSession(page);
async function swipe(x, y0, y1, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  s.taps++;
}
const step = async () => log(elapsed(), 'taps', s.taps, '|', (await page.evaluate(() => document.querySelector('.tut-bubble')?.innerText.replace(/\n/g, ' ').slice(0, 90))));
await sleep(2500);
await ft('.tut-bubble .btn.primary', W); await step();           // I am ready
await sleep(2500);
await ft('.round-btn.build', W);
await ft('.shop-card[data-type="acorn_orchard"]', W);
await ft('.round-btn.ok', W); await step();
// wait for build 10 s + first coin
await page.waitForSelector('.sheet .btn.collect', { timeout: 30000 });
await sleep(1500);
for (let i = 0; i < 6; i++) { await ft('.sheet .btn.collect', W); if (await page.evaluate(() => /STEP 3/i.test(document.querySelector('.tut-bubble')?.innerText || ''))) break; await sleep(3000); }
await step();
await sleep(2500);
await ft('.sheet .icon-btn', W);     // close mint sheet
// dismiss banner hiding the Keep
await ft('#tk-banner-persist button:nth-of-type(2)', W);
const ring = await page.evaluate(() => { const r = document.querySelector('.tut-ring').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.6]; });
await page.touchscreen.tap(ring[0], ring[1]); s.taps++; await sleep(W);
await swipe(180, 430, 300); await sleep(600);
await ft('.sheet .btn.upgrade', W); await step();
await sleep(2500);
await ft('.sheet .btn.gold', W);
await ft('.modal-backdrop:last-child .btn.primary', 300);
await shot('r01-keep2-0.3s'); await sleep(900); await shot('r01-keep2-1.2s'); await sleep(1500); await shot('r01-keep2-2.7s');
await step();
