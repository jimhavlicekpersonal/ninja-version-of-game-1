/** Beast Mode 2026-11-21 STB-10: the bundle budget follows the entry, modulepreloads and stylesheets and sums them. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRITICAL_BUDGET, INDEX_BUDGET, criticalFiles, measure } from '../../tools/perf/bundle-budget.mjs';

const html = `<!doctype html><html><head>
<script>/* inline boot */</script>
<script type="module" crossorigin src="./assets/index-A.js"></script>
<link rel="modulepreload" crossorigin href="./assets/phaser-B.js">
<link rel="modulepreload" crossorigin href="./assets/index-A.js">
<link rel="stylesheet" crossorigin href="./assets/index-C.css">
<link rel="icon" href="./icons/icon.png">
<link rel="modulepreload" href="https://cdn.example.com/x.js">
</head><body></body></html>`;

describe('bundle budget', () => {
  it('lists the entry, each modulepreload once and the stylesheets, never icons or other hosts', () => {
    expect(criticalFiles(html)).toEqual(['assets/index-A.js', 'assets/phaser-B.js', 'assets/index-C.css']);
  });

  it('sums the gzip sizes of the page and its critical files', () => {
    const sizes: Record<string, number> = { 'assets/index-A.js': 50_000, 'assets/phaser-B.js': 30_000, 'assets/index-C.css': 5_000 };
    // Random bytes do not compress, so gzip is about the raw size.
    const read = (f: string) => Uint8Array.from({ length: sizes[f] }, (_, i) => (i * 2654435761) % 251);
    const m = measure(html, read);
    expect(m.files.map((f) => f.file)).toEqual(Object.keys(sizes));
    expect(m.total).toBe(m.index + m.files.reduce((s, f) => s + f.gzip, 0));
    expect(m.files[0].gzip).toBeGreaterThan(m.files[2].gzip);
  });

  it('runs after the build in the web and Android workflows, with STB-08 index budget', () => {
    for (const wf of ['.github/workflows/deploy.yml', '.github/workflows/android.yml']) expect(readFileSync(wf, 'utf8'), wf).toContain('run: node tools/perf/bundle-budget.mjs');
    expect(INDEX_BUDGET).toBeLessThanOrEqual(25_000);
    expect(CRITICAL_BUDGET).toBeLessThanOrEqual(740_000);
  });
});
