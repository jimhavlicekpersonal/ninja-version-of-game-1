// prelude: real-finger tap. Does not auto-scroll; reports cover/offscreen.
const ft = async (sel, wait = 450, opts = {}) => {
  const r = await page.evaluate(({ sel, nth }) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const e = nth === 'last' ? all[all.length - 1] : all[0];
    if (!e) return { err: 'not found: ' + sel };
    const b = e.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const ok = top && (top === e || e.contains(top) || top.contains(e));
    return { cx, cy, ok, top: top ? top.tagName + '.' + (top.className.baseVal ?? top.className) : null, rect: [b.left, b.top, b.right, b.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, disabled: e.disabled };
  }, { sel, nth: opts.nth });
  if (r.err) { log('FT ' + r.err); return false; }
  if (!r.ok) { log(`FT COVERED (not tapped) ${sel} centre covered by ${r.top} rect=${r.rect}`); if (!opts.force) return false; }
  if (r.cy < 0 || r.cy > r.vh || r.cx < 0 || r.cx > r.vw) { log(`FT OFFSCREEN ${sel} rect=${r.rect}`); return false; }
  if (r.disabled) log(`FT DISABLED ${sel}`);
  await page.touchscreen.tap(r.cx, r.cy); s.taps++;
  await page.waitForTimeout(wait);
  return true;
};
const toasts = async () => log('toasts: ' + await page.evaluate(() => [...document.querySelectorAll('.toast')].map(e => e.innerText.replace(/\n/g, ' ')).join(' | ')));
const st = async () => log('state: ' + await page.evaluate(() => { const g = (c) => document.querySelector(c)?.innerText?.replace(/\s+/g, ' ') ?? ''; return [g('.res-acorns, .res:nth-child(1)'), g('.res:nth-child(2)'), g('.res-moonstones'), g('.res-trophies')].join(' ; '); }));
