import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Bundles the PvP server for Node: dist-server/main.js (the API),
 * dist-server/migrate.js (the release step that applies database migrations)
 * and dist-server/bench.js (the re-simulation benchmark, roadmap step 18).
 */
export default defineConfig({
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    ssr: true,
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: {
      input: { main: 'server/main.ts', migrate: 'server/migrateMain.ts', bench: 'server/benchMain.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', format: 'es' },
    },
  },
});
