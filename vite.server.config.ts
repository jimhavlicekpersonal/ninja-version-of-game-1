import { defineConfig } from 'vite';

/**
 * Bundles the PvP server for Node: dist-server/main.js (the API) and
 * dist-server/migrate.js (the release step that applies database migrations).
 */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: {
      input: { main: 'server/main.ts', migrate: 'server/migrateMain.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', format: 'es' },
    },
  },
});
