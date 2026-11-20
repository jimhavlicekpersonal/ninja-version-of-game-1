// human-paced first run, real-finger taps (refuses covered targets)
const W = 1000;
const ses = await newSession('run3', { url: 'http://localhost:5199/' });
const page = ses.page; const s = ses;
await page.waitForSelector('#boot.done', { timeout: 60000 });
log('bootDone', ((Date.now() - ses.t0) / 1000).toFixed(2));
