const W = 1000;
await ft('.b-name', W);
await shot('r21-opp-card');
await text('#battle-hud', 1500);
await ft('.scout-toggle', W);
await shot('r22-scout-open');
await text('#battle-hud', 2500);
await audit('#battle-hud');
log(elapsed(), 'taps', s.taps);
