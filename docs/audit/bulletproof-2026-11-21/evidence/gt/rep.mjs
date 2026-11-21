import { createServer } from 'vite';
const [id, rep] = [process.argv[2], Number(process.argv[3])];
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/balance/campaign.ts');
  const spec = m.CAMPAIGNS.find((c) => c.id === id);
  const r = m.runCampaign({ ...spec, opts: { ...spec.opts, rep } });
  const k = (n) => r.byKeep.find((x) => x.keep === n) ?? {};
  process.stdout.write(JSON.stringify({ id, rep, k12: r.reached[12], k15: r.reached[15], k6: r.reached[6], stolenRatio: r.totals.stolen / r.totals.looted, k14: { s: k(14).stars, w: k(14).won, t: k(14).threeStar, n: k(14).raids }, k15r: { s: k(15).stars, w: k(15).won, t: k(15).threeStar, n: k(15).raids, held: k(15).held }, k3: k(3).stars, rows: r.byKeep.map((x) => [x.keep, x.raids, +x.stars.toFixed(2), +x.won.toFixed(2), +x.threeStar.toFixed(2)]) }) + '\n');
} finally { await server.close(); }
