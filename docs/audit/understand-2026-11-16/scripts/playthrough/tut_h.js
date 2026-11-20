const W = 1000;
await sleep(3000);
await ft('.round-btn.attack', 1500);
await shot('r20-attack-tapped');
await dump(40);
await text('body', 1800);
log(elapsed(), 'taps', s.taps);
newLogs();
