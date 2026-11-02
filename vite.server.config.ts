import { defineConfig } from 'vite';

/** Bundles the PvP server (server/main.ts) into dist-server/main.js for Node. */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'main.js', format: 'es' } },
  },
});
