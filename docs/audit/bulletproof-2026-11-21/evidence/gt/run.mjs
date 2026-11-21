import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/scratch/gt.ts');
  const what = process.argv[2];
  const t0 = Date.now();
  console.log(what === 'trials' ? m.trials(Number(process.argv[3] ?? 64)) : m.luck());
  console.log('ms', Date.now() - t0);
} finally { await server.close(); }
