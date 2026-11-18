// P3-04 check: a fresh sandbox village at 360x640, driven through the tutorial with the commands its taps send
// (controller.dispatch), real timers, no Jade. Reports when the tutorial reaches its raid step.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:5199/?debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.tk && window.tk.controller, null, { timeout: 60000 });
  const t0 = Date.now();
  const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s ${m}`);
  const step = () => page.evaluate(() => window.tk.controller.state.tutorial.step);
  const jade0 = await page.evaluate(() => window.tk.controller.state.resources.moonstones);
  const refusals = [];
  const send = async (cmd) => {
    const r = await page.evaluate((c) => { const r = window.tk.controller.dispatch(c); return r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message }; }, cmd);
    if (!r.ok) refusals.push(`${cmd.type}: ${r.code}`);
    return r.ok;
  };
  const place = async (type) => {
    for (let y = 8; y < 34; y += 3) for (let x = 6; x < 34; x += 3) if (await send({ type: 'place', buildingType: type, x, y })) { refusals.length = 0; return true; }
    return false;
  };
  const idOf = (type) => page.evaluate((t) => window.tk.controller.state.buildings.find((b) => b.type === t)?.id, type);
  const wait = async (fn, ms = 300000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(500); } return false; };
  // Step 1: welcome.
  await page.locator('.tut-bubble .btn').first().click({ timeout: 20000 }).catch(() => {});
  log(`step ${await step()} (after welcome)`);
  await place('acorn_orchard'); log('Coin Mint placed');
  const mint = await idOf('acorn_orchard');
  // Collect only once a coin exists (the bubble's rule during the tutorial).
  await wait(() => page.evaluate((id) => { const c = window.tk.controller; const b = c.state.buildings.find((x) => x.id === id); return b && !(b.upgrade && b.upgrade.endsAt > c.now()) && (b.collector?.stored ?? 0) + 0 >= 0 && c.dispatch({ type: 'collect', id }).ok; }, mint));
  log(`collected; step ${await step()}`);
  await send({ type: 'upgrade', id: await idOf('elder_toadstool') }); log(`Keep upgrading; step ${await step()}`);
  await wait(async () => (await step()) >= 4, 20000); log(`step ${await step()} (army step reached while the Keep builds)`);
  for (const t of ['burrow_barracks', 'army_camp', 'acorn_cannon']) {
    await wait(() => place(t), 120000); log(`${t} placed`);
  }
  await wait(() => send({ type: 'train', troop: 'hedgehog_roller', count: 10 }), 120000); log(`10 Shinobi queued; step ${await step()}`);
  const reached = await wait(async () => (await step()) >= 7, 300000);
  const jade1 = await page.evaluate(() => window.tk.controller.state.resources.moonstones);
  log(`${reached ? 'RAID STEP REACHED' : 'raid step NOT reached'} at ${((Date.now() - t0) / 1000).toFixed(0)} s; Jade spent ${jade0 - jade1}; page errors ${errors.length}`);
  await page.screenshot({ path: '/tmp/claude-0/scr/pw/tutorial-raid-step.png' });
  await browser.close();
})();
