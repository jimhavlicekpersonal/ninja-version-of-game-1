// Scratch runner (read-only against the repo): loads a scratch TS module through vite SSR, cache outside the repo.
import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const mode = process.argv[2];
const here = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: '/home/user/ninja-version-of-game-1', cacheDir: here + '/.vite', server: { middlewareMode: true, hmr: false, ws: false, fs: { strict: false } }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/@fs' + here + '/measure.ts');
  const t0 = Date.now();
  const out = await m.run(mode, process.argv.slice(3));
  console.log(out);
  console.log('seconds', ((Date.now() - t0) / 1000).toFixed(1));
} finally {
  await server.close();
}
