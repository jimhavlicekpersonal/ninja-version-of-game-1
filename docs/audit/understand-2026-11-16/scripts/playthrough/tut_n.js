const hud = () => page.evaluate(() => document.querySelector('#battle-hud')?.innerText.replace(/\n/g, ' ').slice(0, 300));
for (let i = 0; i < 16; i++) {
  await sleep(4000);
  const over = await page.evaluate(() => Boolean(document.querySelector('.modal-backdrop')) || document.getElementById('battle-hud')?.hidden);
  log(elapsed(), (await hud())?.slice(0, 80), over ? 'OVER' : '');
  if (over) break;
}
s.marks.firstRaidEnd = elapsed();
await sleep(500);
await shot('r32-result-0.5s');
await sleep(2500);
await shot('r33-result-3s');
await text('.modal-backdrop:last-child', 1800);
await dump(20, '.modal-backdrop:last-child');
await audit('.modal-backdrop:last-child');
log(elapsed(), 'taps', s.taps);
newLogs();
