const cdp = await page.context().newCDPSession(page);
const count = () => page.evaluate(() => document.querySelector('.troop-card[data-type="hedgehog_roller"]')?.innerText.replace(/\n/g, ' '));
// long-press 1.5 s
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 178, y: 410 }] });
await sleep(1500);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
s.taps++;
await sleep(300);
log('after 1.5s hold:', await count());
for (let i = 0; i < 12; i++) await tapXY(176 + (i % 4) * 3, 407 + (i % 3) * 2, 180);
log('after 12 more taps at D:', await count(), '| toasts', await page.evaluate(() => [...document.querySelectorAll('.toast, .b-toast, [class*="toast"]')].map(e => e.innerText).join(' | ')));
await shot('r27-D-full');
await text('#battle-hud', 500);
