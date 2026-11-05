/**
 * Store screenshots (roadmap step 49, prepared for the owner): the built game
 * (`npm run build`) in the testing sandbox, captured by Playwright's Chromium
 * at the sizes App Store Connect and the Play Console ask for.
 *
 *   npm run build && npm run store:screenshots            -> docs/store/screenshots/
 *   npm run store:screenshots -- --out=/tmp/shots
 *   npm run store:screenshots -- --keep=12 --devices=iphone-6.9 --dist=<built dir>
 *
 * The shots show a mid-game village, not a brand-new lawn (art re-audit item 12): a legal Keep 10
 * village built by the game's own base generator (`showcaseVillage.ts`, loaded through Vite's SSR
 * loader; `--keep=8..12` picks another Keep, `--state=<file.json>` uses a village of your own), put
 * into the testing sandbox with `tk.controller.replace` (sandbox saves never go online). Screens: the
 * village, a raid in progress (a generated practice target, labelled as such in the game), the Army
 * panel, the Store and the Alliance.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const out = arg('out', join(ROOT, 'docs/store/screenshots'));
const dist = arg('dist', join(ROOT, 'dist'));
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
const origin = `http://127.0.0.1:${server.address().port}/`;
const base = `${origin}?sandbox`;

// The showcase village (a Keep 8-12 village from the game's base generator, or --state=<file>).
const keep = Math.min(15, Math.max(1, Number(arg('keep', '10')) || 10));
let village;
const stateFile = arg('state', '');
if (stateFile) village = JSON.parse(readFileSync(stateFile, 'utf8'));
else {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ root: ROOT, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const m = await vite.ssrLoadModule('/tools/store/showcaseVillage.ts');
    village = m.showcaseVillage(keep, 4200 + keep, Date.now());
  } finally {
    await vite.close();
  }
}

// Store sizes (portrait): iPhone 6.9" and 6.5", iPad 13", Android phone.
const allDevices = [
  { name: 'iphone-6.9', width: 440, height: 956, scale: 3 },
  { name: 'iphone-6.5', width: 414, height: 896, scale: 3 },
  { name: 'ipad-13', width: 1032, height: 1376, scale: 2 },
  { name: 'android-phone', width: 412, height: 915, scale: 2.625 },
];
const only = arg('devices', '');
const devices = only ? allDevices.filter((d) => only.split(',').includes(d.name)) : allDevices;
const screens = [
  { name: '1-village', open: null },
  { name: '3-army', open: 'Army' },
  { name: '4-store', open: 'Store' },
  { name: '5-alliance', open: 'Alliance' },
];
const hideToasts = '.toast { display: none !important; }';

/** Put the showcase village into the sandbox save, then reload without the debug hook. */
async function loadVillage(page) {
  await page.goto(`${origin}?debug`);
  await page.waitForSelector('#boot.done', { timeout: 60_000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean(window.tk?.controller), null, { timeout: 30_000 });
  await page.evaluate(async (s) => { await window.tk.controller.replace(s); }, village);
  await page.goto(base);
  await page.waitForSelector('#boot.done', { timeout: 60_000 }).catch(() => undefined);
  await page.addStyleTag({ content: hideToasts });
  await page.waitForTimeout(3500);
}

/** Start a practice raid, send warriors in at the open points and capture the fight. */
async function battleShot(page, file) {
  const attack = page.getByRole('button', { name: 'Attack', exact: true }).first();
  if (!(await attack.count())) return false;
  await attack.click();
  await page.waitForTimeout(2500);
  const go = page.getByRole('button', { name: 'Attack!' }).first();
  if (!(await go.count())) return false;
  await go.click();
  await page.waitForTimeout(1200);
  const box = await page.locator('#game canvas').boundingBox();
  const cards = await page.$$eval('.troop-card:not(.ability)', (es) => es.map((e) => e.dataset.type).filter(Boolean));
  // The HUD lists the open points on screen through its chevrons/rings; tap around the canvas
  // centre band, where the start camera frames them, and let the game snap to the nearest point.
  const spots = [[0.5, 0.36], [0.2, 0.5], [0.8, 0.5], [0.5, 0.64]];
  for (const t of cards.slice(0, 3)) {
    await page.locator(`.troop-card[data-type="${t}"]`).first().click().catch(() => undefined);
    for (const [fx, fy] of spots) for (let i = 0; i < 4; i++) await page.touchscreen.tap(box.x + box.width * fx + i * 3, box.y + box.height * fy + i * 2).catch(() => undefined);
  }
  await page.waitForTimeout(6500);
  await page.screenshot({ path: file });
  const end = page.getByRole('button', { name: 'End battle' }).first();
  if (await end.count()) {
    await end.click().catch(() => undefined);
    await page.waitForTimeout(400);
    const confirm = page.getByRole('button', { name: /End|Yes|Confirm/ }).last();
    if (await confirm.count()) await confirm.click().catch(() => undefined);
  }
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  return true;
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const d of devices) {
    const page = await browser.newPage({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, isMobile: !d.name.startsWith('ipad'), hasTouch: true });
    await loadVillage(page);
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
    // The raid last: it changes the village (loot, used army), so reload the showcase first next time.
    if (!(await battleShot(page, join(out, `${d.name}-2-battle.png`)))) console.warn(`${d.name}: no battle screenshot (Attack button not found)`);
    await page.close();
    console.log(`${d.name}: ${screens.length + 1} screenshots (Keep ${keep} village${stateFile ? ' from ' + stateFile : ''})`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`Saved in ${out}. Check each one: store rules forbid misleading screenshots (show real gameplay).`);
