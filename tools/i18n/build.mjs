/** Compact shipping catalogs: worksheets and their repeated English never ship.
 * This generator runs before Vite resolves imports, for web and server builds.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, deflateRawSync } from 'node:zlib';
import { checkLanguage, languages, namespaces, source, worksheet } from './lib.mjs';
import { LANGUAGE_ALIASES } from '../../locales/matcher.mjs';
import { buildPages } from './pages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shipKey = (ns, key) => ns === 'data' ? `data.${key}` : key;
function builtSizes() {
  const assets = join(ROOT, 'dist/assets');
  if (!existsSync(assets)) return undefined;
  const files = readdirSync(assets).filter(f => f.endsWith('.js')).map(path => {
    const b = readFileSync(join(assets, path));
    return { path, sha256: createHash('sha256').update(b).digest('hex'), raw: b.length, gzip: gzipSync(b, { level: 9 }).length, brotli: brotliCompressSync(b).length };
  });
  const total = entries => ({ raw: entries.reduce((n,f)=>n+f.raw,0), gzip: entries.reduce((n,f)=>n+f.gzip,0), brotli: entries.reduce((n,f)=>n+f.brotli,0) });
  const result = { files, ...total(files), indexHtmlUtf8: statSync(join(ROOT, 'dist/index.html')).size };
  const baseline = join(ROOT, 'docs/localization/BASELINE_ASSET_SIZE.json');
  if (existsSync(baseline)) {
    const original = JSON.parse(readFileSync(baseline, 'utf8'));
    const old = total(original.files.filter(f => f.path.endsWith('.js')));
    result.baseline = { ref: original.ref, ...old };
    result.delta = { raw: result.raw - old.raw, gzip: result.gzip - old.gzip, brotli: result.brotli - old.brotli };
    result.note = 'All JavaScript, including shared English fallback/formatters and engine code. Baseline includes 49 empty UI worksheet chunks removed by compact packs. This is not the isolated cost of Spanish.';
  }
  return result;
}
/** Called after the client build, when the final artifact bytes exist. */
export function measureLanguageBuild() {
  const path = join(ROOT, 'docs/localization/SPANISH_SIZE.json');
  const report = JSON.parse(readFileSync(path, 'utf8'));
  report.builtJavaScript = { phase: 'after_client_build', ...builtSizes() };
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  return report;
}
export function languageBootScript() {
  const available = JSON.parse(readFileSync(join(ROOT, 'locales/availability.json'), 'utf8'));
  const all = languages().languages;
  const aliases = { ...LANGUAGE_ALIASES };
  for (const l of all) for (const a of l.alsoFor ?? []) aliases[a.toLowerCase()] = l.code;
  const sources = JSON.parse(readFileSync(join(ROOT, 'locales/messages.sources.json'), 'utf8'));
  const mainKeys = Object.keys(sources).filter(k => sources[k].sources.some(s => s.file === 'src/main.ts' && s.line >= 780));
  const bootAvailable = Object.fromEntries(Object.entries(available).filter(([, v]) => v.ready).map(([k, v]) => [k, { ready: true, path: v.path }]));
  const tables = {};
  for (const l of all.filter(l => available[l.code]?.ready)) {
    const pack = JSON.parse(readFileSync(join(ROOT, 'locales/compiled', `${l.code}.json`), 'utf8'));
    const keys = [...Object.keys(source('boot')), ...mainKeys];
    tables[l.code] = Object.fromEntries(keys.filter(k => pack[k]).map(k => [k, pack[k]]));
  }
  const matcher = readFileSync(join(ROOT, 'locales/matcher.mjs'), 'utf8').replace(/^export /gm, '');
  return `(function(w,d){${matcher}\nvar available=${JSON.stringify(bootAvailable)},tables=${JSON.stringify(tables)},en=tables.en,aliases=${JSON.stringify(aliases)},codes=[],pref=null,i;for(var c in available)if(available[c].ready)codes.push(c);try{pref=w.localStorage.getItem('tk.lang');}catch(e){}var code=pref&&available[pref]&&available[pref].ready?pref:matchLanguage(w.navigator.languages||[w.navigator.language],codes,aliases);var lang=${JSON.stringify(Object.fromEntries(all.filter(l => available[l.code]?.ready).map(l => [l.code, { dir: l.dir, script: l.script }])))}[code];d.documentElement.lang=code;d.documentElement.dir=lang.dir;d.documentElement.setAttribute('data-script',lang.script);var boot=tables[code]||tables.en||{};w.__kgLocale={code:code,boot:boot};w.__kgTranslateBoot=function(s){for(var k in en)if(en[k]===s&&boot[k])return boot[k];return s;};function paint(){var el=d.querySelector('.boot-status');if(el)el.textContent=boot['boot.loading']||en['boot.loading'];}if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',paint);else paint();if(code!=='en'&&w.fetch&&w.Promise){var ac=w.AbortController?new w.AbortController():null,timer=ac?w.setTimeout(function(){ac.abort();},30000):null;w.__kgLocale.pack=w.fetch(available[code].path,{signal:ac?ac.signal:undefined}).then(function(r){if(!r.ok)throw new Error('language unavailable');return r.json();}).then(function(v){if(timer)w.clearTimeout(timer);return v;},function(){if(timer)w.clearTimeout(timer);return null;});}})(window,document);`;
}
export function buildLanguageAssets() {
  const publicDir = join(ROOT, 'public/lang');
  const compiledDir = join(ROOT, 'locales/compiled');
  mkdirSync(publicDir, { recursive: true }); mkdirSync(compiledDir, { recursive: true });
  for (const f of readdirSync(publicDir)) if (f.endsWith('.json')) rmSync(join(publicDir, f));
  const available = {};
  const report = { schema: 1, units: 'bytes', measured: {}, projections: {}, decision: 'Bundle every completed language in native installs; the web caches only the chosen language. No extra font is needed for Spanish.' };
  const nsList = namespaces();
  const gameNamespaces = nsList.filter(ns => !['pages', 'store'].includes(ns));
  const en = Object.fromEntries(gameNamespaces.flatMap(ns => Object.entries(source(ns)).map(([k, v]) => [shipKey(ns, k), v])));
  for (const lang of languages().languages) {
    const pack = {};
    const perNamespace = {};
    let total = 0, done = 0;
    for (const ns of nsList) {
      const src = source(ns); const ws = lang.code === 'en' ? null : worksheet(lang.code, ns);
      let filled = 0;
      for (const [k, english] of Object.entries(src)) {
        const text = lang.code === 'en' ? english : ws?.[k]?.en === english ? ws[k].text : '';
        if (text) { filled++; if (gameNamespaces.includes(ns)) pack[shipKey(ns, k)] = text; }
      }
      total += Object.keys(src).length; done += filled;
      perNamespace[ns] = { total: Object.keys(src).length, translated: filled };
    }
    const errors = lang.code === 'en' ? [] : checkLanguage(lang).errors;
    const ready = total > 0 && done === total && !errors.length;
    const bytes = Buffer.from(JSON.stringify(pack));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const filename = `${lang.code}-${hash}.json`;
    const path = `lang/${filename}`;
    available[lang.code] = { coverage: total ? done / total : 0, ready, hash, keys: Object.keys(pack).length, ...(lang.code !== 'en' && done ? { path } : {}), namespaces: perNamespace };
    if (done) {
      writeFileSync(join(compiledDir, `${lang.code}.json`), JSON.stringify(pack));
      if (lang.code !== 'en') writeFileSync(join(publicDir, filename), bytes);
      report.measured[lang.code] = { ready, strings: Object.keys(pack).length, installedUtf8: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length, zipDeflatePayload: deflateRawSync(bytes, { level: 9 }).length, namespaces: perNamespace };
      if (ready && lang.code !== 'en') {
        buildPages(lang.code);
        const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
        writeFileSync(join(ROOT, `public/${lang.code}/manifest.webmanifest`), JSON.stringify({ ...manifest, lang: lang.code, description: pack['boot.pwaDescription'], id: '../', start_url: '../', scope: '../', icons: manifest.icons.map(i => ({ ...i, src: '../' + i.src })) }, null, 2) + '\n');
      }
    }
  }
  writeFileSync(join(ROOT, 'locales/availability.json'), JSON.stringify(available, null, 2) + '\n');
  writeFileSync(join(publicDir, 'manifest.json'), JSON.stringify(available));
  // English is already embedded as a fallback; there is no redundant en fetch.
  writeFileSync(join(compiledDir, 'en.json'), JSON.stringify(en));
  const spanish = report.measured.es;
  if (spanish?.ready) {
    const files = [available.es.path, ...readdirSync(join(ROOT, 'public/es')).filter(f => /\.(html|webmanifest)$/.test(f)).map(f => `es/${f}`)].map(p => ({ path: `public/${p}`, buffer: readFileSync(join(ROOT, 'public', p)) }));
    for (const path of ['ios/App/App/es.lproj/InfoPlist.strings', 'android/app/src/main/res/values-es/strings.xml', 'android/app/src/main/res/xml/locales_config.xml']) files.push({ path, buffer: readFileSync(join(ROOT, path)) });
    const details = files.map(({ path, buffer }) => ({ path, installedUtf8: buffer.length, gzip: gzipSync(buffer, { level: 9 }).length, brotli: brotliCompressSync(buffer).length, deflate: deflateRawSync(buffer, { level: 9 }).length }));
    // Exact size of a deterministic ZIP with these UTF-8 paths, deflate level 9,
    // no comments/extra fields/data descriptors (30+46 header bytes per file).
    const zipArchive = 22 + details.reduce((n, f) => n + f.deflate + 76 + 2 * Buffer.byteLength(f.path), 0);
    spanish.packagedAssets = { files: details, installedUtf8: details.reduce((n, f) => n + f.installedUtf8, 0), gzipSum: details.reduce((n, f) => n + f.gzip, 0), brotliSum: details.reduce((n, f) => n + f.brotli, 0), zipArchive, extraFontBytes: 0, excludes: ['Shared English fallback and localization code (measured in built JS separately)', 'Server-only deletion HTML and translated store listing/product copy', 'Filesystem allocation, browser caches, app-store binary signing and packaging overhead'] };
    const serverPages = JSON.parse(readFileSync(join(ROOT, 'locales/compiled/pages-es.json'), 'utf8'));
    spanish.serverDeletionPageUtf8 = Buffer.byteLength(serverPages.account);
  }
  if (spanish) for (const factor of [1, 1.5, 2]) report.projections[`50_languages_at_${factor}x_spanish`] = {
    estimate: true, basis: 'Complete Spanish client text pack, six public pages, PWA manifest and locale resources multiplied by 50 and the stated expansion factor. English is already embedded, so this intentionally overestimates 49 added packs. The other 48 target languages are not translated or measured; fonts use the existing OS fallback policy.',
    installedUtf8: Math.ceil((spanish.packagedAssets?.installedUtf8 ?? spanish.installedUtf8) * 50 * factor), gzip: Math.ceil((spanish.packagedAssets?.gzipSum ?? spanish.gzip) * 50 * factor), brotli: Math.ceil((spanish.packagedAssets?.brotliSum ?? spanish.brotli) * 50 * factor), zipArchive: Math.ceil((spanish.packagedAssets?.zipArchive ?? spanish.zipDeflatePayload) * 50 * factor),
  };
  if (existsSync(join(ROOT, 'dist/assets'))) report.builtJavaScript = { phase: 'existing_dist_before_build', ...builtSizes() };
  mkdirSync(join(ROOT, 'docs/localization'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/localization/SPANISH_SIZE.json'), JSON.stringify(report, null, 2) + '\n');
  return { available, report };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = buildLanguageAssets();
  if (!process.argv.includes('--quiet')) process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
}
