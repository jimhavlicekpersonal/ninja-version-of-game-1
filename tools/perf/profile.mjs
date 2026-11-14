// CPU profile of start-up on a slowed CPU (no network throttle), grouped by function.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const dist = process.argv[2] ?? join(process.cwd(), 'dist');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dist, p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4180, r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto('http://localhost:4180/?debug');
await page.waitForSelector('#boot.done', { state: 'attached', timeout: 120000 });
const ms = Date.now() - t0;
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
// Attribute each sample to buckets by walking up the stack for known painter names.
const buckets = {};
let total = 0;
for (const [id, us] of self) {
  total += us;
  const n = byId.get(id);
  const own = n.callFrame.functionName || n.callFrame.url.split('/').pop() || '(' + n.callFrame.functionName + ')';
  let bucket = null;
  for (let cur = id; cur != null; cur = parent.get(cur)) {
    const f = byId.get(cur).callFrame.functionName;
    if (/generatePlaceholders|paint|Painter|warriorIcon|drawWarrior|ensure.*Texture/i.test(f)) { bucket = 'generate textures'; break; }
  }
  if (!bucket) bucket = /^\((program|idle|garbage collector)\)$/.test(own) ? own : own === '(root)' ? '(root)' : 'other: ' + own;
  buckets[bucket] = (buckets[bucket] ?? 0) + us;
}
const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
console.log(`start-up ${ms} ms wall, ${(total / 1000).toFixed(0)} ms sampled (CPU x6)\n` + top.join('\n'));
await browser.close();
server.close();
