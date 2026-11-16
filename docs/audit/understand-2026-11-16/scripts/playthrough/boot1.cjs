const { open, shot, dump, text } = require('./lib.cjs');
(async () => {
  const { browser, page, logs, t0 } = await open({ url: 'http://localhost:5199/' });
  const marks = {};
  // sample screenshots
  for (const ms of [500, 1500, 3000]) { await page.waitForTimeout(ms - (Date.now() - t0) > 0 ? ms - (Date.now() - t0) : 0); await shot(page, `boot-${ms}`); }
  try { await page.waitForSelector('#boot.done', { timeout: 90000 }); marks.bootDone = Date.now() - t0; } catch (e) { marks.bootDone = 'timeout'; }
  await shot(page, 'boot-done');
  await page.waitForTimeout(2500);
  await shot(page, 'boot-done-plus2s');
  console.log('marks', marks);
  console.log('--- text'); console.log(await text(page));
  console.log('--- dump'); console.log(await dump(page));
  console.log('--- logs'); console.log(logs.join('\n'));
  const gl = await page.evaluate(() => { const c = document.querySelector('#game canvas'); return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null; });
  console.log('canvas', gl);
  await browser.close();
})();
