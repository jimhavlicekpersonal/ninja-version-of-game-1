// Writes docs/game-theory/PREVIEW_BALANCE.md: the non-live buildings and heroes (src/gameplay/data/planned.json)
// measured against the live game at their Keep levels, for a designer balancing them. Reported only, never gated.
// Run: npm run balance:preview            (all of it, a few minutes)
//      npm run balance:preview -- steam_vent sky_admiral   (only these ids, printed and not written)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const only = process.argv.slice(2);
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/balance/preview.ts');
  // P4-10 (BNL-12): six layouts x five seeds (30 bases a cell; 6 could not tell a working counter from noise).
  const opts = { layouts: ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'], seeds: 5, ...(only.length ? { only } : {}) };
  const md = m.previewMarkdown(m.runBuildingPreview(opts), m.runHeroPreview(opts), opts);
  if (only.length) process.stdout.write(md);
  else {
    mkdirSync('docs/game-theory', { recursive: true });
    writeFileSync('docs/game-theory/PREVIEW_BALANCE.md', md);
    console.log('wrote docs/game-theory/PREVIEW_BALANCE.md');
  }
} finally {
  await server.close();
}
