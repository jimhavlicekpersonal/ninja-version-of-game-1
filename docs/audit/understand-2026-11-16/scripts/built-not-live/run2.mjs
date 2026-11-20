import { createServer } from '/home/user/ninja-version-of-game-1/node_modules/vite/dist/node/index.js';
const here = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
const server = await createServer({ root: '/home/user/ninja-version-of-game-1', cacheDir: here + '/.vite2', server: { middlewareMode: true, hmr: false, ws: false, fs: { strict: false } }, appType: 'custom', logLevel: 'error' });
try { const m = await server.ssrLoadModule('/@fs' + here + '/' + process.argv[2]); console.log(await m.run(process.argv.slice(3))); } finally { await server.close(); }
