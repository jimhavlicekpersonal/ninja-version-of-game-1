await tapXY(180, 408, 700);
await shot('r25-deploy1');
log('after 1 tap:', await page.evaluate(() => document.querySelector('.troop-card[data-type="hedgehog_roller"]').innerText.replace(/\n/g, ' ')), '| coach:', await page.evaluate(() => document.querySelector('.b-coach, .coach, [class*="coach"]')?.innerText));
await tapXY(180, 408, 400);
await tapXY(183, 410, 400);
log('after 3 taps:', await page.evaluate(() => document.querySelector('.troop-card[data-type="hedgehog_roller"]').innerText.replace(/\n/g, ' ')));
await shot('r26-deploy3');
await text('#battle-hud', 500);
