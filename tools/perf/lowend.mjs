// Load the built game (dist/) under throttled networks and a slowed CPU, as a cheap phone on bad service would.
// Usage: node lowend.mjs <distDir>
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const dist = process.argv[2] ?? join(process.cwd(), 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dist, p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  let body = readFileSync(f);
  const type = TYPES[extname(f)] ?? 'application/octet-stream';
  const headers = { 'content-type': type, 'cache-control': p.includes('/assets/') ? 'max-age=31536000' : 'no-cache' };
  if (/text|json|javascript|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = gzipSync(body, { level: 9 }); headers['content-encoding'] = 'gzip'; }
  res.writeHead(200, headers); res.end(body);
});
await new Promise((r) => server.listen(4179, r));
const URL0 = 'http://localhost:4179/?debug';

const kbps = (k) => (k * 1000) / 8;
const PROFILES = [
  { name: 'Good 4G, mid phone', down: 9000, up: 3000, rtt: 60, cpu: 2 },
  { name: 'Weak 3G, cheap phone', down: 750, up: 250, rtt: 300, cpu: 4 },
  { name: 'Slow 3G, cheap phone', down: 400, up: 400, rtt: 2000, cpu: 6 },
  { name: '2G/EDGE, cheap phone', down: 240, up: 200, rtt: 840, cpu: 6 },
];

const browser = await chromium.launch();
async function run(profile, { repeatOffline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.rtt, downloadThroughput: kbps(profile.down), uploadThroughput: kbps(profile.up) });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  const t0 = Date.now();
  await page.goto(URL0, { waitUntil: 'commit', timeout: 300000 });
  const fcp = await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime, null, { timeout: 300000, polling: 50 }).then((h) => h.jsonValue());
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 300000 });
  const ready = Date.now() - t0;
  const firstBytes = bytes;
  // Let the service worker finish precaching, then measure memory.
  await page.waitForTimeout(3000);
  const mem = await page.evaluate(() => {
    const g = window.tk?.game;
    let tex = 0, count = 0;
    if (g) for (const [k, t] of Object.entries(g.textures.list)) { if (k.startsWith('__')) continue; for (const s of t.source) { tex += (s.width || 0) * (s.height || 0) * 4; count++; } }
    const c = document.querySelector('#game canvas');
    return { textureMB: tex / 1048576, textures: count, canvas: c ? `${c.width}x${c.height}` : '', heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, renderer: g ? (g.renderer.type === 2 ? 'WebGL' : 'Canvas') : '' };
  });
  const totalBytes = bytes;
  let offline = null;
  if (repeatOffline) {
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const t1 = Date.now();
    await page.reload({ waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('#boot.done', { state: 'attached', timeout: 120000 });
    offline = Date.now() - t1;
  }
  await ctx.close();
  return { profile: profile.name, fcpMs: Math.round(fcp), readyMs: ready, firstKB: Math.round(firstBytes / 1024), totalKB: Math.round(totalBytes / 1024), offlineReloadMs: offline, ...mem };
}

const out = [];
for (const p of PROFILES) out.push(await run(p, { repeatOffline: p.cpu === 6 && p.down === 400 }));
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
