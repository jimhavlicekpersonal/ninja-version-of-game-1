/** Built Spanish client: panels, immutable identities, switching and offline launch.
 * npm run build && node tools/i18n/smoke.mjs (Playwright + Chromium required).
 * Optional CHROMIUM_PATH and I18N_SMOKE_OUT. Evidence is outside shipping assets.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.env.I18N_SMOKE_OUT || '/tmp/kagemura-spanish-smoke';
mkdirSync(out, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.webmanifest':'application/manifest+json' };
const dist = join(root, 'dist');
const server = createServer((req,res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = join(dist, path === '/' ? 'index.html' : path);
  if (!file.startsWith(dist + '/') || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'}).end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';
let browser;
const evidence = { schema:1, language:'es', checkedAt:new Date().toISOString(), panels:[], widths:[], errors:[], requests:[], offline:false, switchPreservesIdentity:false };
try {
  const vite = await createVite({root, server:{middlewareMode:true, hmr:false}, appType:'custom', logLevel:'error'});
  let village;
  try { village = (await vite.ssrLoadModule('/tools/store/showcaseVillage.ts')).showcaseVillage(10,4210,Date.now()); }
  finally { await vite.close(); }
  village.profile.ageBand = 'adult';
  village.trials.best = 1;
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ ...(executablePath ? {executablePath} : {}), args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({locale:'es-MX', viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
  const page = await context.newPage();
  page.on('pageerror', e => evidence.errors.push(e.message));
  page.on('request', r => {if(r.url().includes('/lang/')) evidence.requests.push(new URL(r.url()).pathname);});
  await page.goto(origin + '?debug');
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  assert.ok(!(await page.locator('.boot-status').innerText()).includes('Lighting the lanterns'));
  await page.waitForFunction(() => !!window.tk?.controller, null, {timeout:45000});
  await page.evaluate(async v => { await window.tk.controller.replace(v); localStorage.setItem('tk.notifyAsked','1'); localStorage.setItem('tk.ageAskedAfterTutorial','1'); }, village);
  const ready = async () => {
    await page.waitForFunction(() => !!window.tk?.controller, null, {timeout:45000});
    await page.waitForSelector('#boot.done', {timeout:60000});
    for(let i=0;i<4;i++) await page.keyboard.press('Escape');
  };
  await page.reload(); await ready();
  if (await page.locator('.rail-toggle').getAttribute('aria-expanded') === 'false') await page.locator('.rail-toggle').click();
  for(const id of ['settings','army','build','store','daily','events','pass','goals','alliance','friends','trials','log']) {
    for(let i=0;i<3;i++) await page.keyboard.press('Escape');
    const button = page.locator('button[data-id="' + id + '"]');
    // Friends is hidden offline; exercise its existing disconnected state explicitly.
    if(id==='friends') await page.evaluate(() => window.tk.app.d.hud.openFriends());
    else { assert.ok(await button.isVisible(), id); await button.click(); }
    if(id==='alliance') {
      const join = page.getByRole('button',{name:'Unirse a una Alianza de Entrenamiento', exact:true});
      if(await join.count()) await join.click();
    }
    await page.waitForTimeout(100);
    const text = await page.locator('.modal-backdrop:last-child').innerText();
    assert.ok(!/rail\.[A-Z]|\{arg\d+\}|Training Alliance|Offline play|On the web,/.test(text),id);
    evidence.panels.push(id);
    writeFileSync(join(out, id + '.txt'),text);
    const tabs = page.locator('.modal-backdrop:last-child .shop-tabs button');
    const count = await tabs.count();
    for(let i=0;i<count;i++) {
      await tabs.nth(i).click(); await page.waitForTimeout(60);
      writeFileSync(join(out,id + '-tab' + i + '.txt'), await page.locator('.modal-backdrop:last-child').innerText());
    }
    if(id==='army') {
      const overflow = await page.locator('.army-actions .btn:visible').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));
      assert.deepEqual(overflow, []);
    }
    if(id==='army') await page.screenshot({path:join(out,'army-es.png')});
  }
  for(let i=0;i<3;i++) await page.keyboard.press('Escape');
  for(const [width,height] of [[320,568],[360,640],[390,844],[568,320],[844,390]]) {
    await page.setViewportSize({width,height});
    const bounds = await page.locator('.hud-bottom button:visible').evaluateAll(es => es.map(e => {
      const r=e.getBoundingClientRect(); return {id:e.dataset.id,x:r.x,right:r.right,width:r.width,height:r.height};
    }));
    for(const b of bounds) {
      assert.ok(b.x>=-1 && b.right<=width+1,JSON.stringify({width,b}));
      assert.ok(b.width>=43 && b.height>=43);
    }
    await page.locator('[data-id="build"]').click();
    assert.ok((await page.locator('.modal-backdrop:last-child').innerText()).startsWith('Construir'));
    await page.keyboard.press('Escape');
    evidence.widths.push({width,height,buttons:bounds.length,buildTapped:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-id="attack"]').click();
  await page.waitForSelector('.b-name');
  const scout = await page.locator('.b-name').innerText();
  assert.ok(!/Moon Veil|Iron Tide|Crimson Lotus/.test(scout));
  await page.getByRole('button',{name:'Inicio',exact:true}).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await ready();
  const cachedLanguages = await page.evaluate(async () => { const names = await caches.keys(); const requests = (await Promise.all(names.map(async n => (await caches.open(n)).keys()))).flat(); return requests.map(r=>new URL(r.url).pathname).filter(p=>p.includes('/lang/')); });
  assert.ok(cachedLanguages.some(p=>/\/lang\/es-/.test(p)));
  assert.ok(cachedLanguages.every(p=>/\/lang\/es-/.test(p)));
  evidence.cachedLanguages = cachedLanguages;
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('tk.lang.pack:')) localStorage.removeItem(k); });
  await context.setOffline(true);
  await page.reload(); await ready();
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.locator('[data-id="store"]').click();
  assert.ok((await page.locator('.modal-backdrop:last-child').innerText()).includes('Tienda'));
  evidence.offline = true;
  await context.setOffline(false);
  await page.keyboard.press('Escape');
  const identity = await page.evaluate(() => window.tk.controller.state.buildings.map(b => [b.id,b.type,b.level,b.x,b.y]));
  await page.locator('[data-id="settings"]').click();
  await page.getByLabel('Idioma',{exact:true}).selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang==='en'); await ready();
  assert.deepEqual(await page.evaluate(() => window.tk.controller.state.buildings.map(b => [b.id,b.type,b.level,b.x,b.y])),identity);
  evidence.switchPreservesIdentity = true;
  // A failed language fetch keeps the working preference and current UI.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tk.lang.pack:')) localStorage.removeItem(k);
    const original = window.fetch;
    window.fetch = (input, options) => String(input).includes('/lang/es-') ? Promise.reject(new TypeError('synthetic offline')) : original(input, options);
  });
  await page.locator('[data-id="settings"]').click();
  await page.getByLabel('Language',{exact:true}).selectOption('es');
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Language"]').disabled);
  assert.equal(await page.evaluate(() => localStorage.getItem('tk.lang')), 'en');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  evidence.failedSwitchPreservesPreference = true;
  assert.deepEqual(evidence.errors,[]);
  assert.ok(evidence.requests.every(p=>/\/lang\/es-/.test(p)));
  await context.close();
  writeFileSync(join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
