// scroll-into-view then finger tap (counts 1 extra "scroll" gesture)
const sft = async (sel, wait = 600, opts = {}) => {
  const ok = await page.evaluate(({ sel, nth }) => { const all = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0); const e = nth === 'last' ? all[all.length - 1] : all[0]; if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; }, { sel, nth: opts.nth });
  if (!ok) { log('SFT not found ' + sel); return false; }
  s.taps++; await sleep(250);
  return ft(sel, wait, opts);
};
const btnByText = async (re, root = 'body') => page.evaluate(({ re, root }) => { const base = [...document.querySelectorAll(root)].pop() || document.body; const rx = new RegExp(re, 'i'); const b = [...base.querySelectorAll('button')].find((b) => rx.test(b.innerText) && b.getBoundingClientRect().width > 0); if (!b) return null; b.setAttribute('data-ply', '1'); document.querySelectorAll('[data-ply]').forEach((x) => { if (x !== b) x.removeAttribute('data-ply'); }); return b.innerText.replace(/\n/g, ' '); }, { re, root });
const tapText2 = async (re, wait = 700, root = 'body') => { const t = await btnByText(re, root); if (!t) { log('no button ~ ' + re); return false; } return sft('[data-ply="1"]', wait); };
