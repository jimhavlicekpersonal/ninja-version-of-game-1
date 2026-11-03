// Writes docs/game-theory/ARMY_BALANCE.md: equal-housing army compositions fought
// across Keeps, layouts and seeds with real battles. Run: npm run balance:armies
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/balance/armyLab.ts');
  const opts = { keeps: [4, 6, 8, 10, 12, 15], layouts: ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'], seeds: 3, compareCounters: true };
  const rows = m.runLab(opts);
  mkdirSync('docs/game-theory', { recursive: true });
  writeFileSync('docs/game-theory/ARMY_BALANCE.md', m.labMarkdown(rows, opts));
  console.log(`wrote ARMY_BALANCE.md (${rows.length} cells)`);
} finally {
  await server.close();
}
