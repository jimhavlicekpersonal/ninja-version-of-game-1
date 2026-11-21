// Beast Mode 2026-11-21 STB-10: a size budget for what the first visit downloads before the game can start: the
// page, its entry script, every modulepreload and the stylesheets it links. Gzip level 9, as served.
//   node tools/perf/bundle-budget.mjs [dist]          after npm run build; exits 1 over budget
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Critical-path gzip budget in bytes (measured 2026-11-21 at ~642,000 plus ~18 KB: 20 KB more fails). */
export const CRITICAL_BUDGET = 660_000;
/** index.html gzip budget (STB-08 brought it to ~12 KB). */
export const INDEX_BUDGET = 25_000;

/** The files the page loads up front: the module entry, modulepreloads and stylesheets, in document order. */
export function criticalFiles(html) {
  const files = [];
  const add = (src) => {
    const clean = src.replace(/^\.?\//, '');
    if (!files.includes(clean) && !/^(https?:)?\/\//.test(src)) files.push(clean);
  };
  for (const m of html.matchAll(/<script\b[^>]*type="module"[^>]*\bsrc="([^"]+)"/g)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*\bhref="([^"]+)"/g)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*\bhref="([^"]+)"/g)) add(m[1]);
  return files;
}

/** Gzip sizes of the page and its critical files; `read(path)` returns a file's bytes. */
export function measure(html, read) {
  const gz = (b) => gzipSync(b, { level: 9 }).length;
  const index = gz(Buffer.from(html));
  const files = criticalFiles(html).map((f) => ({ file: f, gzip: gz(read(f)) }));
  return { index, files, total: index + files.reduce((s, f) => s + f.gzip, 0) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? 'dist';
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const m = measure(html, (f) => readFileSync(join(dist, f)));
  for (const f of m.files) console.log(`${String(Math.round(f.gzip / 1024)).padStart(6)} KB  ${f.file}`);
  console.log(`${String(Math.round(m.index / 1024)).padStart(6)} KB  index.html`);
  console.log(`Critical path: ${Math.round(m.total / 1024)} KB gzip (budget ${Math.round(CRITICAL_BUDGET / 1024)} KB); index.html ${Math.round(m.index / 1024)} KB (budget ${Math.round(INDEX_BUDGET / 1024)} KB).`);
  const over = [m.total > CRITICAL_BUDGET && 'critical path', m.index > INDEX_BUDGET && 'index.html'].filter(Boolean);
  if (over.length) {
    console.error(`::error title=Bundle over budget::${over.join(' and ')} over budget (tools/perf/bundle-budget.mjs). Make it lazy, or raise the budget in the same commit with the reason.`);
    process.exit(1);
  }
}
