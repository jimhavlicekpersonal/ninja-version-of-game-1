const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const dist = '/home/user/ninja-version-of-game-1/dist';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, ''); const f = path.join(dist, p || 'index.html'); if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f)); });
server.listen(0, '127.0.0.1', async () => {
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const run of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = []; let bytes = 0, reqs = 0;
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
    page.on('response', async (r) => { reqs++; try { bytes += (await r.body()).length; } catch {} if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
    const t0 = Date.now();
    await page.goto(origin, { waitUntil: 'commit' });
    await page.waitForSelector('#boot.done', { timeout: 60000 });
    const t = Date.now() - t0;
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => { const c = document.querySelector('#game canvas'); let gl = null; try { gl = c.getContext('webgl2') ? 'webgl2' : c.getContext('webgl') ? 'webgl' : '2d?'; } catch (e) { gl = 'err ' + e.message; } return { canvas: [c.width, c.height], gl, bubble: document.querySelector('.tut-bubble')?.innerText.slice(0, 40), store: Boolean([...document.querySelectorAll('.round-btn[data-id="store"]')].find(e => e.getBoundingClientRect().width > 0)) }; });
    console.log(`run ${run}: boot ${t} ms, ${reqs} requests, ${(bytes / 1024).toFixed(0)} KB uncompressed`, JSON.stringify(info), logs.join(' ; ') || 'no console errors/warnings');
    if (run === 1) await page.screenshot({ path: path.join(__dirname, 'shots', 'dist-boot.png') });
    await ctx.close();
  }
  await browser.close(); server.close();
});
