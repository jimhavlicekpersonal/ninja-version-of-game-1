// Read-only loader: Vite SSR over the repo, cache kept in the scratchpad.
import { createRequire } from 'node:module';
const REPO = '/home/user/ninja-version-of-game-1';
const require = createRequire(REPO + '/package.json');
const { createServer } = await import(require.resolve('vite').replace(/dist\/node\/.*$/, 'dist/node/index.js'));
export async function open() {
  const server = await createServer({ root: REPO, configFile: false, cacheDir: new URL('./.vite', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  return { load: (p) => server.ssrLoadModule(p), close: () => server.close() };
}
