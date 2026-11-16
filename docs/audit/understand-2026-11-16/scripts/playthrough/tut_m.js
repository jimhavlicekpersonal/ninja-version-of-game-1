const cdp = await page.context().newCDPSession(page);
const hud = () => page.evaluate(() => document.querySelector('#battle-hud')?.innerText.replace(/\n/g, ' ').slice(0, 300));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 262, y: 366 }] });
await sleep(900);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
s.taps++;
await sleep(500);
log(await hud());
await shot('r28-all-deployed');
// smoke: select the ability, tap by the tower (dark building near 197,283?)
await ft('.troop-card[data-type="smoke_bomb"]', 500);
await tapXY(175, 350, 600);
await shot('r29-smoke');
log(await hud());
for (let i = 0; i < 14; i++) {
  await sleep(5000);
  const h = await hud();
  const over = await page.evaluate(() => Boolean(document.querySelector('.modal-backdrop')) || document.getElementById('battle-hud')?.hidden);
  log(elapsed(), h?.slice(0, 120), over ? 'OVER' : '');
  if (i === 1) await shot('r30-battle-mid');
  if (over) break;
}
await shot('r31-battle-end');
await text('.modal-backdrop:last-child', 1500);
await dump(20, '.modal-backdrop:last-child');
log(elapsed(), 'taps', s.taps);
