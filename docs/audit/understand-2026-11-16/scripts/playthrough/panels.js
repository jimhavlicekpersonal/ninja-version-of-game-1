// panel tour helper: await tour('prefix', ['daily','store',...])
const closeAll = async () => {
  for (let i = 0; i < 5; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.modal-backdrop:not(.out)').length);
    if (!n) break;
    await page.keyboard.press('Escape');
    await sleep(350);
  }
  if (await page.evaluate(() => Boolean(document.querySelector('#hud .sheet:not([hidden])')))) { await page.keyboard.press('Escape'); await sleep(300); }
};
const modalInfo = async (n = 1400) => page.evaluate((n) => {
  const m = [...document.querySelectorAll('.modal-backdrop:not(.out)')].pop();
  if (!m) return '(no modal)';
  const c = m.cloneNode(true); c.querySelectorAll('select').forEach((x) => x.remove());
  const body = m.querySelector('.modal-body, .modal') || m;
  const sc = [...m.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
  return `[scroll ${sc ? sc.scrollHeight + '/' + sc.clientHeight : 'none'}] ` + c.innerText.replace(/\n+/g, ' | ').slice(0, n);
}, n);
const tabsOf = async () => page.evaluate(() => { const m = [...document.querySelectorAll('.modal-backdrop:not(.out)')].pop(); if (!m) return []; return [...m.querySelectorAll('[role="tab"], .tabs button, .shop-tabs button, .seg button, .tab')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\n/g, ' ').trim()); });
const tour = async (prefix, ids, opts = {}) => {
  for (const id of ids) {
    await closeAll();
    const sel = `.round-btn[data-id="${id}"], .res[data-id="${id}"], button[data-id="${id}"]`;
    const vis = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); return Boolean(e); }, sel);
    if (!vis) { log(`PANEL ${id}: button not visible`); continue; }
    await ft(sel, 1300);
    await shot(`${prefix}-${id}`);
    log(`PANEL ${id}:`, await modalInfo(opts.n ?? 1200));
    log('  tabs:', JSON.stringify(await tabsOf()));
    await audit('.modal-backdrop:not(.out)');
  }
  await closeAll();
};
