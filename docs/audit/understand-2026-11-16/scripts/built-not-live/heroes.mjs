import { open } from './load.mjs';
const s = await open();
try {
  const m = await s.load('/tools/balance/preview.ts');
  const ids = process.argv.slice(2);
  const opts = { layouts: ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'], seeds: Number(process.env.SEEDS ?? 3), only: ids };
  const t0 = Date.now();
  const heroes = m.runHeroPreview(opts);
  console.log(`n=${opts.layouts.length * opts.seeds} bases per cell, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const r of heroes) console.log(`${r.id.padEnd(16)} K${String(r.keep).padEnd(3)} ${r.army.padEnd(18)} none ${r.none.toFixed(1).padStart(5)}  captain ${r.captain.toFixed(1).padStart(5)}  hero ${r.hero.toFixed(1).padStart(5)}  hero-captain ${(r.hero - r.captain >= 0 ? '+' : '') + (r.hero - r.captain).toFixed(1)}  hero-none ${(r.hero - r.none >= 0 ? '+' : '') + (r.hero - r.none).toFixed(1)}  captain-none ${(r.captain - r.none >= 0 ? '+' : '') + (r.captain - r.none).toFixed(1)}`);
} finally { await s.close(); }
