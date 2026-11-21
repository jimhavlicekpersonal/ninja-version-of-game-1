// Verify the deployed Pages URL, including the exact completed language packs.
// Run after deploy-pages; a successful artifact upload alone does not prove the
// normal URL serves the new game. GAME_URL is the deployment's page_url output.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { pageLanguageProblem } from './page-language.mjs';

const base = new URL(process.env.GAME_URL || 'http://missing-game-url.invalid/');
assert.ok(process.env.GAME_URL, 'GAME_URL must be the published game URL');
if (!base.pathname.endsWith('/')) base.pathname += '/';
const languages = JSON.parse(readFileSync('locales/availability.json', 'utf8'));
const ready = Object.entries(languages).filter(([code, meta]) => code !== 'en' && meta.ready);

async function get(path) {
  const url = new URL(path, base);
  // Avoid a stale CDN homepage when checking the just-published revision.
  url.searchParams.set('release', process.env.GITHUB_SHA || 'verification');
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
  return response.text();
}

async function verify() {
  const html = await get('./');
  const entry = /<script\b[^>]*\bsrc="([^"]+\.js)"/.exec(html)?.[1];
  assert.ok(entry, 'Published HTML must reference the built game module');
  assert.ok((await get(entry)).length > 1000, 'The published game module is empty');
  // Beast Mode SEC-10: the page carries a Content-Security-Policy that allows exactly its inline scripts.
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'Published HTML must carry a Content-Security-Policy meta tag');
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
    assert.ok(csp.includes(hash), `The Content-Security-Policy does not allow an inline script (${hash})`);
  }
  const worker = await get('sw.js');
  for (const [code, meta] of ready) {
    assert.ok(html.includes(meta.path), `First-frame language table missing ${code}`);
    const raw = await get(meta.path);
    assert.equal(createHash('sha256').update(raw).digest('hex').slice(0, 16), meta.hash, `${code}: wrong published language pack`);
    const pack = JSON.parse(raw);
    assert.equal(Object.keys(pack).length, meta.keys, `${code}: incomplete language pack`);
    assert.ok(Object.values(pack).every(value => typeof value === 'string' && value.length), `${code}: empty translations`);
    assert.ok(worker.includes(meta.path), `${code}: service worker omits the language pack`);
    const manifest = JSON.parse(await get(`${code}/manifest.webmanifest`));
    assert.equal(manifest.lang, code);
    for (const page of readdirSync(`public/${code}`).filter(file => file.endsWith('.html'))) {
      const problem = pageLanguageProblem(await get(`${code}/${page}`), code);
      assert.equal(problem, null, `${code}/${page}: wrong language (${problem})`);
    }
  }
  console.log(`Verified published game, service worker and ${ready.length} translated language pack(s)/pages at ${base}`);
}

for (let attempt = 1; ; attempt++) {
  try { await verify(); break; }
  catch (error) {
    if (attempt === 6) throw error;
    console.log(`Published assets not ready (attempt ${attempt}/6): ${error.message}; retrying in 5 seconds.`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
