import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** Emits sw.js with the list of built files to precache (no plugin dependency needed). */
function serviceWorker(): Plugin {
  return {
    name: 'tk-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = listFiles('public').map((p) => relative('public', p).split('\\').join('/'));
      const files = ['./', ...[...built, ...publicFiles].map((f) => `./${f}`)];
      const source = readFileSync('src/backend/pwa/sw.template.js', 'utf8')
        .replace('__BUILD_ID__', Date.now().toString(36))
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative paths so the same build works on GitHub Pages, any static host, and later inside Capacitor.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  plugins: [serviceWorker()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
