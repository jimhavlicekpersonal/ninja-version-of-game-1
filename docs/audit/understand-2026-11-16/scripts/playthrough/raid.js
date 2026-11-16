// generic raid helper (appended after pre.js/pre2.js). Usage: await raid('tag')
const raid = async (tag, opts = {}) => {
  const cdp = await page.context().newCDPSession(page);
  const hold = async (x, y, ms) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); s.taps++; await sleep(250); };
  const hudText = () => page.evaluate(() => document.querySelector('#battle-hud')?.innerText.replace(/\n+/g, ' ').slice(0, 400));
  const cards = () => page.evaluate(() => [...document.querySelectorAll('#battle-hud .troop-card')].map((c) => ({ type: c.dataset.type, ability: c.classList.contains('ability'), n: Number((c.innerText.match(/×\s*(\d+)/) || [0, 0])[1]), empty: c.classList.contains('empty') })));
  if (!opts.already) {
    if (!(await ft('.round-btn.attack', 1800))) return log('raid: no attack button');
  }
  await ft('.b-name', 500);
  log(tag, 'SCOUT:', await hudText());
  await shot(`${tag}-scout`);
  await ft('.b-name', 300);
  if (opts.stake) await ft(`[data-id="stake-${opts.stake}"]`, 400);
  const t0 = Date.now();
  if (!(await ft('.big-attack', 2200))) return log('raid: no Attack! button');
  await shot(`${tag}-start`);
  const W2 = await page.evaluate(() => innerWidth), H2 = await page.evaluate(() => innerHeight);
  // candidate ring positions: scan the island rim (portrait fit view)
  const cand = opts.cand || [[180, 393], [262, 350], [100, 267], [180, 227], [258, 238], [97, 238], [95, 320], [262, 320], [340, 300], [20, 300], [180, 410], [250, 365]];
  let guard = 0;
  for (;;) {
    const cs = (await cards()).filter((c) => !c.ability && c.n > 0);
    if (!cs.length || guard++ > 30) break;
    const c = cs[0];
    await ft(`#battle-hud .troop-card[data-type="${c.type}"]`, 200);
    const [x, y] = cand[guard % cand.length];
    await hold(x, y, 1200);
  }
  log(tag, 'deployed; left:', JSON.stringify(await cards()), 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await shot(`${tag}-deployed`);
  // use abilities near the centre
  for (const c of (await cards()).filter((c) => c.ability && c.n > 0)) { await ft(`#battle-hud .troop-card[data-type="${c.type}"]`, 200); await tapXY(W2 / 2, H2 * 0.5, 300); }
  let last = '';
  for (let i = 0; i < 50; i++) {
    await sleep(4000);
    const over = await page.evaluate(() => Boolean(document.querySelector('.modal-backdrop')));
    last = (await hudText()) || '';
    if (i === 2) await shot(`${tag}-mid`);
    if (over) break;
  }
  log(tag, 'battle length', ((Date.now() - t0) / 1000).toFixed(1), 's; hud:', last.slice(0, 100));
  await sleep(2500);
  await shot(`${tag}-result`);
  log(tag, 'RESULT:', await page.evaluate(() => [...document.querySelectorAll('.modal-backdrop')].pop()?.innerText.replace(/\n+/g, ' | ').slice(0, 700)));
  log(await page.evaluate(() => [...[...document.querySelectorAll('.modal-backdrop')].pop()?.querySelectorAll('button') ?? []].map((b) => b.innerText.replace(/\n/g, ' ')).join(' / ')));
};
