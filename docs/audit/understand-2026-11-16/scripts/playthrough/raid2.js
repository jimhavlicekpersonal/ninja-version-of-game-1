// debug-session raid helper: reads ring positions from window.tk (like tools/store/screenshots.mjs)
const points = () => page.evaluate(() => {
  const sc = window.tk?.game.scene.getScene('battle');
  const entry = sc?.session?.sim.entry;
  if (!entry) return [];
  const cam = sc.cameras.main;
  const cv = document.querySelector('#game canvas');
  const k = cv.clientWidth / cv.width;
  const r = cv.getBoundingClientRect();
  return entry.points.map((p, i) => {
    const wx = (p.x - p.y) * 32;
    const wy = (p.x + p.y) * 16;
    return { i, x: r.left + (wx - cam.worldView.x) * cam.zoom * k, y: r.top + (wy - cam.worldView.y) * cam.zoom * k };
  });
});
const simInfo = () => page.evaluate(() => {
  const sc = window.tk?.game.scene.getScene('battle');
  const sim = sc?.session?.sim;
  if (!sim) return null;
  return { tick: sim.tick, troopsAlive: sim.troops.filter((t) => !t.dead).length, troops: sim.troops.length, zoom: sc.cameras.main.zoom, destruction: sim.destruction ?? null, fps: Math.round(window.tk.game.loop.actualFps) };
});
const raidD = async (tag, opts = {}) => {
  const cdp = await page.context().newCDPSession(page);
  const hold = async (x, y, ms) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); s.taps++; await sleep(200); };
  const hudText = () => page.evaluate(() => document.querySelector('#battle-hud')?.innerText.replace(/\n+/g, ' ').slice(0, 500));
  const cards = () => page.evaluate(() => [...document.querySelectorAll('#battle-hud .troop-card')].map((c) => ({ type: c.dataset.type, ability: c.classList.contains('ability'), hero: c.classList.contains('hero'), n: Number((c.innerText.match(/×\s*(\d+)/) || [0, 0])[1]), empty: c.classList.contains('empty') })));
  if (!opts.already) { if (!(await ft('.round-btn.attack', 2200))) return log('raid: no attack button'); }
  if (opts.next) for (let i = 0; i < opts.next; i++) await tapText2('^Next', 1500, '#battle-hud');
  await ft('.b-name', 500);
  log(tag, 'SCOUT:', await hudText());
  await shot(`${tag}-scout`);
  await audit('#battle-hud');
  await ft('.b-name', 300);
  if (opts.scoutOpen) { await ft('.scout-toggle', 600); await shot(`${tag}-scout-open`); log(tag, 'SCOUT OPEN:', (await hudText())); await ft('.scout-toggle', 400); }
  if (opts.stake) await ft(`[data-id="stake-${opts.stake}"]`, 400);
  const t0 = Date.now();
  if (!(await ft('.big-attack', 2500))) return log('raid: no Attack! button');
  await shot(`${tag}-start`);
  log(tag, 'start sim', JSON.stringify(await simInfo()), 'cards', JSON.stringify(await cards()));
  let guard = 0, pi = 0;
  for (;;) {
    const cs = (await cards()).filter((c) => !c.ability && c.n > 0);
    if (!cs.length || guard++ > 40) break;
    const c = cs[0];
    await ft(`#battle-hud .troop-card[data-type="${c.type}"]`, 150, { force: true });
    const ps = (await points()).filter((p) => p.x > 15 && p.x < (opts.w ?? 345) && p.y > 110 && p.y < (opts.h ?? 470));
    if (!ps.length) { log('no visible points'); break; }
    const p = ps[pi++ % ps.length];
    await hold(p.x, p.y, 1100);
  }
  log(tag, 'deployed in', ((Date.now() - t0) / 1000).toFixed(1), 's; left:', JSON.stringify((await cards()).filter((c) => c.n > 0)), 'sim', JSON.stringify(await simInfo()));
  await shot(`${tag}-deployed`);
  const W2 = await page.evaluate(() => innerWidth), H2 = await page.evaluate(() => innerHeight);
  for (const c of (await cards()).filter((c) => c.ability && c.n > 0)) { await ft(`#battle-hud .troop-card[data-type="${c.type}"]`, 200, { force: true }); await tapXY(W2 / 2, H2 * 0.45, 300); }
  let last = '';
  for (let i = 0; i < 60; i++) {
    await sleep(4000);
    const over = await page.evaluate(() => Boolean(document.querySelector('.modal-backdrop')));
    last = (await hudText()) || '';
    if (i === 3) { await shot(`${tag}-mid`); log(tag, 'mid sim', JSON.stringify(await simInfo())); }
    if (over) break;
  }
  log(tag, 'battle length', ((Date.now() - t0) / 1000).toFixed(1), 's; hud:', last.slice(0, 120));
  await sleep(2500);
  await shot(`${tag}-result`);
  log(tag, 'RESULT:', await page.evaluate(() => [...document.querySelectorAll('.modal-backdrop')].pop()?.innerText.replace(/\n+/g, ' | ').slice(0, 900)));
  await audit('.modal-backdrop:not(.out)');
};
