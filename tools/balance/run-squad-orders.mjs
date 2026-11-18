// P6-01: measures whether "hold a reserve" earns a button (see tools/balance/squadOrders.ts). Prints a Markdown table.
// Run: node tools/balance/run-squad-orders.mjs [bases=10]
import { createServer } from 'vite';

const bases = Number(process.argv[2] ?? 10);
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/balance/squadOrders.ts');
  const rows = m.measureSquadOrders([9, 12, 15], bases);
  console.log('| Keep | Bases | Best: tanks | Best: rush | Best: reserve | Mean %: tanks | rush | reserve |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.keep} | ${r.bases} | ${r.bestBy.tanks} | ${r.bestBy.rush} | ${r.bestBy.reserve} | ${r.mean.tanks.toFixed(1)} | ${r.mean.rush.toFixed(1)} | ${r.mean.reserve.toFixed(1)} |`);
  const passes = rows.every((r) => r.bestBy.reserve * 5 >= r.bases);
  console.log(`\nReserve offered: ${passes ? 'yes' : 'no'} (needs best on >= 1 base in 5 at every Keep)`);
} finally {
  await server.close();
}
