// P6-18: checks the live buildings' counter lists in battle (tools/balance/counterCheck.ts). Prints Markdown.
// Run: node tools/balance/run-counter-check.mjs [seeds=6]
import { createServer } from 'vite';

const seeds = Number(process.argv[2] ?? 6);
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/balance/counterCheck.ts');
  const rows = m.counterCheck(seeds);
  console.log('| Building | Keep | Warrior | Listed as | Effect on % | Effect off % | Δ effect | Bases |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.building} | ${r.keep} | ${r.troop} | ${r.side === 'counters' ? 'it counters' : 'counters it'} | ${r.on.toFixed(1)} | ${r.off.toFixed(1)} | ${r.delta.toFixed(1)} | ${r.n} |`);
  console.log('\nConfirmed (an "it counters" warrior loses more to the effect than the mean "counters it" warrior of the same building):');
  for (const b of [...new Set(rows.map((r) => r.building))]) {
    const mine = rows.filter((r) => r.building === b);
    const ref = mine.filter((r) => r.side === 'counteredBy');
    const refMean = ref.length ? ref.reduce((a, r) => a + r.delta, 0) / ref.length : 0;
    const ok = mine.filter((r) => r.side === 'counters' && r.delta < refMean && r.delta < 0).map((r) => r.troop);
    const no = mine.filter((r) => r.side === 'counters' && !(r.delta < refMean && r.delta < 0)).map((r) => r.troop);
    console.log(`- ${b}: confirmed ${ok.join(', ') || '(none)'}; not confirmed ${no.join(', ') || '(none)'} (reference ${refMean.toFixed(1)})`);
  }
} finally {
  await server.close();
}
