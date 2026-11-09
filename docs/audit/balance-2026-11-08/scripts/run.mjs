// Scratch runner: `node scratch/run.mjs scratch/<file>.ts [args...]`
// Loads a TypeScript module from the project through Vite (same as tools/balance/*.mjs)
// and calls its default export with the remaining argv. Not part of the game.
import { createServer } from 'vite';
import { resolve, relative } from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: node scratch/run.mjs <file.ts> [args...]'); process.exit(2); }
const rel = '/' + relative(process.cwd(), resolve(file)).split('\\').join('/');
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', configFile: false, root: process.cwd() });
try {
  const m = await server.ssrLoadModule(rel);
  const fn = m.default ?? m.main;
  if (typeof fn === 'function') await fn(...process.argv.slice(3));
} finally {
  await server.close();
}
