const W = 1000;
const bub = () => page.evaluate(() => { const b = document.querySelector('.tut-bubble'); return b && !b.hidden ? b.innerText.replace(/\n/g, ' ').slice(0, 160) : '(bubble hidden)'; });
const step = async (label = '') => log(elapsed(), 'taps', s.taps, label, '|', await bub());
log('ring:', await page.evaluate(() => { const r = document.querySelector('.tut-ring'); const b = r.getBoundingClientRect(); const bb = document.querySelector('.tut-bubble').getBoundingClientRect(); return { hidden: r.hidden, ring: [b.left, b.top, b.right, b.bottom].map(Math.round), bubble: [bb.left, bb.top, bb.right, bb.bottom].map(Math.round) }; }));
await ft('.modal-backdrop:last-child .btn.sky', W);
await shot('r16-training');
await step('train tapped');
await text('.modal-backdrop:last-child', 900);
await dump(30, '.modal-backdrop:last-child');
