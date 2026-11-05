// Load the built game (dist/) under throttled networks and a slowed CPU, as a cheap phone on bad service would.
// Usage: node lowend.mjs [distDir]            network profiles (default)
//        node lowend.mjs [distDir] --quality  high vs low rendering quality (render/quality.ts) at 360x640, DPR 3,
//                                             CPU x4: cold start, texture bytes by kind, frame rate and frame work in
//                                             the village and a practice battle, and the automatic pick on a 2 GB phone.
//        npm run perf:lowend -- --quality [--runs=3]
// Chromium emulation on this machine's CPU and (usually software) GPU: an estimate, not a physical cheap-phone result.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--')) ?? join(process.cwd(), 'dist');
const qualityMode = args.includes('--quality');
const runsArg = Number(args.find((a) => a.startsWith('--runs='))?.slice(7));
const RUNS = Number.isFinite(runsArg) && runsArg > 0 ? runsArg : 3;
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

/** Texture bytes (width x height x 4 per source) grouped by key kind, in the page. */
function textureReport() {
  const g = window.tk?.game;
  const kinds = {};
  let total = 0, count = 0;
  if (g) for (const [k, t] of Object.entries(g.textures.list)) {
    if (k.startsWith('__')) continue;
    let b = 0;
    for (const s of t.source) b += (s.width || 0) * (s.height || 0) * 4;
    const kind = k.startsWith('building.') ? 'buildings' : k.startsWith('troop.') ? 'warriors' : k.startsWith('icon.warrior.') ? 'badges' : k === 'ground' ? 'island' : /^(construction|rubble)\./.test(k) ? 'construction+rubble' : 'other';
    kinds[kind] ??= { n: 0, MB: 0 };
    kinds[kind].n++;
    kinds[kind].MB += b / 1048576;
    total += b; count++;
  }
  for (const v of Object.values(kinds)) v.MB = Math.round(v.MB * 10) / 10;
  return { textureMB: Math.round((total / 1048576) * 10) / 10, textures: count, kinds };
}

/** Rendered frames per second and main-thread work per frame over `ms`, in the page. */
function frameSample(ms) {
  return new Promise((resolve) => {
    const g = window.tk.game;
    let frames = 0, work = 0, t0 = 0;
    const pre = () => { t0 = performance.now(); };
    const post = () => { frames++; work += performance.now() - t0; };
    g.events.on('prestep', pre);
    g.events.on('postrender', post);
    const start = performance.now();
    setTimeout(() => {
      g.events.off('prestep', pre);
      g.events.off('postrender', post);
      const secs = (performance.now() - start) / 1000;
      resolve({ fps: Math.round((frames / secs) * 10) / 10, workMsPerFrame: frames ? Math.round((work / frames) * 10) / 10 : null });
    }, ms);
  });
}

/** Open a practice battle and deploy a mixed army so the frame sample has fighting in it. */
async function startBattle() {
  const { app, game, controller } = window.tk;
  const troops = Object.keys(controller.data.troops).slice(0, 3);
  app.practice(Object.fromEntries(troops.map((t) => [t, 8])));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let scene = null;
  for (let i = 0; i < 100 && !(scene = game.scene.getScene('battle'))?.session; i++) await wait(100);
  if (!scene?.session) return 0;
  const s = scene.session;
  s.start();
  const n = controller.data.economy.mapSize;
  let placed = 0;
  for (const t of troops) for (let k = 0; k < 8; k++) {
    let ok = false;
    for (let i = 0; i < 4 * n && !ok; i++) {
      const edge = i % 4, a = Math.floor(i / 4) + 0.5;
      const [x, y] = edge === 0 ? [a, 0.5] : edge === 1 ? [n - 0.5, a] : edge === 2 ? [a, n - 0.5] : [0.5, a];
      ok = s.tryDeploy(t, x, y);
    }
    if (ok) placed++;
  }
  return placed;
}

async function qualityRun(label, { query = '', deviceMemory, cores } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  if (deviceMemory !== undefined || cores !== undefined) {
    await ctx.addInitScript(({ deviceMemory, cores }) => {
      if (deviceMemory !== undefined) Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => deviceMemory, configurable: true });
      if (cores !== undefined) Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores, configurable: true });
    }, { deviceMemory, cores });
  }
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(`http://localhost:4179/?debug${query}`, { waitUntil: 'commit', timeout: 300000 });
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 300000 });
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const village = await page.evaluate(textureReport);
  const canvas = await page.evaluate(() => { const c = document.querySelector('#game canvas'); return c ? `${c.width}x${c.height}` : ''; });
  const villageFrames = await page.evaluate(frameSample, 5000);
  const deployed = await page.evaluate(startBattle);
  await page.waitForTimeout(1000);
  const battleFrames = await page.evaluate(frameSample, 5000);
  const afterBattle = await page.evaluate(textureReport);
  const heapMB = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
  await ctx.close();
  return { label, readyMs, canvas, village, villageFrames, deployed, battleFrames, afterBattleTextureMB: afterBattle.textureMB, afterBattleTextures: afterBattle.textures, heapMB };
}

if (qualityMode) {
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const out = [];
  for (const [label, opts] of [['high (?quality=high)', { query: '&quality=high' }], ['low (?quality=low)', { query: '&quality=low' }], ['auto, 2 GB / 8 cores', { deviceMemory: 2, cores: 8 }], ['auto, 8 GB / 8 cores', { deviceMemory: 8, cores: 8 }]]) {
    const runs = [];
    for (let i = 0; i < (label.startsWith('auto') ? 1 : RUNS); i++) runs.push(await qualityRun(label, opts));
    const last = runs[runs.length - 1];
    out.push({ ...last, readyMs: median(runs.map((r) => r.readyMs)), readyMsRuns: runs.map((r) => r.readyMs) });
  }
  console.log(JSON.stringify(out, null, 1));
} else {
  const out = [];
  for (const p of PROFILES) out.push(await run(p, { repeatOffline: p.cpu === 6 && p.down === 400 }));
  console.log(JSON.stringify(out, null, 1));
}
await browser.close();
server.close();
