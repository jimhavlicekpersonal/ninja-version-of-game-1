// Writes docs/game-theory/ROSTER.md and docs/art/ICON_MANIFEST.{json,md} from the progression model.
// Uses Vite's own module loader, so no extra dependency is needed. Run: npm run docs:progression
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/progression/report.ts');
  const icons = m.iconManifest();
  mkdirSync('docs/game-theory', { recursive: true });
  mkdirSync('docs/art', { recursive: true });
  writeFileSync('docs/game-theory/ROSTER.md', m.rosterMarkdown());
  writeFileSync('docs/art/ICON_MANIFEST.json', JSON.stringify({ generated: 'npm run docs:progression', count: icons.length, icons }, null, 2) + '\n');
  writeFileSync('docs/art/ICON_MANIFEST.md', m.iconMarkdown(icons));
  console.log(`wrote ROSTER.md and ${icons.length} icons`);
} finally {
  await server.close();
}
