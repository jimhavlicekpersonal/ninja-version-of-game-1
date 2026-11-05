/**
 * Store screenshots (roadmap step 49, prepared for the owner): the built game
 * (`npm run build`) in the testing sandbox, captured by Playwright's Chromium
 * at the sizes App Store Connect and the Play Console ask for.
 *
 *   npm run build && npm run store:screenshots            -> docs/store/screenshots/
 *   npm run store:screenshots -- --out=/tmp/shots
 *
 * The sandbox village is a fresh one; for richer shots, load a save code in
 * Settings first (`--save=<code file>`), or take them by hand on a device.
 * Screens: the village, the Army panel, the Store, the Alliance and Settings.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const out = arg('out', join(ROOT, 'docs/store/screenshots'));
const dist = join(ROOT, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('Build the game first: npm run build');
  process.exit(1);
}
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Needs Playwright (a dev tool): npx playwright install chromium');
  process.exit(1);
}

// Serve dist/ on a free port.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(dist, path || 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/?sandbox`;

// Store sizes (portrait): iPhone 6.9" and 6.5", iPad 13", Android phone.
const devices = [
  { name: 'iphone-6.9', width: 440, height: 956, scale: 3 },
  { name: 'iphone-6.5', width: 414, height: 896, scale: 3 },
  { name: 'ipad-13', width: 1032, height: 1376, scale: 2 },
  { name: 'android-phone', width: 412, height: 915, scale: 2.625 },
];
const screens = [
  { name: '1-village', open: null },
  { name: '2-army', open: 'Army' },
  { name: '3-store', open: 'Store' },
  { name: '4-alliance', open: 'Alliance' },
];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const d of devices) {
    const page = await browser.newPage({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, isMobile: !d.name.startsWith('ipad'), hasTouch: true });
    await page.goto(base);
    await page.waitForSelector('#boot.done', { timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(3000);
    // Close anything the first start opens (the tutorial, hints) so the village shows.
    const skip = page.getByText('Skip tutorial').first();
    if (await skip.count()) await skip.click().catch(() => undefined);
    await page.waitForTimeout(500);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
    for (const s of screens) {
      if (s.open) {
        const btn = page.getByRole('button', { name: s.open }).first();
        if (await btn.count()) await btn.click().catch(() => undefined);
        await page.waitForTimeout(800);
      }
      await page.screenshot({ path: join(out, `${d.name}-${s.name}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    await page.close();
    console.log(`${d.name}: ${screens.length} screenshots`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`Saved in ${out}. Check each one: store rules forbid misleading screenshots (show real gameplay).`);
