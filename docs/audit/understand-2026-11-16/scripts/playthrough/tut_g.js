const W = 1000;
const bub = () => page.evaluate(() => { const b = document.querySelector('.tut-bubble'); return b && !b.hidden ? b.innerText.replace(/\n/g, ' ').slice(0, 160) : '(bubble hidden)'; });
const step = async (label = '') => log(elapsed(), 'taps', s.taps, label, '|', await bub());
await sleep(2000);
await ft('.training .btn.gold', W);
await shot('r17-finish-training-confirm');
await text('.modal-backdrop:last-child', 300);
await ft('.modal-backdrop:last-child .btn.primary', W);
await step('training finished');
await shot('r18-army-ready');
await sleep(1500);
// close army panel
await ft('.modal-backdrop:last-child .icon-btn', W);
await shot('r19-step8-raid');
await step();
await dump(30);
