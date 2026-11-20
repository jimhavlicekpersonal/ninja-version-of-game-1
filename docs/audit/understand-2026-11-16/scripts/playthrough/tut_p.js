const W = 1000;
await sleep(3000);
await ft('.tut-bubble .btn.primary', 1200);
s.marks.tutorialDone = elapsed();
await shot('r36-after-finish');
await text('.modal-backdrop:last-child', 1500);
await dump(30, '.modal-backdrop:last-child');
await audit('.modal-backdrop:last-child');
log(elapsed(), 'taps', s.taps);
