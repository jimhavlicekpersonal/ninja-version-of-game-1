// tools/balance/preview.ts runBuildingPreview on 12 bases per cell (6 layouts x 2 seeds) instead of the report's 6.
import { open } from './load.mjs';
const s = await open();
try {
  const m = await s.load('/tools/balance/preview.ts');
  const ids = process.argv.slice(2);
  const opts = { layouts: ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'], seeds: Number(process.env.SEEDS ?? 2), only: ids };
  for (const id of ids) {
    const t0 = Date.now();
    const rows = m.runBuildingPreview({ ...opts, only: [id] });
    for (const r of rows) console.log(`${r.id.padEnd(22)} K${String(r.keep).padEnd(3)} ${r.army.padEnd(9)} base ${r.base.toFixed(1).padStart(5)} with ${r.withIt.toFixed(1).padStart(5)} body ${r.bodyOnly.toFixed(1).padStart(5)}  dBuilding ${(r.withIt - r.base >= 0 ? '+' : '') + (r.withIt - r.base).toFixed(1)}  dEffect ${(r.withIt - r.bodyOnly >= 0 ? '+' : '') + (r.withIt - r.bodyOnly).toFixed(1)}  events ${r.events.toFixed(1)}`);
    console.error(`${id} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally { await s.close(); }
